/**
 * Meal-photo nutrition estimation in the browser.
 *
 * A drop-in module for the SnapCare app: copy it to `lib/nutrition/` and serve
 * the exported `.onnx` and `.json` from `public/models/`. It is kept here, next
 * to the training code, because it is the other half of `export_onnx.py` — the
 * two have to agree about preprocessing, and keeping them in one directory is
 * what makes that checkable.
 *
 * Why this exists beside the vision model
 * ---------------------------------------
 * Meal-photo recognition currently needs a network call. That is the one part
 * of SnapCare that stops working where infrastructure does, which is precisely
 * where it is most needed. This runs the estimate on the device: no key, no
 * request, no round trip, and nothing about the photograph leaves the phone.
 *
 * It answers a narrower question than the vision model does. It does not
 * identify the dish or name an ingredient; it regresses five numbers — energy,
 * mass, fat, carbohydrate, protein — from the picture. So the sensible
 * arrangement is this first, with the network model as an optional refinement
 * when there is a network and a key.
 *
 * What it is not
 * --------------
 * An estimate from a photograph, with the error bars to match. Measured on the
 * Nutrition5k test split it is roughly 19% mean absolute error on calories.
 * That is genuinely useful for "is this meal within today's budget" and is not
 * a substitute for a label. It must go through the same validation and be
 * surfaced with the same "estimate" framing as every other number in the app.
 *
 * Usage
 * -----
 *     const model = await MealModel.load('/models/web.json');
 *     const nutrition = await model.estimate(imageBitmap);
 *     // { calories: 412, mass: 233, fat: 14.2, carb: 51.0, protein: 18.6 }
 */

/** What `export_onnx.py` writes beside the graph. */
export interface ModelManifest {
  name: string;
  backbone: string;
  targets: string[];
  units: Record<string, string>;
  input: {
    name: string;
    layout: 'NCHW';
    colour: 'RGB';
    range: [number, number];
    img_size: number;
    resize_shorter_side_to: number;
  };
  output: { name: string };
  artifacts: Record<string, { file: string; size_mb: number; test_mean_mae_pct?: number }>;
}

export type Nutrition = Record<string, number>;

type OrtModule = typeof import('onnxruntime-web');

export interface LoadOptions {
  /** Prefer the quantized graph. Four times smaller; check the manifest for its cost. */
  quantized?: boolean;
  /** Supply onnxruntime-web yourself if the app already bundles it. */
  ort?: OrtModule;
}

export class MealModel {
  private constructor(
    private readonly session: import('onnxruntime-web').InferenceSession,
    private readonly ort: OrtModule,
    readonly manifest: ModelManifest,
  ) {}

  /**
   * Fetch the manifest and the graph it points at.
   *
   * The manifest is loaded first and the artifact path is taken from it, so
   * the filename lives in one place. Hard-coding it here would make renaming
   * an export a silent 404 at the moment a user photographs their dinner.
   */
  static async load(manifestUrl: string, options: LoadOptions = {}): Promise<MealModel> {
    const ort = options.ort ?? ((await import('onnxruntime-web')) as OrtModule);

    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`model manifest ${manifestUrl}: ${response.status}`);
    const manifest = (await response.json()) as ModelManifest;

    const artifact =
      (options.quantized ? manifest.artifacts.int8 : undefined) ?? manifest.artifacts.float32;
    if (!artifact) throw new Error('manifest lists no usable artifact');

    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    const session = await ort.InferenceSession.create(base + artifact.file, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    return new MealModel(session, ort, manifest);
  }

  /** Five numbers in physical units, keyed by the manifest's target names. */
  async estimate(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement): Promise<Nutrition> {
    const pixels = this.preprocess(source);
    const { img_size } = this.manifest.input;

    const input = new this.ort.Tensor('float32', pixels, [1, 3, img_size, img_size]);
    const output = await this.session.run({ [this.manifest.input.name]: input });
    const values = output[this.manifest.output.name].data as Float32Array;

    const result: Nutrition = {};
    this.manifest.targets.forEach((name, i) => {
      result[name] = values[i];
    });
    return result;
  }

  /**
   * Photograph -> the tensor the graph expects.
   *
   * This is the *entire* preprocessing contract. ImageNet normalization and
   * the de-standardization of the outputs are both inside the ONNX graph, so
   * there are no training constants duplicated in this file — which is the
   * point, because a wrong mean here would not throw. It would return
   * plausible numbers that are quietly wrong on a screen telling someone
   * whether their meal fits their day.
   *
   * What is left is geometry, and it has to match `build_transforms(train=False)`:
   * scale the shorter side to `resize_shorter_side_to`, centre crop to
   * `img_size`. Cropping differently changes how much of the plate is in
   * frame, and the model reads portion size from exactly that.
   */
  private preprocess(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement): Float32Array {
    const { img_size: size, resize_shorter_side_to: resizeTo } = this.manifest.input;

    // An HTMLImageElement has both `width` and `naturalWidth`, and they are not
    // the same thing: `width` is the laid-out size, which is 0 for an image
    // that was never inserted into the document and is the CSS size for one
    // that was. Either would silently change the crop — and the crop is how
    // much of the plate the model sees, which is how it judges portion size.
    // ImageBitmap and HTMLCanvasElement have no `naturalWidth`, so fall through.
    const asImage = source as HTMLImageElement;
    const sw = asImage.naturalWidth || source.width;
    const sh = asImage.naturalHeight || source.height;
    if (!sw || !sh) throw new Error('image has no dimensions yet — await decode() first');

    const scale = resizeTo / Math.min(sw, sh);
    const rw = Math.max(1, Math.round(sw * scale));
    const rh = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('could not get a 2d context');

    // Draw resized and centre-cropped in one step, rather than resizing into a
    // second canvas and cropping that. One resample instead of two.
    ctx.drawImage(source, Math.round((rw - size) / 2) / scale, Math.round((rh - size) / 2) / scale,
                  size / scale, size / scale, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    const out = new Float32Array(3 * size * size);
    const plane = size * size;
    // RGBA interleaved -> planar RGB in [0,1]. The alpha channel is dropped;
    // a photograph has none, and a transparent PNG would be nonsense here.
    for (let i = 0, p = 0; p < plane; i += 4, p++) {
      out[p] = data[i] / 255;
      out[plane + p] = data[i + 1] / 255;
      out[2 * plane + p] = data[i + 2] / 255;
    }
    return out;
  }
}

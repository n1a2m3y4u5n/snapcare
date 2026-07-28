package app.snapcare.mealcam

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import kotlin.math.min
import kotlin.math.round

/**
 * Photograph -> the tensor the graph expects.
 *
 * This is the entire preprocessing contract, and it is the same one
 * `web/mealModel.ts` implements for the browser. ImageNet normalization and the
 * de-standardization of the five outputs both live *inside* the ONNX graph, so
 * no training constant is duplicated here — which is the point, because a wrong
 * mean would not throw. It would return plausible numbers that are quietly
 * wrong on a screen telling someone whether their meal fits their day.
 *
 * What is left is geometry, and it has to match `build_transforms(train=False)`
 * in `data/dataset.py`: scale the shorter side to `resizeShorterSideTo`, then
 * centre crop to `size`. Cropping differently changes how much of the plate is
 * in frame, and portion size is read from exactly that.
 */
object Preprocess {

    /**
     * Decode a captured JPEG, upright, without reading more pixels than the
     * crop can use.
     *
     * `inSampleSize` is not an optimisation detail here. A full-resolution
     * decode of a 12 MP capture is ~48 MB of bitmap that is then thrown away to
     * produce 224x224, and on a low-end phone that allocation is the difference
     * between an estimate and an OutOfMemoryError.
     *
     * It does cost something. The reference resize is a single filtered step,
     * and subsampling first makes it two, which is not the same function. So
     * [floorShorterSide] is set high enough that the decoder only ever takes a
     * mild power-of-two reduction and the triangle filter in [Resample] still
     * does the real work; `parity_check.py --phone-scale` measures what remains.
     */
    fun decodeCapture(jpeg: ByteArray, rotationDegrees: Int, floorShorterSide: Int): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, bounds)

        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(min(bounds.outWidth, bounds.outHeight), floorShorterSide)
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, options)
            ?: throw IllegalArgumentException("capture was not a decodable image")

        if (rotationDegrees % 360 == 0) return decoded

        // CameraX reports the rotation the sensor was at rather than baking it
        // in. Skipping this would feed the model a sideways plate, which it has
        // no reason to handle: the training frames are all upright.
        val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
        val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (upright !== decoded) decoded.recycle()
        return upright
    }

    /** Largest power-of-two subsample that still leaves [minShorterSide] pixels on the shorter side. */
    private fun sampleSizeFor(shorterSide: Int, minShorterSide: Int): Int {
        var sample = 1
        while (shorterSide / (sample * 2) >= minShorterSide) sample *= 2
        return sample
    }

    /**
     * Resize-shorter-side then centre-crop, as one resample, into planar RGB in [0,1].
     *
     * The geometry follows `transforms.Resize(258)` + `CenterCrop(224)` exactly,
     * including two details that look like noise and are not:
     *
     *  - `Resize(int)` scales the *shorter* side to the target and **truncates**
     *    the longer one, so the two axes end up with slightly different scale
     *    factors. They are carried separately below.
     *  - `CenterCrop` computes its offset with Python's `round`, which breaks
     *    ties towards the *even* integer rather than upwards. `kotlin.math.round`
     *    is the one Kotlin function that does the same; `roundToInt` does not.
     *    It only differs on an odd resized dimension, which is exactly the kind
     *    of case that survives testing and then shifts the crop on somebody's
     *    phone.
     *
     * Both were checked against the reference by `android/tools/parity_check.py`.
     * A one-pixel disagreement about where the crop starts changes how much of
     * the plate is in frame, and portion size is read from exactly that.
     */
    fun toTensor(bitmap: Bitmap, size: Int, resizeShorterSideTo: Int): FloatArray {
        val sw = bitmap.width
        val sh = bitmap.height
        require(sw > 0 && sh > 0) { "image has no dimensions" }

        val resizedW: Int
        val resizedH: Int
        if (sw <= sh) {
            resizedW = resizeShorterSideTo
            resizedH = (resizeShorterSideTo.toLong() * sh / sw).toInt()
        } else {
            resizedH = resizeShorterSideTo
            resizedW = (resizeShorterSideTo.toLong() * sw / sh).toInt()
        }

        val scaleX = sw.toFloat() / resizedW
        val scaleY = sh.toFloat() / resizedH

        // The centre crop, expressed back in source pixels, so the resampler can
        // read it straight out of the original instead of materialising a
        // full-size intermediate that is then mostly thrown away.
        val offX = round((resizedW - size) / 2.0).toFloat()
        val offY = round((resizedH - size) / 2.0).toFloat()

        return Resample.boxToPlanarRgb(
            src = bitmap,
            left = offX * scaleX,
            top = offY * scaleY,
            boxWidth = size * scaleX,
            boxHeight = size * scaleY,
            outSize = size,
        )
    }
}

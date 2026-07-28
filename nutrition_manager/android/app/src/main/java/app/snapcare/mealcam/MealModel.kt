package app.snapcare.mealcam

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject
import java.io.Closeable
import java.io.FileNotFoundException
import java.nio.FloatBuffer

/** One estimate: the manifest's target names, in physical units. */
data class Nutrition(val values: Map<String, Float>, val units: Map<String, String>)

/**
 * The on-device half of `export_onnx.py`, for Android.
 *
 * A near-literal port of `web/mealModel.ts`, kept faithful on purpose: the two
 * are the same contract on two runtimes, and every place they diverge is a
 * place the phone and the browser can disagree about the same photograph.
 *
 * Nothing here reaches the network — the app holds no INTERNET permission — so
 * the estimate works where infrastructure does not, which is precisely where
 * SnapCare is most needed.
 */
class MealModel private constructor(
    private val environment: OrtEnvironment,
    private val session: OrtSession,
    private val manifest: JSONObject,
) : Closeable {

    private val input = manifest.getJSONObject("input")
    private val inputName: String = input.getString("name")
    private val outputName: String = manifest.getJSONObject("output").getString("name")
    private val imgSize: Int = input.getInt("img_size")
    private val resizeTo: Int = input.getInt("resize_shorter_side_to")

    val targets: List<String> = manifest.getJSONArray("targets").let { array ->
        List(array.length()) { array.getString(it) }
    }

    private val units: Map<String, String> = manifest.getJSONObject("units").let { obj ->
        targets.associateWith { obj.optString(it, "") }
    }

    /** What the exporter measured this graph at, for honest labelling in the UI. */
    val backbone: String = manifest.optString("backbone", "unknown")
    val testMeanMaePct: Double? = manifest.optJSONObject("artifacts")
        ?.optJSONObject(recommendedVariant(manifest))
        ?.optDouble("test_mean_mae_pct")
        ?.takeIf { !it.isNaN() }

    /** Decode, crop, run the graph. Blocking; call it off the main thread. */
    fun estimate(bitmap: Bitmap): Nutrition {
        val pixels = Preprocess.toTensor(bitmap, imgSize, resizeTo)
        val shape = longArrayOf(1, 3, imgSize.toLong(), imgSize.toLong())

        OnnxTensor.createTensor(environment, FloatBuffer.wrap(pixels), shape).use { tensor ->
            session.run(mapOf(inputName to tensor)).use { results ->
                val raw = results.get(outputName).orElseThrow {
                    IllegalStateException("graph produced no output named '$outputName'")
                }
                @Suppress("UNCHECKED_CAST")
                val row = (raw.value as Array<FloatArray>)[0]
                return Nutrition(targets.withIndex().associate { (i, name) -> name to row[i] }, units)
            }
        }
    }

    override fun close() {
        session.close()
    }

    companion object {
        private const val MANIFEST_ASSET = "web.json"

        /**
         * Which graph to open is the manifest's decision, not the caller's.
         *
         * Quantization is not reliably a free win: the exporter scores both
         * graphs on the real test split, and on one backbone here int8 cost 0.1
         * points while on the backbone this app ships it multiplied the error
         * by two and a half. Nothing about an .onnx file says which happened, so
         * hard-coding a preference here would be overriding a measurement.
         */
        private fun recommendedVariant(manifest: JSONObject): String =
            manifest.optString("recommended").ifEmpty { "float32" }

        /** Blocking: reads a ~16 MB graph and compiles it. Call it off the main thread. */
        fun load(context: Context): MealModel {
            val manifest = JSONObject(
                context.assets.open(MANIFEST_ASSET).bufferedReader().use { it.readText() },
            )

            val variant = recommendedVariant(manifest)
            val artifacts = manifest.getJSONObject("artifacts")
            val artifact = artifacts.optJSONObject(variant)
                ?: artifacts.optJSONObject("float32")
                ?: throw IllegalStateException("manifest lists no usable artifact")
            val file = artifact.getString("file")

            val bytes = try {
                context.assets.open(file).use { it.readBytes() }
            } catch (exc: FileNotFoundException) {
                // The staged assets carry whatever `promote.py --install` wrote.
                // If the manifest points at an artifact that was not installed
                // beside it, say so plainly rather than falling back to a graph
                // nobody measured.
                throw FileNotFoundException(
                    "manifest recommends '$variant' ($file) but that file is not in the APK assets; " +
                        "re-run `python promote.py --install` in nutrition_manager/ and rebuild",
                )
            }

            val environment = OrtEnvironment.getEnvironment()
            val options = OrtSession.SessionOptions().apply {
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                setIntraOpNumThreads(4)
            }
            val session = environment.createSession(bytes, options)
            return MealModel(environment, session, manifest)
        }
    }
}

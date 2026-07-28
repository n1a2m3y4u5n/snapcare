package app.snapcare.mealcam

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.snapcare.mealcam.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * A camera with one button.
 *
 * Everything a camera app normally offers — flash, zoom, gallery, the shutter
 * sound, a review screen — is absent by design. The user photographs a plate and
 * gets five numbers on top of the live preview for three seconds, then the frame
 * is theirs again. There is nothing to dismiss and nothing to navigate back from,
 * which matters because SnapCare's users are the ones least served by a screen
 * that expects to be read.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var cameraExecutor: ExecutorService

    private var imageCapture: ImageCapture? = null
    private var model: MealModel? = null
    private var overlayJob: Job? = null

    private val requestCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            startCamera()
        } else {
            // No camera, no product. Say so in the one place the user is looking
            // rather than leaving a black rectangle to be interpreted.
            binding.status.visibility = View.VISIBLE
            binding.status.setText(R.string.camera_denied)
            binding.captureButton.isEnabled = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        cameraExecutor = Executors.newSingleThreadExecutor()
        binding.captureButton.setOnClickListener { capture() }

        // The graph is ~16 MB to read and compile. Doing it here, while the user
        // is still framing their first shot, is what keeps the first capture from
        // being the slow one.
        binding.captureButton.isEnabled = false
        lifecycleScope.launch {
            val loaded = withContext(Dispatchers.IO) {
                runCatching { MealModel.load(this@MainActivity) }
            }
            loaded
                .onSuccess {
                    model = it
                    // Which graph is actually running is the first thing anyone
                    // debugging a wrong number will want, and it is not
                    // recoverable from the APK by eye.
                    Log.i(TAG, "model: ${it.backbone}, test mean MAE ${it.testMeanMaePct ?: "unrecorded"}%")
                    binding.captureButton.isEnabled = true
                    binding.status.visibility = View.GONE
                }
                .onFailure { exc ->
                    Log.e(TAG, "could not load the model", exc)
                    binding.status.visibility = View.VISIBLE
                    binding.status.text = getString(R.string.model_failed, exc.message ?: "")
                }
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            requestCamera.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.preview.surfaceProvider)
            }
            val capture = ImageCapture.Builder()
                // Latency over the last few percent of sharpness: the model sees
                // a 224x224 centre crop, so a minimum-latency capture loses it
                // nothing it could have used.
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .build()

            try {
                provider.unbindAll()
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                imageCapture = capture
            } catch (exc: Exception) {
                Log.e(TAG, "camera bind failed", exc)
                binding.status.visibility = View.VISIBLE
                binding.status.text = getString(R.string.camera_failed, exc.message ?: "")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun capture() {
        val capture = imageCapture ?: return
        val model = this.model ?: return

        binding.captureButton.isEnabled = false
        capture.takePicture(cameraExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                // Copy out and close immediately: the capture pipeline stalls
                // while an ImageProxy is held, and inference is far longer than
                // one frame.
                val jpeg = image.planes[0].buffer.let { buffer ->
                    ByteArray(buffer.remaining()).also { buffer.get(it) }
                }
                val rotation = image.imageInfo.rotationDegrees
                image.close()

                lifecycleScope.launch {
                    val estimate = withContext(Dispatchers.Default) {
                        runCatching {
                            val bitmap = Preprocess.decodeCapture(jpeg, rotation, FLOOR_SHORTER_SIDE)
                            try {
                                model.estimate(bitmap)
                            } finally {
                                bitmap.recycle()
                            }
                        }
                    }
                    estimate
                        .onSuccess { showEstimate(it) }
                        .onFailure { exc ->
                            Log.e(TAG, "estimate failed", exc)
                            binding.status.visibility = View.VISIBLE
                            binding.status.text = getString(R.string.estimate_failed, exc.message ?: "")
                        }
                    binding.captureButton.isEnabled = true
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e(TAG, "capture failed", exception)
                runOnUiThread {
                    binding.status.visibility = View.VISIBLE
                    binding.status.text = getString(R.string.capture_failed, exception.message ?: "")
                    binding.captureButton.isEnabled = true
                }
            }
        })
    }

    /**
     * Put the five numbers over the preview, then take them away again.
     *
     * The rows are built from the manifest's target list rather than from five
     * fields in a layout, so exporting a model with different outputs changes
     * what is displayed instead of silently mislabelling it.
     */
    private fun showEstimate(estimate: Nutrition) {
        binding.status.visibility = View.GONE
        binding.results.removeAllViews()

        estimate.values.forEach { (name, value) ->
            binding.results.addView(row(label(name), format(value), estimate.units[name].orEmpty()))
        }
        // Not decoration. These are regressed from one photograph and are around
        // a quarter off on the benchmark's own overhead frames — worse at the
        // angle a phone is actually held. Presenting five bare numbers would
        // claim a precision the model does not have.
        binding.results.addView(caption())

        overlayJob?.cancel()
        binding.results.alpha = 0f
        binding.results.visibility = View.VISIBLE
        binding.results.animate().alpha(1f).setDuration(FADE_MS).start()

        overlayJob = lifecycleScope.launch {
            delay(OVERLAY_MS)
            binding.results.animate().alpha(0f).setDuration(FADE_MS).withEndAction {
                binding.results.visibility = View.GONE
            }.start()
        }
    }

    private fun caption(): View = TextView(this).apply {
        setText(R.string.estimate_caption)
        setTextColor(Color.parseColor("#B3FFFFFF"))
        textSize = 12f
        setPadding(0, 12, 0, 0)
    }

    private fun row(name: String, value: String, unit: String): View {
        val line = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val nameView = TextView(this).apply {
            text = name
            setTextColor(Color.WHITE)
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val valueView = TextView(this).apply {
            text = if (unit.isEmpty()) value else "$value $unit"
            setTextColor(Color.WHITE)
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        line.addView(nameView)
        line.addView(valueView)
        return line
    }

    /** `carb` reads as a column header; `Carbohydrate` reads as a word. */
    private fun label(target: String): String = when (target) {
        "calories" -> getString(R.string.target_calories)
        "mass" -> getString(R.string.target_mass)
        "fat" -> getString(R.string.target_fat)
        "carb" -> getString(R.string.target_carb)
        "protein" -> getString(R.string.target_protein)
        else -> target.replaceFirstChar(Char::uppercase)
    }

    /**
     * A decimal on 12.4 g of fat is informative; a decimal on 412.3 kcal is
     * false precision on a number whose error bar is around 20%.
     */
    private fun format(value: Float): String =
        if (abs(value) >= 100f) "%.0f".format(value) else "%.1f".format(value)

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        model?.close()
    }

    private companion object {
        const val TAG = "MealCam"
        const val OVERLAY_MS = 3_000L
        const val FADE_MS = 150L

        /**
         * Stop subsampling while the shorter side still has this many pixels.
         *
         * High enough that the JPEG decoder only ever takes a mild reduction and
         * `Resample`'s triangle filter still does the resizing that the model's
         * scores were measured with, low enough that a 12 MP capture does not
         * become a 48 MB bitmap.
         */
        const val FLOOR_SHORTER_SIDE = 1024
    }
}

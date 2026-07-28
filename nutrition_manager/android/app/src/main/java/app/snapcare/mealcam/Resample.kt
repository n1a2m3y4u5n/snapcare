package app.snapcare.mealcam

import android.graphics.Bitmap
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * A separable triangle-filter resampler, matching Pillow's `BILINEAR`.
 *
 * Android's own scaling is the obvious thing to use here and it is the wrong
 * function. `Canvas.drawBitmap` with `FILTER_BITMAP_FLAG` is a *point-sampled*
 * bilinear: it reads the four texels around each destination centre and stops,
 * so downscaling by more than 2x skips source pixels entirely. Pillow — which
 * is what torchvision's `Resize` calls, and therefore what every score in this
 * repo was measured with — widens the filter's support by the reduction factor,
 * so every source pixel contributes.
 *
 * Measured on the 507-dish test split, the difference between those two is
 * around a third of a point of mean MAE%, in the wrong direction. That is the
 * same order as the gap between two training runs, which is exactly why it
 * cannot be left as an implementation detail: a model comparison would be
 * measuring the resampler.
 *
 * So this is Pillow's `precompute_coeffs` and its two passes, in Kotlin, over an
 * arbitrary source box. Resampling the crop box directly is algebraically the
 * same as resizing the whole frame and then cropping — same scale factor, same
 * centres — while touching a fraction of the pixels.
 */
object Resample {

    /** The triangle (bilinear) kernel. Support 1.0 before the reduction factor widens it. */
    private fun triangle(x: Float): Float {
        val a = if (x < 0f) -x else x
        return if (a < 1.0f) 1.0f - a else 0.0f
    }

    /**
     * Per-output-pixel filter taps for one axis.
     *
     * [in0] and [in1] delimit the source box; [inSize] is the full extent of the
     * source, because taps are clamped to the *image*, not to the box. Pillow
     * does the same, and it is what keeps this equivalent to resize-then-crop
     * rather than to cropping first and losing the pixels just outside the edge.
     */
    private class Coeffs(val bounds: IntArray, val weights: FloatArray, val taps: Int)

    private fun precompute(inSize: Int, in0: Float, in1: Float, outSize: Int): Coeffs {
        val scale = (in1 - in0) / outSize
        val filterScale = max(1.0f, scale)
        val support = 1.0f * filterScale
        val taps = ceil(support).toInt() * 2 + 1

        val bounds = IntArray(outSize * 2)
        val weights = FloatArray(outSize * taps)
        val inverse = 1.0f / filterScale

        for (out in 0 until outSize) {
            val center = in0 + (out + 0.5f) * scale
            var xmin = floor(center - support + 0.5f).toInt()
            if (xmin < 0) xmin = 0
            var xmax = floor(center + support + 0.5f).toInt()
            if (xmax > inSize) xmax = inSize
            xmax -= xmin
            if (xmax <= 0) {
                // Degenerate only for empty boxes; keep one tap so the output is defined.
                bounds[out * 2] = min(xmin, inSize - 1)
                bounds[out * 2 + 1] = 1
                weights[out * taps] = 1.0f
                continue
            }

            var sum = 0.0f
            for (t in 0 until xmax) {
                val w = triangle((t + xmin - center + 0.5f) * inverse)
                weights[out * taps + t] = w
                sum += w
            }
            // Normalising per output pixel is what keeps the image from
            // darkening at the edges, where the kernel is clipped by the bounds.
            if (sum != 0.0f) {
                for (t in 0 until xmax) weights[out * taps + t] /= sum
            }
            bounds[out * 2] = xmin
            bounds[out * 2 + 1] = xmax
        }
        return Coeffs(bounds, weights, taps)
    }

    /**
     * Resample [src]'s box into an [outSize] x [outSize] planar RGB tensor in [0,1].
     *
     * Returns NCHW-ordered data with the batch dimension left implicit.
     */
    @Suppress("LongParameterList")
    fun boxToPlanarRgb(
        src: Bitmap,
        left: Float,
        top: Float,
        boxWidth: Float,
        boxHeight: Float,
        outSize: Int,
    ): FloatArray {
        val srcW = src.width
        val srcH = src.height

        // The two axes get their own box extent: `Resize(int)` truncates the
        // long side, so the horizontal and vertical scale factors are not quite
        // equal and assuming a square box would shift the crop by a fraction of
        // a pixel on one axis.
        val horizontal = precompute(srcW, left, left + boxWidth, outSize)
        val vertical = precompute(srcH, top, top + boxHeight, outSize)

        // Only the rows the vertical pass will actually read need resampling
        // horizontally — for a centre crop that is most of them, but for an
        // off-centre box it is not, and reading the whole frame would be waste
        // proportional to the capture's resolution.
        var firstRow = srcH
        var lastRow = 0
        for (out in 0 until outSize) {
            firstRow = min(firstRow, vertical.bounds[out * 2])
            lastRow = max(lastRow, vertical.bounds[out * 2] + vertical.bounds[out * 2 + 1])
        }
        val rows = lastRow - firstRow

        val pixels = IntArray(srcW * rows)
        src.getPixels(pixels, 0, srcW, 0, firstRow, srcW, rows)

        // Horizontal pass: srcRows x outSize, interleaved RGB.
        val strip = FloatArray(rows * outSize * 3)
        for (y in 0 until rows) {
            val rowOffset = y * srcW
            val stripOffset = y * outSize * 3
            for (out in 0 until outSize) {
                val xmin = horizontal.bounds[out * 2]
                val count = horizontal.bounds[out * 2 + 1]
                val kernel = out * horizontal.taps
                var r = 0.0f
                var g = 0.0f
                var b = 0.0f
                for (t in 0 until count) {
                    val w = horizontal.weights[kernel + t]
                    val pixel = pixels[rowOffset + xmin + t]
                    r += w * ((pixel shr 16) and 0xFF)
                    g += w * ((pixel shr 8) and 0xFF)
                    b += w * (pixel and 0xFF)
                }
                strip[stripOffset + out * 3] = r
                strip[stripOffset + out * 3 + 1] = g
                strip[stripOffset + out * 3 + 2] = b
            }
        }

        // Vertical pass, straight into planar layout and scaled to [0,1].
        val plane = outSize * outSize
        val out = FloatArray(3 * plane)
        for (y in 0 until outSize) {
            val ymin = vertical.bounds[y * 2] - firstRow
            val count = vertical.bounds[y * 2 + 1]
            val kernel = y * vertical.taps
            for (x in 0 until outSize) {
                var r = 0.0f
                var g = 0.0f
                var b = 0.0f
                for (t in 0 until count) {
                    val w = vertical.weights[kernel + t]
                    val i = ((ymin + t) * outSize + x) * 3
                    r += w * strip[i]
                    g += w * strip[i + 1]
                    b += w * strip[i + 2]
                }
                // Pillow rounds to 8-bit between the resize and anything that
                // follows, and the reference tensors these scores come from went
                // through that. Clamping here keeps the two byte-identical.
                val p = y * outSize + x
                out[p] = clamp8(r) / 255f
                out[plane + p] = clamp8(g) / 255f
                out[2 * plane + p] = clamp8(b) / 255f
            }
        }
        return out
    }

    private fun clamp8(v: Float): Float {
        val rounded = floor(v + 0.5f)
        return if (rounded < 0f) 0f else if (rounded > 255f) 255f else rounded
    }
}

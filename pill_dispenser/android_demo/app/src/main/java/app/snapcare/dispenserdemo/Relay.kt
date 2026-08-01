package app.snapcare.dispenserdemo

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talking to a dispenser through the relay.
 *
 * Two slots per device: the app writes `desired`, the dispenser writes
 * `reported`. Everything crossing the relay is sealed, so the relay stores
 * ciphertext, revisions and timestamps and cannot read a schedule or a dose
 * log.
 *
 * `HttpURLConnection` and `org.json`, deliberately — no client library. This
 * file doubles as a statement of what the protocol actually needs, and a
 * dependency would hide that. It is about a hundred and fifty lines.
 *
 * Every call blocks. They are made from a coroutine on `Dispatchers.IO`; see
 * `MainActivity`.
 */
class Relay(baseUrl: String, claim: String) {

    private val base = baseUrl.trimEnd('/')
    private val keys = Pairing.Keys(claim)

    val deviceId: String get() = keys.deviceId

    class RelayException(message: String, val status: Int) : IOException(message)

    /**
     * Somebody else wrote a newer revision while this screen was open.
     *
     * The loser holds a stale copy of the schedule, so it must be shown the
     * newer one rather than retrying over it — retrying is how an edit made on
     * another phone silently disappears.
     */
    class ConflictException(val currentRev: Int, message: String) :
        IOException(message)

    // ── the relay's own view ────────────────────────────────────────────────

    /** Revisions and timestamps, no plaintext. Null if never seen. */
    fun meta(): JSONObject? {
        val (status, body) = request("GET", "", null, 0)
        if (status == 404) return null
        if (status !in 200..299) throw RelayException(errorOf(body), status)
        return JSONObject(body)
    }

    // ── writing a schedule ──────────────────────────────────────────────────

    /**
     * Publish a schedule and return the revision the relay now holds.
     *
     * Reads the current revision first, because the app does not own the
     * counter — `desired.rev + 1` is the only correct next value.
     */
    fun setSchedule(slots: List<Sc1.Slot>): Int {
        val current = try {
            meta()?.optJSONObject("desired")?.optInt("rev", 0) ?: 0
        } catch (exception: RelayException) {
            // A mailbox that does not exist yet is not an error here: the first
            // write is what creates it.
            if (exception.status != 404) throw exception else 0
        }

        val rev = current + 1
        val plaintext = JSONObject().put("payload", Sc1.encodeWeekly(slots)).toString()
        val envelope = Pairing.seal(keys.boxKey, keys.deviceId, Pairing.SLOT_DESIRED, rev, plaintext)
        val body = """{"envelope":${envelope.toJson()}}"""

        val (status, answer) = request("PUT", "/desired", body, 0)
        if (status == 409) {
            val newest = try {
                meta()?.optJSONObject("desired")?.optInt("rev", rev) ?: rev
            } catch (_: Exception) {
                rev
            }
            throw ConflictException(newest, errorOf(answer))
        }
        if (status !in 200..299) throw RelayException(errorOf(answer), status)
        return JSONObject(answer).optInt("rev", rev)
    }

    // ── reading what the device says ────────────────────────────────────────

    /**
     * Wait for the device to say something new.
     *
     * Returns null when the hold expires with nothing new — the normal case,
     * not an error. Reconnecting on it is what makes a dose event appear in
     * about a second.
     */
    fun waitForReport(sinceRev: Int, holdSeconds: Int = 50): Reported? {
        val (status, body) = request(
            "GET", "/reported?since=$sinceRev&wait=$holdSeconds", null,
            // A read timeout has to outlast the hold, or every long poll ends
            // in an exception that looks exactly like the relay being down.
            (holdSeconds + 15) * 1000,
        )
        if (status == 204 || status == 404) return null
        if (status !in 200..299) throw RelayException(errorOf(body), status)

        val answer = JSONObject(body)
        val envelope = answer.getJSONObject("envelope")
        val opened = Pairing.unseal(
            keys.boxKey, keys.deviceId, Pairing.SLOT_REPORTED,
            Pairing.Envelope(
                envelope.getInt("rev"),
                envelope.getString("iv"),
                envelope.getString("ct"),
            ),
        )
        return Reported(answer.optInt("rev"), JSONObject(opened))
    }

    /** The device's latest report, without waiting. */
    fun report(): Reported? = waitForReport(0, holdSeconds = 0)

    data class Reported(val rev: Int, val report: JSONObject) {

        val at: String get() = report.optString("at")
        val lastError: String get() = report.optString("lastError")
        val status: JSONObject get() = report.optJSONObject("status") ?: JSONObject()
        val events: JSONArray get() = report.optJSONArray("events") ?: JSONArray()
        val deviceUrl: String
            get() = report.optJSONObject("network")?.optString("deviceUrl") ?: ""

        /** False means **nothing will be dispensed** — the loudest fact here. */
        val dispensing: Boolean get() = status.optBoolean("dispensing", false)

        /** Why not, when it is not. Empty when doses are being given. */
        val blockedReason: String get() = status.optString("blockedReason")
    }

    // ── plumbing ────────────────────────────────────────────────────────────

    private fun request(
        method: String,
        suffix: String,
        body: String?,
        readTimeoutMs: Int,
    ): Pair<Int, String> {
        val connection = URL("$base/v1/devices/${keys.deviceId}$suffix")
            .openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.setRequestProperty("Authorization", "Bearer ${keys.accessToken}")
        connection.connectTimeout = 15_000
        connection.readTimeout = if (readTimeoutMs > 0) readTimeoutMs else 20_000

        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray()) }
        }

        return try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            status to text
        } finally {
            connection.disconnect()
        }
    }

    private fun errorOf(body: String): String = try {
        JSONObject(body).optString("error").ifEmpty { body }
    } catch (_: Exception) {
        body.ifEmpty { "the relay did not say why" }
    }

    companion object {
        /**
         * Has this device been heard from recently?
         *
         * Judged from the report's own timestamp rather than from the word
         * "connected". A dispenser whose power has been pulled sends nothing
         * and otherwise looks identical to a healthy one — and "unplugged since
         * Tuesday" is the single most useful thing a carer can be told.
         */
        fun isStale(at: String, thresholdSeconds: Long = 15 * 60): Boolean {
            val parsed = runCatching {
                java.time.LocalDateTime.parse(at)
                    .atZone(java.time.ZoneId.systemDefault()).toEpochSecond()
            }.getOrNull() ?: return true
            return (System.currentTimeMillis() / 1000) - parsed > thresholdSeconds
        }
    }
}

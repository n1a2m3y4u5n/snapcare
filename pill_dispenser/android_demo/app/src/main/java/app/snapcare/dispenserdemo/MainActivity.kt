package app.snapcare.dispenserdemo

import android.content.Context
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import app.snapcare.dispenserdemo.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Pair with a dispenser, send it a schedule, and watch what it does.
 *
 * The point of this app is the *flows*, not the UI: pairing from ten printed
 * characters, the long poll that makes a dose event arrive in about a second,
 * and the two states a naive screen gets wrong.
 *
 * Those two, because they are the same two the web app has to get right:
 *
 *   1. `dispensing == false` means **nothing will come out**, and the device is
 *      otherwise completely healthy-looking. It has to be louder than anything
 *      else on the screen.
 *
 *   2. "Connected" is not observable from here. A dispenser whose power has
 *      been pulled sends nothing and looks identical to one with nothing new to
 *      say, so the age of the last report is what gets shown.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var views: ActivityMainBinding
    private var relay: Relay? = null
    private var poller: Job? = null

    /** Backoff after a failed poll: 1s, 2s, 4s … capped. */
    private val backoffStartMs = 1_000L
    private val backoffCapMs = 60_000L

    private val prefs by lazy { getSharedPreferences("snapcare", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        views = ActivityMainBinding.inflate(layoutInflater)
        setContentView(views.root)

        // Before anything can be paired. If this app's crypto disagrees with
        // the firmware's, every schedule it sends is silently ignored — so it
        // is better to refuse than to demo a device that never responds.
        val check = SelfCheck.run(this)
        if (!check.ok) {
            views.selfCheck.visibility = View.VISIBLE
            views.selfCheck.text =
                "This build cannot talk to a dispenser: ${check.detail}\n\n" +
                    "Its pairing crypto does not match the firmware's. Regenerate " +
                    "the vectors (make vectors in webapp_kit) and rebuild."
            views.pair.isEnabled = false
            return
        }

        views.relayUrl.setText(prefs.getString("relay", "http://10.0.2.2:8088"))
        views.claim.setText(prefs.getString("claim", ""))

        views.pair.setOnClickListener { pair() }
        views.unpair.setOnClickListener { unpair() }
        views.sendSchedule.setOnClickListener { sendSchedule() }

        if (!prefs.getString("claim", "").isNullOrBlank()) pair()
    }

    override fun onDestroy() {
        poller?.cancel()
        super.onDestroy()
    }

    // ── pairing ─────────────────────────────────────────────────────────────

    private fun pair() {
        val url = views.relayUrl.text.toString().trim()
        val typed = views.claim.text.toString()

        val claim = Pairing.normaliseClaim(typed)
        if (claim == null) {
            // Refused here, while the person is still looking at the field. A
            // code with one character missing derives a perfectly valid key for
            // a mailbox that does not exist, and the only symptom then is a
            // dispenser that appears to have been unplugged.
            views.claimHint.setTextColor(ContextCompat.getColor(this, R.color.snap_amber))
            views.claimHint.text =
                "That is not ten characters of the printed alphabet. It is never " +
                    "padded or shortened to fit — a code with a character missing " +
                    "would look like a dispenser that had been unplugged."
            return
        }
        if (url.isBlank()) {
            views.claimHint.text = "Give it a relay address."
            return
        }

        views.claimHint.setTextColor(ContextCompat.getColor(this, R.color.snap_muted))
        views.claimHint.text = "Paired as ${Pairing.formatClaim(claim)}"
        prefs.edit().putString("relay", url).putString("claim", claim).apply()

        relay = Relay(url, claim)
        views.pairingCard.visibility = View.GONE
        views.actions.visibility = View.VISIBLE
        show("Looking for the dispenser…", R.color.snap_muted)
        startPolling()
    }

    private fun unpair() {
        poller?.cancel()
        relay = null
        prefs.edit().remove("claim").apply()
        views.pairingCard.visibility = View.VISIBLE
        views.actions.visibility = View.GONE
        views.state.visibility = View.GONE
        views.detail.visibility = View.GONE
        views.events.visibility = View.GONE
    }

    // ── the long poll ───────────────────────────────────────────────────────

    private fun startPolling() {
        poller?.cancel()
        poller = lifecycleScope.launch {
            var rev = 0
            var backoff = backoffStartMs

            while (isActive) {
                try {
                    val found = withContext(Dispatchers.IO) {
                        relay?.waitForReport(rev)
                    }
                    backoff = backoffStartMs
                    if (found != null) {
                        rev = found.rev
                        render(found)
                    }
                    // A null is the hold expiring with nothing new. That is the
                    // normal case, not an error — reconnect immediately.
                } catch (exception: Exception) {
                    if (!isActive) return@launch
                    show("Cannot reach the relay: ${exception.message}", R.color.snap_amber)
                    views.detail.visibility = View.VISIBLE
                    views.detail.text =
                        "The dispenser keeps its schedule and its clock on its own, " +
                            "so it is still dispensing. This is the connection to it " +
                            "that is down, not the device."
                    delay(backoff)
                    backoff = (backoff * 2).coerceAtMost(backoffCapMs)
                }
            }
        }
    }

    // ── what to show ────────────────────────────────────────────────────────

    private fun render(found: Relay.Reported) {
        val status = found.status

        when {
            // Loudest, and first. The device is healthy in every other respect
            // and no pill will come out of it.
            !found.dispensing -> show(
                "This dispenser will not open a tray.\n${found.blockedReason}",
                R.color.snap_amber,
            )
            Relay.isStale(found.at) -> show(
                "Not heard from since ${found.at}. It may be unplugged.",
                R.color.snap_amber,
            )
            status.optJSONObject("awaitingConfirmation") != null -> {
                val tray = status.getJSONObject("awaitingConfirmation").optInt("tray")
                show("Tray $tray is in the cup now, waiting for the button.",
                    R.color.snap_green)
            }
            else -> show(nextDoseText(status), R.color.snap_blue)
        }

        views.detail.visibility = View.VISIBLE
        views.detail.text = buildString {
            appendLine("reported at   ${found.at}")
            appendLine("clock         ${status.optJSONObject("clock")?.optString("source")}")
            appendLine("trays fitted  ${status.optInt("trayCount")}")
            appendLine("servo driver  ${status.optString("servoBackend")} " +
                "(${status.optString("servoTiming")})")
            appendLine("fitted        ${status.optJSONArray("indicators")}")
            if (found.lastError.isNotEmpty()) appendLine("last error    ${found.lastError}")
            if (found.deviceUrl.isNotEmpty()) appendLine("on the LAN    ${found.deviceUrl}")

            // What the loaded schedule lost in transit. The device will not
            // hide these and neither should this.
            val notes = status.optJSONArray("notes")
            if (notes != null && notes.length() > 0) {
                appendLine()
                for (index in 0 until notes.length()) appendLine("note: ${notes.getString(index)}")
            }
        }

        views.events.visibility = View.VISIBLE
        views.events.text = buildString {
            append("Recent doses\n")
            val events = found.events
            if (events.length() == 0) append("  nothing yet")
            for (index in 0 until events.length()) {
                val event = events.getJSONObject(index)
                // "dispensed" and "taken" are different facts, and only the
                // second is the one a carer wants. Never collapsed.
                val outcome = when {
                    event.optBoolean("confirmed") -> "taken"
                    event.optBoolean("taken") -> "dispensed, not confirmed"
                    else -> "MISSED"
                }
                append("  ${event.optString("at")}  tray ${event.optInt("tray")}" +
                    "  due ${event.optString("time")}  — $outcome\n")
            }
        }
    }

    private fun nextDoseText(status: JSONObject): String {
        val next = status.optJSONObject("nextDose") ?: return "Nothing scheduled."
        return "Next: tray ${next.optInt("tray")} at ${next.optString("time")}"
    }

    private fun show(text: String, colour: Int) {
        views.state.visibility = View.VISIBLE
        views.state.text = text
        views.state.setTextColor(ContextCompat.getColor(this, colour))
    }

    // ── sending one ─────────────────────────────────────────────────────────

    private fun sendSchedule() {
        val client = relay ?: return
        views.sendSchedule.isEnabled = false

        lifecycleScope.launch {
            try {
                val rev = withContext(Dispatchers.IO) {
                    client.setSchedule(
                        listOf(
                            Sc1.Slot(
                                tray = 1,
                                times = listOf(8 * 60, 20 * 60),
                                days = Sc1.EVERY_DAY,
                                durationDays = 30,
                            ),
                        ),
                    )
                }
                show("Schedule sent as revision $rev. The device should apply it " +
                    "within a second or two.", R.color.snap_violet)
            } catch (conflict: Relay.ConflictException) {
                // Somebody else saved while this screen was open. The loser is
                // holding a stale copy — show them, do not retry over it.
                show("Somebody else changed this schedule (they are at revision " +
                    "${conflict.currentRev}). Yours was not saved.", R.color.snap_amber)
            } catch (exception: Exception) {
                show("Could not send it: ${exception.message}", R.color.snap_amber)
            } finally {
                views.sendSchedule.isEnabled = true
            }
        }
    }
}

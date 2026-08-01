package app.snapcare.dispenserdemo

import android.content.Context
import org.json.JSONObject

/**
 * Prove this app's crypto agrees with the dispenser's, at launch, on the phone.
 *
 * `VectorsTest` already checks this on a desktop JVM, and that is not quite the
 * same claim. Android's crypto providers are not the desktop's, `minSdk` is 24,
 * and a phone from 2017 is exactly the kind of device this project is for. A
 * provider that did something subtly different — a different default GCM tag
 * length, say — would produce an app that seals a schedule, uploads it fine,
 * and is silently ignored by the dispenser forever.
 *
 * So the same golden vectors are shipped in the APK and opened at startup. If
 * they do not open, the app says so and refuses to pair, because the failure it
 * is preventing is one with no error message at either end: the relay stores
 * whatever it is given, and the device cannot tell a schedule it cannot open
 * from one that was meant for somebody else.
 */
object SelfCheck {

    data class Outcome(val ok: Boolean, val detail: String)

    fun run(context: Context): Outcome {
        val vectors = try {
            JSONObject(context.assets.open("vectors.json").bufferedReader().use { it.readText() })
        } catch (exception: Exception) {
            return Outcome(false, "the crypto vectors are missing from this build: $exception")
        }

        return try {
            val keys = vectors.getJSONObject("keys")
            val claim = keys.getString("claim")

            check(Pairing.deviceId(claim) == keys.getString("deviceId")) {
                "the device id does not match the firmware's"
            }
            check(Pairing.accessToken(claim) == keys.getString("accessToken")) {
                "the access token does not match the firmware's"
            }

            // The one that matters most: open something Python sealed. Deriving
            // the same key proves HKDF; this proves AES-GCM, the AAD string and
            // the base64url handling all agree too.
            val envelope = vectors.getJSONObject("envelope")
            val desired = envelope.getJSONObject("desired")
            val sealed = desired.getJSONObject("sealed")
            val opened = Pairing.unseal(
                Pairing.boxKey(claim),
                envelope.getString("deviceId"),
                Pairing.SLOT_DESIRED,
                Pairing.Envelope(
                    sealed.getInt("rev"),
                    sealed.getString("iv"),
                    sealed.getString("ct"),
                ),
            )
            val expected = desired.getJSONObject("plaintext").getString("payload")
            check(JSONObject(opened).getString("payload") == expected) {
                "a Python-sealed schedule opened into something else"
            }

            // And the reverse: seal here, open here. Catches a provider whose
            // encrypt and decrypt disagree with each other, which sounds absurd
            // and is exactly what a wrong tag length looks like.
            val roundTrip = Pairing.seal(
                Pairing.boxKey(claim), envelope.getString("deviceId"),
                Pairing.SLOT_DESIRED, 1, """{"payload":"$expected"}""",
            )
            check(
                JSONObject(
                    Pairing.unseal(
                        Pairing.boxKey(claim), envelope.getString("deviceId"),
                        Pairing.SLOT_DESIRED, roundTrip,
                    ),
                ).getString("payload") == expected,
            ) { "sealing and opening on this phone disagree with each other" }

            Outcome(true, "crypto matches the firmware")
        } catch (exception: Exception) {
            Outcome(false, exception.message ?: exception.toString())
        }
    }
}

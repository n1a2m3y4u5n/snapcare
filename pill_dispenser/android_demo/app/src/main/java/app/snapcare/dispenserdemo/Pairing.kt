package app.snapcare.dispenserdemo

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * The pairing code, the three keys under it, and the sealed envelope.
 *
 *     claim code ──HKDF──> device id      the relay's address for it   (relay sees this)
 *                ──HKDF──> access token   proves the right to it       (relay sees this)
 *                ──HKDF──> box key        opens the schedule           (relay never does)
 *
 * This must agree byte for byte with `provisioning.py` and `envelope.py` on the
 * dispenser. It is the fourth implementation of this — Python on the device,
 * JavaScript in the relay's lab page, TypeScript in `webapp_kit/`, and this —
 * and a disagreement between any two of them is a pairing that simply never
 * works, with no error at either end and nothing in any log. `VectorsTest`
 * pins it against `vectors.json`, generated from the Python.
 *
 * **Deliberately free of Android and of JSON.** `android.util.Base64` and
 * `org.json` are stubs in a JVM unit test and throw the moment they are
 * touched, so putting either in here would mean the crypto could only be tested
 * on a device — which in practice means tested by demoing it. Base64url is
 * twenty lines and is written out below; JSON lives in `Relay.kt`.
 *
 * No crypto library either. HMAC-SHA256 and AES-GCM are both in the platform,
 * and writing HKDF out is what makes it possible to see that it is the standard
 * construction rather than something that merely resembles one.
 */
object Pairing {

    /** No O, I, L, 0 or 1 — somebody has to read this off a sticker. */
    private const val ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

    /** Ten characters, always. Matches `_CLAIM_LEN`. */
    const val CLAIM_LENGTH = 10

    /** Domain separation for this stage. Matches `_HKDF_SALT`. */
    private val HKDF_SALT = "snapcare/pill-dispenser/cloud/v1".toByteArray()

    const val ENVELOPE_VERSION = 1
    const val ALG = "A256GCM"

    /** 96 bits, which is what GCM is specified for. */
    private const val IV_BYTES = 12

    /** GCM tag length in bits. Appended to the ciphertext by every side. */
    private const val TAG_BITS = 128

    /** One direction of travel. They are separate slots on the relay. */
    const val SLOT_DESIRED = "desired"
    const val SLOT_REPORTED = "reported"

    // ── the code ────────────────────────────────────────────────────────────

    /**
     * Reduce whatever was typed to the ten characters the key is derived from,
     * or `null` if it is not a valid code.
     *
     * **Never pads and never truncates.** A code with one character missing
     * would otherwise derive a perfectly valid key for a mailbox that does not
     * exist, and the only symptom is a dispenser that appears to have been
     * unplugged — no error, at either end, ever.
     */
    fun normaliseClaim(code: String): String? {
        val kept = code.uppercase().filter { it in ALPHABET }
        return if (kept.length == CLAIM_LENGTH) kept else null
    }

    /** The form to show a person: `6V9F5-9QK67`. Display only — never derive from it. */
    fun formatClaim(code: String): String =
        normaliseClaim(code)?.chunked(5)?.joinToString("-") ?: ""

    /**
     * Read the code out of a pairing URL — `https://relay/pair#6V9F59QK67`.
     *
     * The code is in the fragment, which browsers never send to a server, so it
     * appears in no access log anywhere. A code in a query string would, which
     * is why one is not accepted from there.
     */
    fun claimFromPairUrl(url: String): String? {
        val hash = url.indexOf('#')
        return if (hash == -1) null else normaliseClaim(url.substring(hash + 1))
    }

    // ── base64url, unpadded ─────────────────────────────────────────────────

    private const val B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    /**
     * Padding is stripped because it is noise in JSON — and because Python is
     * strict about it where a browser's `atob` is not, so a stray `=` fails at
     * the device end on about one message in four. That ratio is the reason it
     * is worth being careful here: it presents as flakiness, not as a bug.
     */
    fun b64url(raw: ByteArray): String {
        val out = StringBuilder((raw.size + 2) / 3 * 4)
        var index = 0
        while (index + 2 < raw.size) {
            val chunk = ((raw[index].toInt() and 0xff) shl 16) or
                ((raw[index + 1].toInt() and 0xff) shl 8) or
                (raw[index + 2].toInt() and 0xff)
            out.append(B64[chunk ushr 18 and 0x3f]).append(B64[chunk ushr 12 and 0x3f])
                .append(B64[chunk ushr 6 and 0x3f]).append(B64[chunk and 0x3f])
            index += 3
        }
        when (raw.size - index) {
            1 -> {
                val chunk = (raw[index].toInt() and 0xff) shl 16
                out.append(B64[chunk ushr 18 and 0x3f]).append(B64[chunk ushr 12 and 0x3f])
            }
            2 -> {
                val chunk = ((raw[index].toInt() and 0xff) shl 16) or
                    ((raw[index + 1].toInt() and 0xff) shl 8)
                out.append(B64[chunk ushr 18 and 0x3f]).append(B64[chunk ushr 12 and 0x3f])
                    .append(B64[chunk ushr 6 and 0x3f])
            }
        }
        return out.toString()
    }

    /** The inverse. Tolerant of padding being present or absent. */
    fun unb64url(text: String): ByteArray {
        val clean = text.trimEnd('=')
        val out = java.io.ByteArrayOutputStream(clean.length * 3 / 4 + 3)
        var buffer = 0
        var bits = 0
        for (character in clean) {
            val value = B64.indexOf(character)
            require(value >= 0) { "not base64url" }
            buffer = (buffer shl 6) or value
            bits += 6
            if (bits >= 8) {
                bits -= 8
                out.write((buffer ushr bits) and 0xff)
            }
        }
        return out.toByteArray()
    }

    // ── HKDF-SHA256, RFC 5869 ───────────────────────────────────────────────

    fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")

        mac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)

        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        val out = ByteArray(length)
        var block = ByteArray(0)
        var written = 0
        var counter = 1
        while (written < length) {
            mac.update(block)
            mac.update(info)
            mac.update(counter.toByte())
            block = mac.doFinal()
            val take = minOf(block.size, length - written)
            block.copyInto(out, written, 0, take)
            written += take
            counter += 1
        }
        return out
    }

    private fun derive(claim: String, info: String, length: Int): ByteArray {
        val bare = normaliseClaim(claim) ?: throw InvalidClaimException()
        return hkdf(bare.toByteArray(), HKDF_SALT, info.toByteArray(), length)
    }

    class InvalidClaimException :
        IllegalArgumentException("not a valid pairing code — ten characters from the printed alphabet")

    /**
     * The relay's address for this device. 128 bits through a one-way function.
     * Deliberately not the claim code itself: the relay writes this to its log
     * on every request, and a key that appears in a server log is not a key.
     */
    fun deviceId(claim: String): String = b64url(derive(claim, "device-id", 16))

    /** The bearer token. The relay stores only its SHA-256. */
    fun accessToken(claim: String): String = b64url(derive(claim, "access", 32))

    /** The AES-256-GCM key. Never leaves the phone and never leaves the device. */
    fun boxKey(claim: String): SecretKeySpec = SecretKeySpec(derive(claim, "box", 32), "AES")

    /** Everything derived from one code, so the derivation happens once. */
    class Keys(claim: String) {
        val claim: String = normaliseClaim(claim) ?: throw InvalidClaimException()
        val deviceId: String = deviceId(this.claim)
        val accessToken: String = accessToken(this.claim)
        val boxKey: SecretKeySpec = boxKey(this.claim)
    }

    // ── the envelope ────────────────────────────────────────────────────────

    /**
     * Never says why it did not open, on purpose. Wrong key, wrong device,
     * wrong revision, wrong slot and deliberate tampering are all one answer —
     * distinguishing them for the caller distinguishes them for anybody who can
     * reach the endpoint that reports it.
     */
    class SealException(message: String = "did not open") : Exception(message)

    data class Envelope(val rev: Int, val iv: String, val ct: String) {
        /**
         * Hand-built rather than via `org.json`, so this class stays usable in
         * a JVM test. Every field is an int or base64url — there is nothing
         * here that could need escaping.
         */
        fun toJson(): String =
            """{"v":$ENVELOPE_VERSION,"rev":$rev,"alg":"$ALG","iv":"$iv","ct":"$ct"}"""
    }

    /**
     * What the ciphertext is bound to, and therefore cannot be moved away from.
     * Every field is one substitution somebody could otherwise make by editing
     * the relay's disk: the version, the household, the direction of travel,
     * and the revision — the last being last month's prescription renumbered to
     * look like today's.
     */
    private fun aad(deviceId: String, slot: String, rev: Int): ByteArray =
        "snapcare/relay/v$ENVELOPE_VERSION|$deviceId|$slot|$rev".toByteArray()

    fun seal(key: SecretKeySpec, deviceId: String, slot: String, rev: Int, plaintext: String): Envelope =
        sealWithIv(key, deviceId, slot, rev, plaintext,
            ByteArray(IV_BYTES).also { SecureRandom().nextBytes(it) })

    /**
     * Only for reproducing a fixed vector. AES-GCM is safe only with a unique
     * IV per message under one key — everything real must go through `seal`.
     */
    fun sealWithIv(
        key: SecretKeySpec,
        deviceId: String,
        slot: String,
        rev: Int,
        plaintext: String,
        iv: ByteArray,
    ): Envelope {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(aad(deviceId, slot, rev))
        return Envelope(rev, b64url(iv), b64url(cipher.doFinal(plaintext.toByteArray())))
    }

    /**
     * Open an envelope, or throw.
     *
     * The revision is read from the envelope and fed straight into the AAD,
     * which looks circular and is not: a forged `rev` produces an AAD that does
     * not match the one used to seal, and the open fails. That *is* the check —
     * the revision can be trusted precisely because the envelope opened.
     */
    fun unseal(key: SecretKeySpec, deviceId: String, slot: String, envelope: Envelope): String {
        val iv: ByteArray
        val ct: ByteArray
        try {
            iv = unb64url(envelope.iv)
            ct = unb64url(envelope.ct)
        } catch (_: Exception) {
            throw SealException("malformed envelope")
        }
        if (iv.size != IV_BYTES) throw SealException("malformed envelope")

        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(aad(deviceId, slot, rev = envelope.rev))
            return String(cipher.doFinal(ct))
        } catch (_: Exception) {
            throw SealException()
        }
    }
}

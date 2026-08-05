package app.snapcare.dispenserdemo

/**
 * `SC1*W*` — the schedule form that carries everything.
 *
 *     SC1*W*1:0800.2000-127-030/3:1900-021-000
 *            └tray └times      └days └course length (0 = ongoing)
 *
 * The older `SC1*S*` has tray numbers and times and nothing else, which is
 * enough for a reminder and not enough for a prescription: a Mon/Wed/Fri course
 * sent that way dispenses on four days nobody asked for, and a 30-day course
 * runs until the tray is empty.
 *
 * Fixed three-digit widths so 8-bit firmware can read them with pointer
 * arithmetic instead of a tokenizer, and every character inside the QR
 * alphanumeric set — straying out of it costs 8 bits a character instead of 5.5
 * and is what stops a code fitting.
 *
 * Mirrors `encode_weekly` in `snapcare_dispenser/sc1.py`, and is checked
 * against it by the vectors.
 */
object Sc1 {

    /** Monday-first bitmask. */
    const val EVERY_DAY = 0b1111111 // 127

    const val MAX_TRAYS = 8
    const val MAX_TIMES = 8
    const val MAX_DURATION_DAYS = 999

    val DAY_NAMES = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

    class ScheduleException(message: String) : IllegalArgumentException(message)

    /**
     * One tray's plan.
     *
     * `times` is minutes past midnight internally, because that is the only
     * representation in which "is this a duplicate" and "which comes first" are
     * both trivially right.
     */
    data class Slot(
        val tray: Int,
        val times: List<Int>,
        val days: Int = EVERY_DAY,
        val durationDays: Int = 0,
    ) {
        val hhmm: List<String> get() = times.map(::formatHhmm)
    }

    /** `'08:00'`, `'8:00'`, `'0800'` → minutes past midnight, or null. */
    fun parseHhmm(text: String): Int? {
        val cleaned = text.trim().replace(":", "")
        if (!cleaned.matches(Regex("\\d{3,4}"))) return null
        val padded = cleaned.padStart(4, '0')
        val hours = padded.substring(0, 2).toInt()
        val minutes = padded.substring(2).toInt()
        if (hours > 23 || minutes > 59) return null
        return hours * 60 + minutes
    }

    fun formatHhmm(minutes: Int): String {
        val wrapped = ((minutes % 1440) + 1440) % 1440
        return "%02d%02d".format(wrapped / 60, wrapped % 60)
    }

    /**
     * Validate the way the device validates, so a schedule it would refuse is
     * refused here first — while somebody is still looking at the screen that
     * sent it, rather than after they have walked away.
     */
    fun normalise(slots: List<Slot>): List<Slot> {
        if (slots.isEmpty()) throw ScheduleException("a schedule needs at least one tray")

        val byTray = linkedMapOf<Int, Slot>()
        for (slot in slots) {
            if (slot.tray !in 1..MAX_TRAYS) {
                throw ScheduleException("tray ${slot.tray} is not between 1 and $MAX_TRAYS")
            }
            if (slot.days !in 1..EVERY_DAY) {
                throw ScheduleException("tray ${slot.tray}: days must be a bitmask of 1..$EVERY_DAY")
            }
            if (slot.durationDays !in 0..MAX_DURATION_DAYS) {
                throw ScheduleException("tray ${slot.tray}: durationDays must be 0..$MAX_DURATION_DAYS")
            }
            if (slot.times.isEmpty()) {
                throw ScheduleException("tray ${slot.tray}: give it 1 to $MAX_TIMES times")
            }
            // A duplicate is collapsed, not refused. One tray cannot dispense
            // twice at one minute — physically, and because the firmware's
            // high-water mark is (day, minute), so the second would be
            // suppressed on some paths and honoured on others. One dose is the
            // only reading that is true everywhere, so every implementation of
            // this format settles on it: sc1.py, webapp_kit, the app's copy and
            // this one. Throwing here would refuse a schedule the device
            // accepts.
            val times = slot.times.distinct().sorted()
            // The cap is on what is left after collapsing, which is what the
            // firmware counts.
            if (times.size > MAX_TIMES) {
                throw ScheduleException("tray ${slot.tray}: give it 1 to $MAX_TIMES times")
            }

            val existing = byTray[slot.tray]
            if (existing == null) {
                byTray[slot.tray] = slot.copy(times = times)
            } else {
                if (existing.days != slot.days || existing.durationDays != slot.durationDays) {
                    throw ScheduleException(
                        "tray ${slot.tray} appears twice with different days or duration")
                }
                val merged = (existing.times + times).distinct().sorted()
                if (merged.size > MAX_TIMES) {
                    throw ScheduleException("tray ${slot.tray}: more than $MAX_TIMES times once merged")
                }
                byTray[slot.tray] = existing.copy(times = merged)
            }
        }
        return byTray.values.sortedBy { it.tray }
    }

    fun encodeWeekly(slots: List<Slot>): String {
        val body = normalise(slots).joinToString("/") { slot ->
            listOf(
                "${slot.tray}:${slot.hhmm.joinToString(".")}",
                "%03d".format(slot.days),
                "%03d".format(minOf(slot.durationDays, MAX_DURATION_DAYS)),
            ).joinToString("-")
        }
        return "SC1*W*$body"
    }

    /** The inverse. Null on anything malformed — it refuses rather than guessing. */
    fun decodeWeekly(payload: String): List<Slot>? {
        val parts = payload.trim().uppercase().split("*")
        if (parts.size != 3 || parts[0] != "SC1" || parts[1] != "W") return null

        val slots = mutableListOf<Slot>()
        for (chunk in parts[2].split("/")) {
            val bits = chunk.split("-")
            if (bits.size != 3) return null
            val colon = bits[0].indexOf(':')
            if (colon == -1) return null

            val tray = bits[0].substring(0, colon).toIntOrNull() ?: return null
            val times = bits[0].substring(colon + 1).split(".").map { parseHhmm(it) ?: return null }
            if (!bits[1].matches(Regex("\\d{3}")) || !bits[2].matches(Regex("\\d{3}"))) return null

            slots.add(Slot(tray, times, bits[1].toInt(), bits[2].toInt()))
        }
        return try {
            normalise(slots)
        } catch (_: ScheduleException) {
            null
        }
    }

    /** `[0, 2, 4]` (Mon, Wed, Fri) → `21`. */
    fun daysToMask(dayIndexes: List<Int>): Int {
        var mask = 0
        for (index in dayIndexes) {
            if (index !in 0..6) throw ScheduleException("day $index is not 0..6")
            mask = mask or (1 shl index)
        }
        if (mask == 0) throw ScheduleException("a schedule needs at least one day")
        return mask
    }

    /** `21` → `'Mon, Wed, Fri'`. `127` → `'every day'`. */
    fun describeDays(mask: Int): String {
        if (mask == EVERY_DAY) return "every day"
        return (0..6).filter { mask and (1 shl it) != 0 }.joinToString(", ") { DAY_NAMES[it] }
    }
}

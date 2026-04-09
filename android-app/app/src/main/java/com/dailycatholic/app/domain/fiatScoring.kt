package com.dailycatholic.app.domain

import com.google.gson.JsonElement
import java.util.Calendar

data class DailyEntry(
    val date: String,
    val gospelRead: Boolean = false,
    val reflection: Boolean = false,
    val eucharist: Boolean = false,
    val sundayMass: Boolean = false,
    val rosary: Boolean = false,
    val angelusNoon: Boolean = false,
    val angelusEvening: Boolean = false,
    val fiatMorning: Boolean = false,
    val fiatDay: Boolean = false,
    val fiatNight: Boolean = false,
    val proteinTarget: Boolean = false,
    val noSnacking: Boolean = false,
    val training: Boolean = false,
    val noScrolling: Boolean = false,
    val followedStructure: Boolean = false,
    val examen: Boolean = false,
)

typealias CheckKey = String

data class FiatDayRow(
    val day: String,
    val score: Int,
    val maxScore: Int,
    val bonusScore: Int,
)

fun fiatDayRowFromEntry(entry: DailyEntry): FiatDayRow {
    val sections = getSectionsForDate(entry.date)
    return FiatDayRow(
        day = entry.date,
        score = computeScore(entry, sections),
        maxScore = maxScoreForSections(sections),
        bonusScore = computeBonusScore(entry, sections),
    )
}

enum class CheckMediaKind { Youtube, External }

data class CheckMedia(
    val kind: CheckMediaKind,
    val url: String,
)

data class FiatCheck(
    val key: CheckKey,
    val label: String,
    val points: Int,
    val required: Boolean = false,
    val bonus: Boolean = false,
    val sundayOnly: Boolean = false,
    val weekdayOnly: Boolean = false,
    val media: CheckMedia? = null,
)

data class FiatSection(
    val id: String,
    val icon: String,
    val title: String,
    val subtitle: String,
    val colorHex: String,
    val checks: List<FiatCheck>,
)

object FiatMedia {
    const val prevenientAct = "https://youtu.be/5XlZdBPdH9c?si=5ERA8MmNM-JZa59v"
    val rosary: Map<String, String> = mapOf(
        "Joyful Mysteries" to "https://youtu.be/bKgpFXhBBck?si=1d_VPwAtwr9Q8Y0l",
        "Sorrowful Mysteries" to "https://youtu.be/LBcqGtAyAns?si=aFsumnkBAWk7y_Vf",
        "Glorious Mysteries" to "https://youtu.be/udlX3eoulCk?si=swEgIKNGc8TfiCsP",
        "Luminous Mysteries" to "https://youtu.be/G48pm_t1N6M?si=49y312xCVy_ZdKB5",
    )
    const val angelus = "https://youtu.be/MwJg19DZW54?si=_Czo0C_GZdkiX-aL"
    const val dailyGospel = "https://dailygospel.org/AM/gospel"
}

private val rosaryMysteries = mapOf(
    0 to "Glorious Mysteries",
    1 to "Joyful Mysteries",
    2 to "Sorrowful Mysteries",
    3 to "Glorious Mysteries",
    4 to "Luminous Mysteries",
    5 to "Sorrowful Mysteries",
    6 to "Joyful Mysteries",
)

private val allSections: List<FiatSection> = listOf(
    FiatSection(
        id = "word",
        icon = "✦",
        title = "Word of God",
        subtitle = "Lectio Divina",
        colorHex = "#c9a84c",
        checks = listOf(
            FiatCheck(
                key = "gospel_read",
                label = "Daily Gospel read",
                points = 14,
                media = CheckMedia(CheckMediaKind.External, FiatMedia.dailyGospel),
            ),
            FiatCheck("reflection", "Daily Reflection complete", 13),
        ),
    ),
    FiatSection(
        id = "eucharist",
        icon = "✝",
        title = "Eucharist",
        subtitle = "Source & Summit",
        colorHex = "#e8d5a3",
        checks = listOf(
            FiatCheck("sunday_mass", "Sunday Mass", 40, required = true, sundayOnly = true),
            FiatCheck("eucharist", "Daily Mass (optional)", 30, bonus = true, weekdayOnly = true),
        ),
    ),
    FiatSection(
        id = "fiat",
        icon = "🕊",
        title = "Divine Will",
        subtitle = "Fiat voluntas tua",
        colorHex = "#a8c4e0",
        checks = listOf(
            FiatCheck(
                "fiat_morning",
                "Morning Offering-The Prevenient Act",
                30,
                media = CheckMedia(CheckMediaKind.Youtube, FiatMedia.prevenientAct),
            ),
            FiatCheck("fiat_day", "Fusing in the Divine Will", 30),
            FiatCheck(key = "rosary", label = "__rosary__", points = 30),
            FiatCheck(
                "angelus_noon",
                "Angelus · Noon",
                10,
                media = CheckMedia(CheckMediaKind.Youtube, FiatMedia.angelus),
            ),
            FiatCheck(
                "angelus_evening",
                "Angelus · 6pm",
                10,
                media = CheckMedia(CheckMediaKind.Youtube, FiatMedia.angelus),
            ),
        ),
    ),
    FiatSection(
        id = "examen",
        icon = "☽",
        title = "Examen",
        subtitle = "Review in God's presence",
        colorHex = "#b87333",
        checks = listOf(
            FiatCheck("examen", "Reviewed the day", 10),
        ),
    ),
)

fun getSections(isSunday: Boolean, dayOfWeek: Int): List<FiatSection> {
    val mystery = rosaryMysteries[dayOfWeek] ?: "Glorious Mysteries"
    val rosaryUrl = FiatMedia.rosary[mystery]
    return allSections.map { sec ->
        val filtered = sec.checks.filter { c ->
            when {
                c.sundayOnly && !isSunday -> false
                c.weekdayOnly && isSunday -> false
                else -> true
            }
        }.map { c ->
            if (c.label != "__rosary__") c
            else FiatCheck(
                key = c.key,
                label = "Rosary · $mystery",
                points = c.points,
                media = rosaryUrl?.let { CheckMedia(CheckMediaKind.Youtube, it) },
            )
        }
        sec.copy(checks = filtered)
    }
}

/** Parse YYYY-MM-DD with local noon to match web `new Date(iso + 'T12:00:00')` in local time. */
fun parseLocalNoonCalendar(isoDate: String): Calendar {
    val parts = isoDate.split("-").mapNotNull { it.toIntOrNull() }
    require(parts.size == 3) { "Invalid iso date $isoDate" }
    return Calendar.getInstance().apply {
        set(Calendar.YEAR, parts[0])
        set(Calendar.MONTH, parts[1] - 1)
        set(Calendar.DAY_OF_MONTH, parts[2])
        set(Calendar.HOUR_OF_DAY, 12)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
}

fun getSectionsForDate(isoDate: String): List<FiatSection> {
    val cal = parseLocalNoonCalendar(isoDate)
    val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK) // Sun=1 ... Sat=7 in Java
    val isSunday = dayOfWeek == Calendar.SUNDAY
    // Web: Date.getDay() Sunday=0, Monday=1
    val webDow = when (dayOfWeek) {
        Calendar.SUNDAY -> 0
        Calendar.MONDAY -> 1
        Calendar.TUESDAY -> 2
        Calendar.WEDNESDAY -> 3
        Calendar.THURSDAY -> 4
        Calendar.FRIDAY -> 5
        Calendar.SATURDAY -> 6
        else -> 0
    }
    return getSections(isSunday, webDow)
}

fun maxScoreForSections(sections: List<FiatSection>): Int =
    sections.flatMap { it.checks }.filter { !it.bonus }.sumOf { it.points }

fun computeScore(entry: DailyEntry, sections: List<FiatSection>): Int =
    sections.flatMap { it.checks }
        .filter { !it.bonus && entry.getCheck(it.key) }
        .sumOf { it.points }

fun computeBonusScore(entry: DailyEntry, sections: List<FiatSection>): Int =
    sections.flatMap { it.checks }
        .filter { it.bonus && entry.getCheck(it.key) }
        .sumOf { it.points }

fun emptyEntry(date: String): DailyEntry = DailyEntry(date = date)

fun mergeEntryFromChecks(date: String, checks: JsonElement?): DailyEntry {
    val base = emptyEntry(date)
    val obj = checks?.takeIf { it.isJsonObject }?.asJsonObject ?: return base
    fun bool(key: String): Boolean = obj.get(key)?.takeIf { it.isJsonPrimitive }?.asBoolean == true
    return base.copy(
        date = date,
        gospelRead = bool("gospel_read"),
        reflection = bool("reflection"),
        eucharist = bool("eucharist"),
        sundayMass = bool("sunday_mass"),
        rosary = bool("rosary"),
        angelusNoon = bool("angelus_noon"),
        angelusEvening = bool("angelus_evening"),
        fiatMorning = bool("fiat_morning"),
        fiatDay = bool("fiat_day"),
        fiatNight = bool("fiat_night"),
        proteinTarget = bool("protein_target"),
        noSnacking = bool("no_snacking"),
        training = bool("training"),
        noScrolling = bool("no_scrolling"),
        followedStructure = bool("followed_structure"),
        examen = bool("examen"),
    )
}

fun DailyEntry.toChecksMap(): Map<String, Boolean> = mapOfStrings()

private fun DailyEntry.mapOfStrings(): Map<String, Boolean> = mapOf(
    "gospel_read" to gospelRead,
    "reflection" to reflection,
    "eucharist" to eucharist,
    "sunday_mass" to sundayMass,
    "rosary" to rosary,
    "angelus_noon" to angelusNoon,
    "angelus_evening" to angelusEvening,
    "fiat_morning" to fiatMorning,
    "fiat_day" to fiatDay,
    "fiat_night" to fiatNight,
    "protein_target" to proteinTarget,
    "no_snacking" to noSnacking,
    "training" to training,
    "no_scrolling" to noScrolling,
    "followed_structure" to followedStructure,
    "examen" to examen,
)

fun DailyEntry.getCheck(key: String): Boolean = when (key) {
    "gospel_read" -> gospelRead
    "reflection" -> reflection
    "eucharist" -> eucharist
    "sunday_mass" -> sundayMass
    "rosary" -> rosary
    "angelus_noon" -> angelusNoon
    "angelus_evening" -> angelusEvening
    "fiat_morning" -> fiatMorning
    "fiat_day" -> fiatDay
    "fiat_night" -> fiatNight
    "protein_target" -> proteinTarget
    "no_snacking" -> noSnacking
    "training" -> training
    "no_scrolling" -> noScrolling
    "followed_structure" -> followedStructure
    "examen" -> examen
    else -> false
}

fun DailyEntry.withToggled(key: String): DailyEntry {
    val next = !getCheck(key)
    return when (key) {
        "gospel_read" -> copy(gospelRead = next)
        "reflection" -> copy(reflection = next)
        "eucharist" -> copy(eucharist = next)
        "sunday_mass" -> copy(sundayMass = next)
        "rosary" -> copy(rosary = next)
        "angelus_noon" -> copy(angelusNoon = next)
        "angelus_evening" -> copy(angelusEvening = next)
        "fiat_morning" -> copy(fiatMorning = next)
        "fiat_day" -> copy(fiatDay = next)
        "fiat_night" -> copy(fiatNight = next)
        "protein_target" -> copy(proteinTarget = next)
        "no_snacking" -> copy(noSnacking = next)
        "training" -> copy(training = next)
        "no_scrolling" -> copy(noScrolling = next)
        "followed_structure" -> copy(followedStructure = next)
        "examen" -> copy(examen = next)
        else -> this
    }
}

fun toISODate(cal: Calendar): String {
    val y = cal.get(Calendar.YEAR)
    val m = cal.get(Calendar.MONTH) + 1
    val d = cal.get(Calendar.DAY_OF_MONTH)
    return "%04d-%02d-%02d".format(y, m, d)
}

fun todayIso(): String = toISODate(Calendar.getInstance())

fun startOfWeekMonday(from: Calendar = Calendar.getInstance()): Calendar {
    val copy = from.clone() as Calendar
    copy.set(Calendar.HOUR_OF_DAY, 12)
    copy.set(Calendar.MINUTE, 0)
    copy.set(Calendar.SECOND, 0)
    copy.set(Calendar.MILLISECOND, 0)
    val dow = copy.get(Calendar.DAY_OF_WEEK)
    val diff = when (dow) {
        Calendar.SUNDAY -> -6
        else -> Calendar.MONDAY - dow
    }
    copy.add(Calendar.DAY_OF_MONTH, diff)
    return copy
}

fun addDays(cal: Calendar, n: Int): Calendar =
    (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, n) }

fun weekDayIndexMonFirst(cal: Calendar): Int {
    val dow = cal.get(Calendar.DAY_OF_WEEK)
    return when (dow) {
        Calendar.SUNDAY -> 6
        else -> dow - Calendar.MONDAY
    }
}

fun toYoutubeEmbedUrl(pageUrl: String): String? {
    return try {
        val u = java.net.URL(pageUrl)
        var id: String? = null
        val host = u.host.lowercase()
        if (host == "youtu.be" || host == "www.youtu.be") {
            id = u.path.trimStart('/').split("/").firstOrNull()
        } else if (host.contains("youtube.com")) {
            id = u.query?.let { q ->
                Regex("[?&]v=([^&]+)").find(q)?.groupValues?.get(1)
            }
            if (id == null && u.path.startsWith("/embed/")) {
                id = u.path.removePrefix("/embed/").split("/").firstOrNull()
            }
        }
        if (id.isNullOrBlank() || !Regex("^[a-zA-Z0-9_-]{6,}\$").matches(id)) null
        else "https://www.youtube-nocookie.com/embed/$id?rel=0"
    } catch (_: Exception) {
        null
    }
}

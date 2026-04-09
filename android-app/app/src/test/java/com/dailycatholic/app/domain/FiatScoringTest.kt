package com.dailycatholic.app.domain

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FiatScoringTest {

    @Test
    fun mergeEntryFromChecks_mergesBooleans() {
        val json = JsonParser.parseString("""{"gospel_read":true,"rosary":true}""")
        val e = mergeEntryFromChecks("2026-04-09", json)
        assertTrue(e.gospelRead)
        assertTrue(e.rosary)
        assertFalse(e.reflection)
    }

    @Test
    fun computeScore_excludesBonusChecks_fromFidelity() {
        val date = "2026-04-06" // Monday — includes optional weekday Mass (bonus)
        val sections = getSectionsForDate(date)
        val withBonus = emptyEntry(date).copy(eucharist = true)
        val withoutBonus = emptyEntry(date).copy(eucharist = false)
        assertTrue(computeBonusScore(withBonus, sections) > 0)
        assertEquals(0, computeBonusScore(withoutBonus, sections))
        assertEquals(
            computeScore(withBonus, sections),
            computeScore(withoutBonus, sections),
        )
    }

    @Test
    fun getSectionsForDate_sundayShowsSundayMass() {
        val isoSunday = "2026-04-12"
        val sections = getSectionsForDate(isoSunday)
        val eucharist = sections.find { it.id == "eucharist" }!!
        val labels = eucharist.checks.map { it.label }
        assertTrue(labels.any { it.contains("Sunday Mass", ignoreCase = true) })
    }
}

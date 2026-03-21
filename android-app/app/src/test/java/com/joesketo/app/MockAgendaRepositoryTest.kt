package com.joesketo.app

import com.joesketo.app.data.repository.MockAgendaRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MockAgendaRepositoryTest {

    private val repository = MockAgendaRepository()

    @Test
    fun `getTodayAgenda returns non-null agenda`() = runBlocking {
        val agenda = repository.getTodayAgenda("mock-token")
        assertNotNull(agenda)
    }

    @Test
    fun `getTodayAgenda returns meals`() = runBlocking {
        val agenda = repository.getTodayAgenda("mock-token")
        assertTrue("Expected at least one meal", agenda.meals.isNotEmpty())
    }

    @Test
    fun `getTodayAgenda returns workout with items`() = runBlocking {
        val agenda = repository.getTodayAgenda("mock-token")
        assertNotNull(agenda.workout)
        assertTrue("Expected at least one workout item", agenda.workout.items.isNotEmpty())
    }

    @Test
    fun `getTodayAgenda returns targets`() = runBlocking {
        val agenda = repository.getTodayAgenda("mock-token")
        val targets = agenda.targets
        assertTrue("Protein target should be positive", targets.protein > 0)
        assertTrue("Carbs target should be non-negative", targets.carbs >= 0)
        assertTrue("Fat target should be positive", targets.fat > 0)
        assertTrue("Water target should be positive", targets.waterLitres > 0)
    }

    @Test
    fun `getTodayAgenda targets match expected values`() = runBlocking {
        val agenda = repository.getTodayAgenda("mock-token")
        assertEquals(180, agenda.targets.protein)
        assertEquals(30, agenda.targets.carbs)
        assertEquals(110, agenda.targets.fat)
        assertEquals(4.0, agenda.targets.waterLitres, 0.001)
    }
}

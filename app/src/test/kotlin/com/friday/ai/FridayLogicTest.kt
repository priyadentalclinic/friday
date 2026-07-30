package com.friday.ai

import com.friday.ai.friday.FuzzyMatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FridayLogicTest {

    private val fuzzyMatcher = FuzzyMatcher()

    @Test
    fun testFuzzyMatchingForMummy() {
        val score = fuzzyMatcher.calculateDiceCoefficient("mummy", "mom")
        // Bigrams mummy: mu, um, mm, my
        // Bigrams mom: mo, om
        assertTrue("Mummy should have some match with Mom", score > 0.0)
    }

    @Test
    fun testExactMatching() {
        val score = fuzzyMatcher.calculateDiceCoefficient("John Doe", "John Doe")
        assertEquals(1.0, score, 0.001)
    }

    @Test
    fun testCleanStringsInFuzzyMatching() {
        val score = fuzzyMatcher.calculateDiceCoefficient("Papa!!!", "papa")
        assertEquals(1.0, score, 0.001)
    }
}

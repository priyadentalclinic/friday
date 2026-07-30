package com.friday.ai.friday

class FuzzyMatcher {
    /**
     * Calculates the Dice coefficient between two strings.
     * Returns 1.0 for identical strings, 0.0 for no similarity.
     */
    fun calculateDiceCoefficient(a: String, b: String): Double {
        if (a == b) return 1.0
        if (a.length < 2 || b.length < 2) return 0.0

        val bigramsA = a.windowed(2).toSet()
        val bigramsB = b.windowed(2).toSet()

        val intersection = bigramsA.intersect(bigramsB).size
        val totalBigrams = bigramsA.size + bigramsB.size

        return if (totalBigrams == 0) 0.0
        else (2.0 * intersection) / totalBigrams
    }
}

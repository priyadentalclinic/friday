package com.friday.ai

import android.content.Context
import android.provider.ContactsContract
import java.util.*

data class ContactResult(val name: String, val number: String, val score: Double)

class FuzzyMatcher {
    
    fun calculateDiceCoefficient(s1: String, s2: String): Double {
        val str1 = s1.lowercase(Locale.ROOT).replace("[^a-z0-9]".toRegex(), "").replace("bahan", "behen").replace("mummy", "mom").replace("papa", "dad")
        val str2 = s2.lowercase(Locale.ROOT).replace("[^a-z0-9]".toRegex(), "").replace("bahan", "behen").replace("mummy", "mom").replace("papa", "dad")

        if (str1 == str2) return 1.0
        if (str1.length < 2 || str2.length < 2) return 0.0

        val s1Bigrams = str1.windowed(2).toSet()
        val s2Bigrams = str2.windowed(2).toSet()

        val intersect = s1Bigrams.intersect(s2Bigrams).size
        return (2.0 * intersect) / (s1Bigrams.size + s2Bigrams.size)
    }

    fun findBestContact(context: Context, query: String): ContactResult? {
        var bestMatch: ContactResult? = null
        var maxScore = 0.0
        
        val cursor = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER),
            null, null, null
        )

        cursor?.use {
            while (it.moveToNext()) {
                val name = it.getString(0) ?: ""
                val number = it.getString(1) ?: ""
                val score = calculateDiceCoefficient(query, name)
                if (score > maxScore && score > 0.4) { // 40% threshold as requested
                    maxScore = score
                    bestMatch = ContactResult(name, number, score)
                }
            }
        }
        return bestMatch
    }
}

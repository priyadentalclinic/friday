package com.friday.ai.voice

import java.util.regex.Pattern

data class VoiceSegment(val text: String, val voice: String)

class HinglishRouter {
    private val devanagariPattern = Pattern.compile("[\\u0900-\\u097F]+")

    fun segmentText(input: String): List<VoiceSegment> {
        if (input.isBlank()) return emptyList()

        val segments = mutableListOf<VoiceSegment>()
        val words = input.split(" ")
        
        var currentText = StringBuilder()
        var currentIsHindi = isHindi(words[0])

        for (word in words) {
            val wordIsHindi = isHindi(word)
            if (wordIsHindi == currentIsHindi) {
                currentText.append(word).append(" ")
            } else {
                segments.add(VoiceSegment(
                    text = currentText.toString().trim(),
                    voice = if (currentIsHindi) "hi-IN-SwaraNeural" else "en-IN-NeerjaNeural"
                ))
                currentText = StringBuilder(word).append(" ")
                currentIsHindi = wordIsHindi
            }
        }

        if (currentText.isNotEmpty()) {
            segments.add(VoiceSegment(
                text = currentText.toString().trim(),
                voice = if (currentIsHindi) "hi-IN-SwaraNeural" else "en-IN-NeerjaNeural"
            ))
        }

        return segments
    }

    private fun isHindi(text: String): Boolean {
        return devanagariPattern.matcher(text).find()
    }
}

package com.friday.ai.agents

import android.content.Context
import android.util.Log
import com.friday.ai.models.*
import com.friday.ai.voice.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class CoordinatorAgent(private val context: Context) {
    private val tts = EdgeTtsManager(context)
    private val router = HinglishRouter()
    
    private val _currentMission = MutableStateFlow<Mission?>(null)
    val currentMission: StateFlow<Mission?> = _currentMission

    fun engage(mission: Mission) {
        _currentMission.value = mission
        Log.d("FRIDAY", "Coordinator engaging mission: ${mission.query}")
    }

    fun speak(text: String, onDone: () -> Unit = {}) {
        val segments = router.segmentText(text)
        tts.speak(segments, onDone)
    }

    fun shutdown() {
        tts.stop()
    }
}

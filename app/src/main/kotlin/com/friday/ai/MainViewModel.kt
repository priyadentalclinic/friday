package com.friday.ai

import android.app.Application
import android.util.Log
import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.friday.ai.agents.CoordinatorAgent
import com.friday.ai.core.ActionExecutor
import com.friday.ai.core.ActionResult
import com.friday.ai.models.Mission
import com.friday.ai.models.MissionStatus
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class MainViewModel : ViewModel() {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()
        
    private val gson = Gson()
    private val OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    
    private val OPENROUTER_API_KEY = "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"

    val messages = mutableStateListOf<Map<String, String>>()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    
    private var coordinator: CoordinatorAgent? = null
    private var actionExecutor: ActionExecutor? = null

    fun initCoordinator(context: Application) {
        if (coordinator == null) {
            coordinator = CoordinatorAgent(context)
            actionExecutor = ActionExecutor(context)
            postMsg("assistant", "Systems online, Boss.")
        }
    }

    fun sendMessage(text: String) {
        if (text.isBlank()) return
        Log.d("FRIDAY", "Mission Initiated: $text")
        
        val mission = Mission(query = text)
        messages.add(mapOf("role" to "user", "content" to text))
        _isLoading.value = true
        
        coordinator?.engage(mission)
        runCloudInference(text, mission)
    }

    private fun runCloudInference(text: String, mission: Mission) {
        viewModelScope.launch(Dispatchers.IO) {
            // Prioritized Model Pool based on Boss's selection
            val primaryModel = "google/gemma-4-31b-it:free"
            val fallbacks = listOf(
                "google/gemma-4-26b-a4b:free",
                "nvidia/nemotron-3-nano-30b-a3b:free",
                "openai/gpt-oss-20b:free"
            )
            
            val systemPrompt = """You are FRIDAY, a professional AI assistant for Android.
Respond in Hinglish (mix of Hindi and English). ALWAYS address the user as Boss.
Keep responses short and professional — 1-2 sentences max.

When the user asks you to DO something on the phone, add an action tag at the end:
[ACTION]{"action":"ACTION_TYPE","target":"TARGET_NAME"}[/ACTION]

Available actions:
- open_app : Open any app. target = app name like youtube, whatsapp, settings, chrome, gmail, camera, phone, maps, spotify, instagram, telegram, netflix, clock, calendar, zomato, swiggy, paytm, phonepe, etc.
- whatsapp : Open WhatsApp chat for a contact. target = contact name like Mom, Sister, etc.
- dial : Open dialer for a contact. target = contact name like Mom, Dad, etc.

Examples:
User: Open YouTube
FRIDAY: Opening YouTube, Boss. [ACTION]{"action":"open_app","target":"youtube"}[/ACTION]

User: Call Mom
FRIDAY: Dialing Mom, Boss. [ACTION]{"action":"dial","target":"Mom"}[/ACTION]

User: WhatsApp Sister
FRIDAY: Opening WhatsApp for Sister, Boss. [ACTION]{"action":"whatsapp","target":"Sister"}[/ACTION]

If the user asks a question or chat, do NOT add any action tag. Just reply normally.
Do not ask for confirmation before actions — just do it and inform the user."""
            val payload = mapOf(
                "model" to primaryModel,
                "models" to fallbacks,
                "messages" to listOf(
                    mapOf("role" to "system", "content" to systemPrompt),
                    mapOf("role" to "user", "content" to text)
                )
            )

            val body = gson.toJson(payload).toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(OPENROUTER_URL)
                .addHeader("Authorization", "Bearer $OPENROUTER_API_KEY")
                .addHeader("HTTP-Referer", "https://friday-ai.com")
                .addHeader("Referer", "https://friday-ai.com")
                .addHeader("X-Title", "FRIDAY OS")
                .post(body)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    viewModelScope.launch(Dispatchers.Main) { _isLoading.value = false }
                    Log.e("FRIDAY", "Satellite Connection Failure: ${e.message}")
                    postMsg("assistant", "Satellite link broken, Boss.")
                }

                override fun onResponse(call: Call, response: Response) {
                    viewModelScope.launch(Dispatchers.Main) { _isLoading.value = false }
                    val respBody = response.body?.string()
                    if (response.isSuccessful && respBody != null) {
                        try {
                            val jsonResponse = gson.fromJson(respBody, Map::class.java)
                            val choices = (jsonResponse["choices"] as? List<*>) ?: return
                            val firstChoice = choices.firstOrNull() as? Map<*, *> ?: return
                            val message = firstChoice["message"] as? Map<*, *> ?: return
                            val content = message["content"] as? String ?: return
                            handleAIOutput(content, mission)
                        } catch (e: Exception) {
                            Log.e("FRIDAY", "Data Parsing Error: ${e.message}")
                            postMsg("assistant", "Data corrupted in transit.")
                        }
                    } else {
                        Log.e("FRIDAY", "Satellite Error: ${response.code} - $respBody")
                        val errorReason = if (response.code == 429) "Cores congested." else "Uplink rejected (Code: ${response.code})"
                        postMsg("assistant", "$errorReason Please standby, Boss.")
                    }
                }
            })
        }
    }

    private fun handleAIOutput(content: String, mission: Mission) {
        // Step 1: Extract and execute any [ACTION] tag from the LLM response
        val actionRegex = Regex("""\[ACTION\](.*?)\[/ACTION\]""", RegexOption.DOT_MATCHES_ALL)
        val actionMatch = actionRegex.find(content)

        if (actionMatch != null) {
            val actionJson = actionMatch.groupValues[1].trim()
            try {
                val parsed = gson.fromJson(actionJson, Map::class.java)
                val actionType = (parsed["action"] as? String) ?: ""
                val target = parsed["target"] as? String

                if (actionType.isNotBlank() && actionExecutor != null) {
                    val result = actionExecutor!!.execute(actionType, target)
                    if (!result.success) {
                        // Action failed — show the error instead of the LLM's success message
                        val cleanBase = content.replace(actionRegex, "").trim()
                        postMsg("assistant", "$cleanBase ${result.message}")
                        mission.status = MissionStatus.COMPLETED
                        mission.replyText = result.message
                        return
                    }
                }
            } catch (e: Exception) {
                Log.e("FRIDAY", "Action parse error: ${e.message}")
            }
        }

        // Step 2: Clean the message for display (remove action tags, stray JSON, brackets)
        var cleanMsg = content
            .replace(actionRegex, "")
            .replace(Regex("""\{.*?\}"""), "")
            .replace(Regex("""\[.*?\]"""), "")
            .trim()

        if (cleanMsg.isBlank() && content.contains("{")) {
            cleanMsg = "Acknowledged, Boss. Engaging protocol."
        }

        mission.status = MissionStatus.COMPLETED
        mission.replyText = cleanMsg
        postMsg("assistant", cleanMsg)
    }

    private fun postMsg(role: String, content: String) {
        viewModelScope.launch(Dispatchers.Main) {
            _isLoading.value = false
            messages.add(mapOf("role" to role, "content" to content))
            if (role == "assistant") coordinator?.speak(content)
        }
    }
}

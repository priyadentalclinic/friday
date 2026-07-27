package com.friday.ai

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.io.File

class MainViewModel : ViewModel() {
    private val client = OkHttpClient()
    private val gson = Gson()
    private val OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    private val OPENROUTER_API_KEY = "sk-or-v1-3004838634731383827363473138382736"

    val messages = mutableStateListOf<Map<String, String>>()
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading
    
    var localBrain: LocalBrain? = null
    var pendingAction by mutableStateOf<Map<String, Any>?>(null)

    fun initLocalBrain(context: Context) {
        viewModelScope.launch {
            val modelPath = File(context.filesDir, "qwen2.5-0.5b-instruct-int8.tflite").absolutePath
            localBrain = LocalBrain(context)
            localBrain?.initialize(modelPath)
        }
    }

    fun sendMessage(text: String, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher, forge: NetworkForge) {
        Log.d("FRIDAY", "Processing Mission: $text")
        if (text.isBlank()) return
        
        // Confirmation handling
        if (pendingAction != null && (text.contains("yes", true) || text.contains("initiate", true) || text.contains("go", true))) {
            val action = pendingAction!!
            pendingAction = null
            executeHardwareAction(action, context, tts, fuzzy, forge)
            return
        } else if (pendingAction != null) {
            pendingAction = null
            postMsg("assistant", "Mission aborted, boss.", tts)
            return
        }

        messages.add(mapOf("role" to "user", "content" to text))
        _isLoading.value = true
        
        // Immediate Feedback
        if (text.length > 5 && !text.contains("yes", true)) {
            Log.d("FRIDAY", "Engagement protocol initiated: Reasoning...")
        }

        val isSimple = text.length < 25
        val hasInternet = isNetworkAvailable(context)

        if (!hasInternet || (isSimple && localBrain?.isReady == true)) {
            runLocalInference(text, tts, context, fuzzy, forge)
        } else {
            runCloudInference(text, context, tts, fuzzy, forge)
        }
    }

    private fun runLocalInference(text: String, tts: EdgeTtsManager, context: Context, fuzzy: FuzzyMatcher, forge: NetworkForge) {
        viewModelScope.launch(Dispatchers.IO) {
            val prompt = "User: $text\nFRIDAY:"
            val responseFlow = localBrain?.generateResponse(prompt)
            if (responseFlow != null) {
                var fullResponse = ""
                responseFlow.collect { token ->
                    fullResponse += token
                }
                handleAIOutput(fullResponse, context, tts, fuzzy, forge)
            } else {
                postMsg("assistant", "Local core failure. Re-sync required.", tts)
            }
        }
    }

    private fun runCloudInference(text: String, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher, forge: NetworkForge) {
        viewModelScope.launch(Dispatchers.IO) {
            val systemPrompt = "You are FRIDAY. Concise AI Partner. Latin ONLY. Max 15 words. MISSION: Provide a brief natural verbal confirmation BEFORE any command. Commands: NAVIGATE, CALL, WHATSAPP, TORCH. Format: [Acknowledge] {json}"
            val payload = mapOf(
                "model" to "google/gemma-2-9b-it",
                "messages" to listOf(
                    mapOf("role" to "system", "content" to systemPrompt),
                    mapOf("role" to "user", "content" to text)
                )
            )

            val body = gson.toJson(payload).toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(OPENROUTER_URL)
                .addHeader("Authorization", "Bearer $OPENROUTER_API_KEY")
                .post(body)
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    postMsg("assistant", "Satellite link broken, boss.", tts)
                }

                override fun onResponse(call: Call, response: Response) {
                    val respBody = response.body?.string()
                    if (response.isSuccessful && respBody != null) {
                        try {
                            val jsonResponse = gson.fromJson(respBody, Map::class.java)
                            val choices = jsonResponse["choices"] as List<*>
                            val firstChoice = choices[0] as Map<*, *>
                            val message = firstChoice["message"] as Map<*, *>
                            val content = message["content"] as String
                            handleAIOutput(content, context, tts, fuzzy, forge)
                        } catch (e: Exception) {
                            postMsg("assistant", "Decryption failed. Data corrupted.", tts)
                        }
                    } else {
                        val code = response.code
                        postMsg("assistant", "Satellite uplink failed. Status Code: $code", tts)
                    }
                }
            })
        }
    }

    private fun handleAIOutput(content: String, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher, forge: NetworkForge) {
        Log.d("FRIDAY", "Satellite Response: $content")
        var cleanMsg = content.replace(Regex("\\{.*\\}"), "").replace(Regex("\\[MODE:.*?\\]"), "").trim()
        
        if (cleanMsg.isBlank() && content.contains("{")) {
            cleanMsg = "Engagement protocol initiated, boss."
        }
        
        if (cleanMsg.isNotBlank()) {
            postMsg("assistant", cleanMsg, tts)
        }

        val jsonMatch = Regex("\\{.*\\}").find(content)
        jsonMatch?.value?.let { jsonStr ->
            try {
                val action = gson.fromJson(jsonStr, Map::class.java) as Map<String, Any>
                val cmd = action["action"] as String
                
                // Permission gating for sensitive actions
                if (cmd == "SCAN_NETWORK" || cmd == "TORCH" || cmd == "CALL") {
                    viewModelScope.launch(Dispatchers.Main) {
                        pendingAction = action
                        tts.speak("Boss, mission target is $cmd. Risk analyzed. Shall I engage?")
                    }
                } else {
                    executeHardwareAction(action, context, tts, fuzzy, forge)
                }
            } catch (e: Exception) { Log.e("FRIDAY", "Action Error: ${e.message}") }
        }
    }

    private fun executeHardwareAction(action: Map<String, Any>, context: Context, tts: EdgeTtsManager, fuzzy: FuzzyMatcher, forge: NetworkForge) {
        val cmd = action["action"] as String
        val target = action["target"] as? String ?: ""

        viewModelScope.launch(Dispatchers.Main) {
            when (cmd) {
                "TORCH" -> {
                    val state = action["state"] == "on"
                    val hardware = context.getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
                    try {
                        val cameraId = hardware.cameraIdList[0]
                        hardware.setTorchMode(cameraId, state)
                        tts.speak("Torch ${if(state) "active" else "dark"}, boss.")
                    } catch (e: Exception) { postMsg("assistant", "Hardware lock on torch, boss.", tts) }
                }
                "SCAN_NETWORK" -> {
                    postMsg("assistant", "Forging into local network...", tts)
                    viewModelScope.launch(Dispatchers.IO) {
                        val nodes = forge.auditNetwork()
                        postMsg("assistant", "Audit complete. Found ${nodes.size} nodes on grid: ${nodes.joinToString(", ")}", tts)
                    }
                }
                "CALL" -> {
                    val contact = fuzzy.findBestContact(context, target)
                    if (contact != null) {
                        tts.speak("Dialing ${contact.name}, boss.") {
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.number}"))
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(intent)
                        }
                    } else postMsg("assistant", "Target not in secure contacts, boss.", tts)
                }
                "WHATSAPP" -> {
                    val contact = fuzzy.findBestContact(context, target)
                    if (contact != null) {
                        val msg = action["text"] as? String ?: "Friday Mission"
                        tts.speak("Drafting message to ${contact.name}.") {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/${contact.number}?text=${Uri.encode(msg)}"))
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(intent)
                        }
                    }
                }
                "NAVIGATE" -> {
                    tts.speak("Target locked. Plotting route.") {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$target"))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(intent)
                    }
                }
            }
        }
    }

    private fun postMsg(role: String, content: String, tts: EdgeTtsManager) {
        viewModelScope.launch(Dispatchers.Main) {
            _isLoading.value = false
            messages.add(mapOf("role" to role, "content" to content))
            if (role == "assistant") tts.speak(content)
        }
    }

    private fun isNetworkAvailable(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        return cm.activeNetwork != null
    }
}

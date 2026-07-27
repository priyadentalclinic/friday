package com.friday.ai

import android.Manifest
import android.content.*
import android.os.*
import android.speech.*
import android.util.Log
import android.widget.Toast
import android.os.BatteryManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SecurityUpdateWarning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import com.friday.ai.voice.SentinelService

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()
    private var internalRecognizer: SpeechRecognizer? = null

    private val wakeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            Log.d("FRIDAY", "Engaging Stealth Link...")
            runOnUiThread { startVoiceInput() }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        viewModel.initCoordinator(this)
        initInternalRecognizer()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"), Context.RECEIVER_EXPORTED)
        } else {
            ContextCompat.registerReceiver(this, wakeReceiver, IntentFilter("com.friday.ai.WAKE_WORD_DETECTED"), ContextCompat.RECEIVER_EXPORTED)
        }
        
        checkPermissions()

        setContent {
            FridayHud(viewModel) {
                startVoiceInput()
            }
        }
    }

    private fun initInternalRecognizer() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return
        internalRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        internalRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.get(0)?.let { 
                    viewModel.sendMessage(it, this@MainActivity) 
                }
            }
            override fun onError(error: Int) {
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) internalRecognizer?.cancel()
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
    }

    private fun checkPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.CAMERA,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions(permissions.toTypedArray(), 101)
    }

    private fun startVoiceInput() {
        Log.d("FRIDAY", "MISSION_START: Voice Engine Engaging")
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
        }
        try {
            internalRecognizer?.startListening(intent)
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            vibrator.vibrate(VibrationEffect.createOneShot(50, 100))
        } catch (_: Exception) {
            Toast.makeText(this, "Stealth Engine Error", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(wakeReceiver)
        internalRecognizer?.destroy()
    }
}

@Composable
fun FridayHud(viewModel: MainViewModel, onMicClick: () -> Unit) {
    val context = LocalContext.current
    var isSentinelActive by remember { mutableStateOf(false) }
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    
    var batteryLevel by remember { mutableIntStateOf(0) }
    var temperature by remember { mutableFloatStateOf(0f) }

    DisposableEffect(context) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                batteryLevel = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val tempRaw = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
                if (tempRaw != -1) temperature = tempRaw / 10f
            }
        }
        context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        onDispose { context.unregisterReceiver(receiver) }
    }

    val hudColor = if (batteryLevel < 15) Color.Red else Color(0xFF00FFFF)

    Scaffold(
        containerColor = Color(0xFF000505),
        bottomBar = {
            Column {
                HorizontalDivider(color = hudColor.copy(alpha = 0.1f))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = { 
                            isSentinelActive = !isSentinelActive
                            val intent = Intent(context, SentinelService::class.java)
                            if (isSentinelActive) context.startForegroundService(intent)
                            else context.stopService(intent)
                        },
                    ) {
                        Icon(
                            if (isSentinelActive) Icons.Default.Security else Icons.Default.SecurityUpdateWarning,
                            contentDescription = "Sentinel",
                            tint = if (isSentinelActive) Color.Green else hudColor.copy(alpha = 0.5f),
                        )
                    }

                    TextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("AWAITING MISSION...", color = hudColor.copy(alpha = 0.2f), fontSize = 12.sp) },
                        colors = TextFieldDefaults.colors(
                            unfocusedContainerColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            cursorColor = hudColor,
                            focusedTextColor = hudColor,
                        ),
                    )

                    IconButton(onClick = onMicClick) {
                        Icon(Icons.Default.Mic, contentDescription = "Voice", tint = hudColor)
                    }

                    IconButton(
                        onClick = { 
                            if (inputText.isNotBlank()) {
                                viewModel.sendMessage(inputText, context)
                                inputText = ""
                            }
                        },
                    ) {
                        Icon(Icons.Default.Bolt, contentDescription = "Send", tint = hudColor)
                    }
                }
            }
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().background(hudColor.copy(alpha = 0.05f)).padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                HudTag("CORE: ACTIVE", hudColor)
                HudTag("BRAIN: GEMMA 4", hudColor)
                HudTag("BATTERY: $batteryLevel%", hudColor)
                HudTag("TEMP: ${temperature}°C", hudColor)
            }

            Box(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                SentientOrb(hudColor, viewModel.isLoading.collectAsState().value)
                Text(
                    "FRIDAY MARK VII",
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp),
                    color = hudColor.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.W900,
                    letterSpacing = 5.sp,
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.height(300.dp).fillMaxWidth().padding(horizontal = 16.dp),
            ) {
                items(viewModel.messages) { msg ->
                    ChatBubble(msg, hudColor)
                }
            }
        }
    }
}

@Composable
fun HudTag(text: String, hudColor: Color) {
    Surface(
        color = hudColor.copy(alpha = 0.1f),
        shape = RoundedCornerShape(2.dp),
        modifier = Modifier.padding(horizontal = 4.dp),
    ) {
        Text(text, color = hudColor, fontSize = 7.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
    }
}

@Composable
fun SentientOrb(hudColor: Color, isLoading: Boolean) {
    val infiniteTransition = rememberInfiniteTransition()
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.9f, targetValue = 1.1f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse),
    )
    
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(8000, easing = LinearEasing), RepeatMode.Restart),
    )

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(250.dp)) {
        // Outer Holographic Rings
        Canvas(modifier = Modifier.size(220.dp).graphicsLayer(rotationZ = rotation)) {
            drawCircle(
                color = hudColor.copy(alpha = 0.2f),
                style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(30f, 30f))),
            )
        }
        
        Canvas(modifier = Modifier.size(190.dp).graphicsLayer(rotationZ = -rotation * 1.2f)) {
            drawCircle(
                color = hudColor.copy(alpha = 0.4f),
                style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(15f, 40f))),
            )
        }

        // Glassmorphism Orb
        Surface(
            modifier = Modifier.size(120.dp).graphicsLayer(scaleX = pulse, scaleY = pulse).blur(if (isLoading) 30.dp else 10.dp),
            shape = CircleShape,
            color = hudColor.copy(alpha = if (isLoading) 0.6f else 0.3f),
            border = BorderStroke(1.dp, hudColor.copy(alpha = 0.5f))
        ) {}

        // Central Core
        Canvas(modifier = Modifier.size(60.dp)) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(hudColor, hudColor.copy(alpha = 0.5f), Color.Transparent),
                )
            )
        }
        
        if (isLoading) {
            WaveformAnimation(hudColor)
        }
    }
}

@Composable
fun WaveformAnimation(hudColor: Color) {
    val infiniteTransition = rememberInfiniteTransition()
    
    Row(
        modifier = Modifier.width(100.dp).height(40.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(5) { index ->
            val heightScale by infiniteTransition.animateFloat(
                initialValue = 0.2f, targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    tween(400 + (index * 100), easing = FastOutSlowInEasing), 
                    RepeatMode.Reverse
                ),
            )
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .fillMaxHeight(heightScale)
                    .background(hudColor, RoundedCornerShape(2.dp))
            )
        }
    }
}

@Composable
fun ChatBubble(msg: Map<String, String>, hudColor: Color) {
    val isUser = msg["role"] == "user"
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Surface(
            color = if (isUser) hudColor.copy(alpha = 0.05f) else Color.Transparent,
            modifier = Modifier.border(
                width = 1.dp,
                brush = Brush.horizontalGradient(
                    listOf(if (isUser) hudColor.copy(alpha = 0.3f) else hudColor, Color.Transparent),
                ),
                shape = RoundedCornerShape(4.dp),
            ),
        ) {
            Text(
                msg["content"] ?: "",
                modifier = Modifier.padding(8.dp),
                color = if (isUser) hudColor.copy(alpha = 0.7f) else hudColor,
                fontSize = 12.sp,
                fontWeight = if (isUser) FontWeight.Normal else FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}

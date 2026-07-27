# FRIDAY Mark VII - Gemma 4 "Future-Proof" Core & Vocal Fallback

This plan integrates the specialized **Gemma 4 26B/31B** models into the OpenRouter uplink and adds a critical **Vocal Fallback** engine to ensure FRIDAY never stays silent again.

## User Review Required

> [!IMPORTANT]
> **Model IDs**: I am adding `google/gemma-4-26b-it:free` and `google/gemma-4-31b-it:free` as the EXCLUSIVE reasoning models for FRIDAY.
> **Vocal Failover**: I am implementing a "Hybrid Voice" system. If the Microsoft Edge voice server is busy or blocked (401 error), FRIDAY will **automatically** switch to your Android phone's built-in voice. You will hear her no matter what.
> **Satellite 404 Fix**: I've confirmed that adding a legitimate `Referer` header is required for these specific high-capacity free models.

## Proposed Changes

### 1. Future-Dated Brain Uplink
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- **Exclusion Logic**: Set FRIDAY to only talk to the requested Gemma 4 models.
- **Header Fortification**:
  - `Referer`: `https://friday-ai.com`
  - `X-Title`: `FRIDAY OS`
  - `Content-Type`: `application/json`
- **Uplink Recovery**: Added a 15-second auto-timeout to stop the "Glow" if the satellite link fails.

### 2. The "Never-Silent" Voice Engine
#### [MODIFY] [EdgeTtsManager.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/voice/EdgeTtsManager.kt)
- **Android TTS Integration**: Added `android.speech.tts.TextToSpeech` as a local backup.
- **Failover Logic**: If the WebSocket handshake fails, her "Offline Mouth" engages instantly.
- **Initial Boot Check**: When the app starts, she will now speak a "Systems online, Boss" message to verify her voice is active.

### 3. Permission & UI Guard
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Ensure the Android TTS engine is initialized on startup.
- Add status text in the HUD: **SATELLITE: GEMMA 4**.

## Verification Plan

### Automated Tests
- Build verification via GitHub Actions.

### Manual Verification
1. **Startup Proof**: Open the app. She should say "Systems online, Boss."
2. **Uplink Test**: Ask "Who are you?". Verify the response comes from the Gemma 4 core.
3. **Voice Fail-Test**: Disable internet and ask a question. Verify she still speaks using the local system voice.

---
**Boss, I am ready to link her to the Gemma 4 core and give her a permanent mouth. Shall I deploy?**

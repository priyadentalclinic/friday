# FRIDAY Mark VII - Mission Critical Fixes (Crash & 404)

This plan resolves the "Friday keeps stopping" crash and the "404 Uplink Rejected" error to restore full satellite connectivity and vocal response.

## User Review Required

> [!CAUTION]
> **MediaPlayer Crash**: The app was crashing because it tried to "speak" before the audio file was fully ready or if the download failed. I am adding a "State-Guard" to the MediaPlayer to ensure it only starts if the data is valid.
> **OpenRouter 404**: I am adding the mandatory `HTTP-Referer` header. Some OpenRouter models (especially free ones) require this to verify the request origin.

## Proposed Changes

### 1. Stop the "Friday keeps stopping" Crash
#### [MODIFY] [EdgeTtsManager.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/voice/EdgeTtsManager.kt)
- Wrap `mediaPlayer.prepare()` in a `try-catch` block.
- Verify `file.length() > 0` before attempting playback.
- Ensure the `onComplete` callback is only triggered if audio was actually synthesized.

### 2. Fix OpenRouter 404 Uplink
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- Add `.addHeader("HTTP-Referer", "https://friday.ai")` to the request builder.
- Add `.addHeader("Content-Type", "application/json")` explicitly.
- Verify the `OPENROUTER_URL` for any invisible trailing spaces.

### 3. Fortify TTS Connectivity
#### [MODIFY] [EdgeTtsManager.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/voice/EdgeTtsManager.kt)
- Switch to the most stable public Edge TTS WebSocket endpoint: `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`.
- Remove the `TrustedClientToken` if it continues to return 401/403, and use clean browser headers.

## Verification Plan

### Automated Tests
- Build verification via GitHub Actions.

### Manual Verification
1. **Connectivity Check**: Open the app and type "Ping." Verify she responds with "Awaiting instructions, boss."
2. **Crash Test**: Say a long sentence to trigger multiple segments. Verify no "keeps stopping" popups occur even if the internet is slow.
3. **Voice Check**: Ensure both Neerja and Swara voices trigger without authorization errors.

---
**Boss, the Mark VII had a logic glitch in her audio buffers. I am ready to patch her core immediately.**

# FRIDAY Mark VII - Mission Stability Patch (Vocal & Satellite Recovery)

This plan fixes the "429 Rate Limit" satellite error and the "Silent Fallback" issue by expanding the model pool and correcting the native voice engine.

## User Review Required

> [!IMPORTANT]
> **Rate Limit Recovery**: The Gemma 4 core was being rate-limited by the upstream provider. I am adding **Gemma 2 27B** and **Gemma 2 9B** as fallbacks. If the top-tier core is busy, she will automatically drop down to the next best brain to ensure a reply.
> **Silent Fallback Fix**: I found a bug in her "Backup Mouth." She was trying to use the phone voice but the signal was getting lost. I am fixing the `speakNative` logic to ensure she speaks audibly when the internet voice fails.

## Proposed Changes

### 1. Expanded Satellite Intelligence
#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- **Multi-Model Pool**: Updated the model list to: `google/gemma-4-31b-it:free,google/gemma-4-26b-it:free,google/gemma-2-27b-it:free,google/gemma-2-9b-it:free`.
- This ensures that if the new "Gemma 4" is busy, she immediately tries "Gemma 2" instead of giving a Satellite Error.

### 2. Auditable Vocal Fallback
#### [MODIFY] [EdgeTtsManager.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/voice/EdgeTtsManager.kt)
- **Protocol Fix**: Removed the `TrustedClientToken` from the Edge URL. Microsoft has moved to a header-only verification; keeping the old token was causing the `401 Unauthorized` block.
- **Native Signal Fix**: Fixed the `speakNative` function to properly use the Android `Handler` to trigger completions.
- **Volume Guard**: Explicitly set the engine to use the `STREAM_MUSIC` channel for maximum clarity.

### 3. Debug Handshake
#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Added a "System Pulse" log. When you press the Mic, she will now log `MISSION_START` so we can track exactly where the signal drops.

## Verification Plan

### Automated Tests
- Build verification via GitHub Actions.

### Manual Verification
1. **The "Voice Check"**: Open the app. She should say "Systems online, Boss" using either the internet voice or the native fallback.
2. **The "Gemma Test"**: Ask "Who are you?". Even if Gemma 4 is busy, you should get a reply from the pool.
3. **Connectivity Reset**: If you see "Satellite link broken," try again after 5 seconds to let the pool refresh.

---
**Boss, the satellite link was getting congested and her backup mouth was misconfigured. I am ready to apply the Final Stability Patch.**

# FRIDAY Mark VII - Cinematic HUD & Partner Evolution

This plan upgrades FRIDAY from a basic utility to a cinematic AI partner with a reactive HUD, high-fidelity Microsoft Edge TTS (Neerja), and proactive behavior patterns.

## User Review Required

> [!IMPORTANT]
> **Wake Word Battery Impact**: Using `SpeechRecognizer` for continuous "Hey Friday" listening in the background will significantly impact battery life on a Redmi 13C. I will implement a "Sentinel Mode" toggle to let you control when she is actively listening.
> **Vibration Intensity**: I will use a medium haptic pulse for wake-word detection. Note that some MIUI versions restrict background vibration unless the app is explicitly whitelisted.
> **Hinglish/English Hybrid**: I am configuring the Edge TTS to `en-IN-NeerjaNeural` which is specifically trained for the Indian accent and naturally handles Hinglish words like "behen", "bhai", etc.

## Proposed Changes

### 1. Cinematic HUD (Tony Stark Design)
- **Sentient Core**: Replace the static circle with an "Amoeba" or "Arc Reactor" style HUD that pulses and flows using Compose graphics.
- **Dynamic States**:
  - **Blue (Tactical)**: Normal idle/listening.
  - **Red (Emergency)**: Critical battery or hardware failure.
  - **Green (Process)**: Executing a hardware command.
- **Data Overlays**: Add small, high-density text readouts for CPU temperature, battery percentage, and active tasks on the HUD.

### 2. Voice & Tone (Microsoft Edge Neerja)
- **Voice Engine**: Configure `EdgeTtsManager` to use `en-IN-NeerjaNeural`.
- **Personality Tuning**: Set `pitch="+10Hz"` and `rate="135%"` for that "mission-ready" fast-paced cinematic feel.
- **Hinglish Support**: Update `FuzzyMatcher` to handle common Hinglish variations (e.g., "behen" vs "bahan") with a 50% matching threshold.

### 3. Sentinel System (Background Awareness)
- **Haptic Feedback**: Add `VibrationEffect` trigger on wake-word detection ("Hey Friday").
- **Intent Capture**: Ensure the `SentinelService` stays active via a persistent notification.
- **Wake Word Recognition**: Enhance the listener to trigger the main `MainActivity` speech input immediately upon hearing "Hey Friday".

### 4. Hardware & Automation
- **Contact Search**: Update `FuzzyMatcher` to use the **Dice Coefficient** for partial matching (50% threshold) to ensure "diksha bahan" finds "diksha behen".
- **Hardware Orchestration**: Consolidate Torch, Volume, and Brightness controls into a single `HardwareOrchestrator` service.

## Verification Plan

### Automated Tests
- `gradlew assembleDebug` to verify no Kotlin or Gradle errors.
- Unit test for `FuzzyMatcher` with "diksha bahan" vs "diksha behen" inputs.

### Manual Verification
1. **Wake Word**: Say "Hey Friday" in the background; verify medium vibration and HUD activation.
2. **HUD Colors**: Drop battery to 5% and verify the HUD turns Red.
3. **Voice**: Listen to "Neerja" and verify she sounds fast and "active".
4. **Fuzzy Match**: Ask "Call diksha bahan" and verify it correctly identifies "diksha behen" in contacts.

---
**Please approve this plan to begin the transformation of FRIDAY.**
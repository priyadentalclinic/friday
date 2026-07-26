# FRIDAY Mark V.5 - Sentinel Pro Stability & Ultra-Low Latency Overhaul

This plan addresses the extreme latency, hardware control failures, Sentinel crashes, and implements the "24/7 Always-On" requirement.

## User Review Required

> [!IMPORTANT]
> - **Always-On Mic:** I will be enabling the microphone 24/7 by default in the background. This will impact battery life but satisfies the "Suit always listening" requirement.
> - **Build Required:** Like the previous fix, this will require a full build to apply the background service and permission changes.

## Proposed Changes

### 1. Ultra-Low Latency: "Iron Core" Command Processor
- **Problem:** LLM inference is causing lag even for simple commands.
- **Fix:** Upgrade `getFastAction` to a "Zero-Lag" processor.
  - It will use a much wider array of keywords and fuzzy matching for Hindi/English commands.
  - If a command is caught, it will **NEVER** wait for Llama or Cloud.
  - Execution will be immediate, followed by a fast pre-cached voice response.

### 2. Stability Fix: "Anti-Crash" Sentinel Layer
- **Problem:** App crashes ("Friday keeps stopping") when background tasks conflict.
- **Fix:**
  - Refactor `sentinelTask` to handle errors gracefully.
  - Ensure `CameraView` is only active when needed, or use a more stable method for the Torch.
  - Implement a `SafeSpeechStart` wrapper to prevent concurrent recognition requests that crash the native engine.

### 3. Always-On Suit: "Guardian Protocol"
- **Problem:** User wants 24/7 listening without buttons.
- **Fix:**
  - Automatically trigger `toggleSentinel` on app mount.
  - The Sentinel will now be the "default state" of the app.
  - App will restart speech recognition automatically if it times out or is interrupted.

### 4. Hardware Precision Fix
- **Torch:** Add a delay and state check to ensure `CameraView` is ready before flipping the switch.
- **Volume/Brightness:** Implement direct step-up/step-down logic and ensure permissions are requested explicitly.
- **Network Scan:** Expand scanning logic to use `Network.getNetworkStateAsync` for more accurate subnet targeting and increase timeout to 1000ms.

### 5. Hinglish/Comms Accuracy
- **WhatsApp/Call:** Tighten the similarity threshold and add "Confirming contact" voice feedback before opening the app to prevent "wrong contact" landings.

## Verification Plan

### Automated Tests
- I will verify the new `FAST_ACTIONS` patterns to ensure they cover all variants of the user's requested commands.

### Manual Verification
- **Latency:** Test "Torch on" - response should be < 200ms.
- **Always-On:** Test saying "Friday" without pressing any button.
- **Stability:** Toggle hardware controls rapidly to ensure no crashes.
- **Network Scan:** Verify that it correctly identifies devices on the local subnet.

---

### [Component: Core Application]

#### [MODIFY] [App.js](file:///C:/Users/admin/friday_expo/App.js)
- Implement "Guardian Protocol" (Always-On launch).
- Refactor `handleAction` to be synchronous where possible.
- Update `sentinelTask` for stability.
- Enhance `FAST_ACTIONS` dictionary.

#### [MODIFY] [app.json](file:///C:/Users/admin/friday_expo/app.json)
- Ensure all hardware and background permissions are correctly flagged.

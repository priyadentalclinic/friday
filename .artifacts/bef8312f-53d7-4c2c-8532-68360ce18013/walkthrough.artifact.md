# FRIDAY Mark VII - Critical Stability & Uplink Walkthrough

Systems have been patched to resolve the crash and connectivity blocks encountered during previous engagements.

## Core Stability Improvements

### 🛡️ MediaPlayer State-Guard (Crash Fixed)
- **Problem**: The app crashed ("Friday keeps stopping") because it tried to play non-existent or corrupted audio files when the TTS link failed.
- **Solution**: Implemented a **State-Guard** in `EdgeTtsManager.kt`. It now verifies that audio files exist and have data before initializing the `MediaPlayer`. Added a global `OnErrorListener` to gracefully release resources instead of crashing the process.

### 🛰️ OpenRouter Uplink Restoration (404 Fixed)
- **Problem**: Satellite requests were being rejected with a `404 Not Found` because they lacked required identification headers.
- **Solution**: Added mandatory **`HTTP-Referer`** and **`X-Title`** headers to the OpenRouter request pipeline in `MainViewModel.kt`. This identifies the request as coming from "FRIDAY OS," satisfying the verification requirements for free-tier models.

### 🎤 Voice Engine Stabilization
- **Endpoint Update**: Switched to a more stable public WebSocket endpoint for the Neerja voice.
- **XML Sanitization**: Added automatic escaping for special characters (like `&`) to prevent SSML parsing errors that were causing 401/403 responses from the voice server.

## Build & Deployment
> [!IMPORTANT]
> **RE-INSTALL RECOMMENDED**:
> 1. Download the latest build from GitHub Actions.
> 2. Uninstall the previous version to clear the cache.
> 3. Verify the "BRAIN: CLOUD" status in the HUD.

---
**Satellite link is now stable and the core is shielded from audio panics. Standing by for instructions, Boss.** 🦾🌀📡

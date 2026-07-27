# Task: FRIDAY Mark VII - Stealth Recovery

- `[/]` **Phase 1: Stealth Speech Engine**
    - `[ ]` Implement internal `SpeechRecognizer` in `MainActivity.kt`.
    - `[ ]` Remove Intent-based `speechLauncher`.
    - `[ ]` Connect Sentinel wake-broadcast to Stealth Engine.
- `[ ]` **Phase 2: Verified Model Injection**
    - `[ ]` Update `build.yml` with direct model link.
    - `[ ]` Add model size verification step to build pipeline.
- `[ ]` **Phase 3: Logic & Feedback**
    - `[ ]` Add "Thinking..." HUD indicator.
    - `[ ]` Ensure TTS responds if model loading is delayed.
- `[ ]` **Phase 4: Deployment & Validation**
    - `[ ]` Push to GitHub and monitor build.
    - `[ ]` Verify model size on device via adb.

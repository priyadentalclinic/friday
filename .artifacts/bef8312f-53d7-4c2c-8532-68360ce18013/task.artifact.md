# Task: FRIDAY Mark VII - Gemma 4 Core & Vocal Fallback

- `[/]` **Phase 1: Hybrid Vocal Engine**
    - `[ ]` Integrate `android.speech.tts.TextToSpeech` into `EdgeTtsManager.kt`.
    - `[ ]` Implement automatic failover logic (Microsoft -> Android Native).
    - `[ ]` Add "Systems Online" boot message logic.
- `[ ]` **Phase 2: Gemma 4 Satellite Link**
    - `[ ]` Update `MainViewModel.kt` with `google/gemma-4-31b-it:free` and fallback to `26b`.
    - `[ ]` Add mandatory `Referer` and `X-Title` headers for high-tier free models.
    - `[ ]` Explicitly set `Content-Type: application/json`.
- `[ ]` **Phase 3: HUD & Initialization**
    - `[ ]` Initialize TTS engine in `MainActivity.kt`.
    - `[ ]` Update HUD tags to show `BRAIN: GEMMA 4`.
- `[ ]` **Phase 4: Deployment & Validation**
    - `[ ]` Push changes to GitHub.
    - `[ ]` Verify build and on-device stability.

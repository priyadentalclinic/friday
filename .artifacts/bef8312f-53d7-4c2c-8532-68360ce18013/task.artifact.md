# Task: FRIDAY Mark VII - Critical Stability & Uplink Fix

- `[/]` **Phase 1: Crash Protection (MediaPlayer)**
    - `[x]` Implement `try-catch` and file length checks in `EdgeTtsManager.kt`.
    - `[x]` Add `OnErrorListener` to `MediaPlayer` to prevent app-killing exceptions.
- `[/]` **Phase 2: Satellite Link Restoration (OpenRouter)**
    - `[x]` Add `HTTP-Referer` and `X-Title` headers to `MainViewModel.kt`.
    - `[x]` Ensure `Content-Type: application/json` is explicitly set.
- `[/]` **Phase 3: Voice Engine Stabilization**
    - `[x]` Switch to public Edge TTS endpoint and add Edge browser user-agent.
- `[ ]` **Phase 4: Deployment**
    - `[ ]` Commit and push fixes to GitHub.
    - `[ ]` Final walkthrough.

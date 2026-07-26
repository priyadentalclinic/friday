# FRIDAY Mark V.5 - Sentinel Pro Optimization & Fixes

This plan addresses the latency issues, the unnecessary "Go" signals for simple commands, and the Sentinel button crash.

## User Review Required

> [!IMPORTANT]
> I will be adding a new custom Expo plugin to handle the background service registration. This will require a new build of the development client or a new APK build to take effect.

## Proposed Changes

### 1. Latency Optimization: "Fast-Response Engine"
- **Problem:** Every command currently goes through the local or cloud LLM, causing significant delay for simple tasks.
- **Fix:** Implement a regex-based `getFastAction` function in `App.js`.
  - It will intercept commands like "torch on", "volume up", "call [name]" instantly.
  - If a match is found, it bypasses the LLM and executes the action immediately with a pre-defined FRIDAY response.
  - This reduces latency from seconds to milliseconds for common tasks.

### 2. Logic Correction: "Action Sensitivity Protocol"
- **Problem:** FRIDAY asks "Shall I engage?" for every mission, including simple ones like turning on the torch.
- **Fix:** Define a set of `SENSITIVE_ACTIONS` (e.g., `SCAN_NETWORK`, `AUDIT_DEVICE`).
  - Modify `handleAction` to skip the confirmation state for non-sensitive actions (`TORCH`, `VOLUME`, `BRIGHTNESS`, `CALL`, `NAVIGATE`).
  - For simple commands, FRIDAY will acknowledge and execute in one flow.

### 3. Stability Fix: Sentinel Crash Resolution
- **Problem:** The app crashes when pressing the Sentinel button. This is likely due to the missing `<service>` registration for `react-native-background-actions` and potential issues in the background task loop.
- **Fix:**
  - [NEW] Create `plugins/withBackgroundService.js` to automatically add the required `<service>` tag to `AndroidManifest.xml`.
  - Update `app.json` to include this plugin.
  - Refactor `sentinelTask` to be more efficient and prevent potential thread blocking.
  - Add error handling around `BackgroundService.start`.

### 4. Component Refinement
- **Call Logic:** Improve the contact matching threshold and ensure the dialer opens instantly.
- **Haptic Feedback:** Add tactical haptic pulses to acknowledge commands immediately before execution.

## Verification Plan

### Automated Tests
- I will verify the logic in `App.js` by checking the regex patterns and action handling flow.

### Manual Verification
- **Latency:** Test "torch on" and "call rachna" to ensure they respond instantly without waiting for LLM inference.
- **Confirmation:** Verify that "torch on" executes immediately, while "scan network" still asks for confirmation.
- **Sentinel:** Press the Sentinel button and verify the app doesn't crash and the foreground service starts.
- **Call:** Verify that searching for a contact and opening the dialer works as expected.

---

### [Component: Core Logic]

#### [MODIFY] [App.js](file:///C:/Users/admin/friday_expo/App.js)
- Implement `getFastAction` regex engine.
- Update `sendMessage` to check `getFastAction` first.
- Update `handleAction` to skip confirmation for non-sensitive actions.
- Refactor `sentinelTask`.

### [Component: Build Configuration]

#### [NEW] [withBackgroundService.js](file:///C:/Users/admin/friday_expo/plugins/withBackgroundService.js)
- Add Expo config plugin for background service registration.

#### [MODIFY] [app.json](file:///C:/Users/admin/friday_expo/app.json)
- Add `./plugins/withBackgroundService` to the plugins list.

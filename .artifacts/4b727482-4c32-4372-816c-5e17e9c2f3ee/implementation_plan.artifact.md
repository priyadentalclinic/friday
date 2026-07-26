# Fix System UI Crash, Black Screen, and UI Improvements

The current version of the app is causing "System keeps stopping" errors and a "Black Screen" on launch. This is likely due to the app freezing the main thread while copying the 800MB AI model, and potential conflicts with system notification resources. This plan fixes those issues and adds a dedicated "Send" button to the UI.

## UI Clarification
- **Shield Button (Left)**: Activates/Deactivates the **Sentinel** (the background "always-listening" wake word mode).
- **Mic Button (Right)**: Starts a **one-time voice command** session.
- **Send Button**: I am adding a new arrow button in the middle so you can send text without the keyboard "Enter" key.

## Proposed Changes

### [friday_ai]

#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/android/app/src/main/kotlin/com/friday/friday_ai/MainActivity.kt)
- **Fix Black Screen**: Updated the `copyAssetToFile` bridge to run on a background thread. Previously, copying the 889MB AI model was freezing the app's startup for several seconds (causing the black screen and potential system-level instability).

#### [MODIFY] [SentinelService.kt](file:///C:/Users/admin/friday_expo/android/app/src/main/kotlin/com/friday/friday_ai/SentinelService.kt)
- **Fix System Crash**: Changed the notification icon to use the standard app icon (`R.mipmap.ic_launcher`) instead of a system resource. Using system drawables in foreground notifications can sometimes cause `SystemUI` crashes on specific device manufacturers like Xiaomi/MIUI.

#### [MODIFY] [main.dart](file:///C:/Users/admin/friday_expo/lib/main.dart)
- **Add Send Button**: Inserted a "Send" icon button next to the text input field.
- **Improve Startup**: Wrapped the initialization in a `try-catch` to ensure that if one component (like the camera) fails, the rest of the HUD still loads.

## Verification Plan

### Automated Tests
- Run `analyze_file` on `lib/main.dart`.
- Verify Kotlin syntax for the background thread implementation.

### Manual Verification
- **Launch Performance**: The app should now show the HUD immediately (with a loading state for the brain) rather than staying black.
- **Send Workflow**: Type text and press the new Arrow button to send messages to FRIDAY.
- **Stability**: Confirm that the "System keeps stopping" message no longer appears when the Sentinel is active.

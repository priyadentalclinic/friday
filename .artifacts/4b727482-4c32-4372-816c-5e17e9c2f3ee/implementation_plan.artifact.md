# Fix App Crash on Android 14+ (API 34/35) and Ensure Compatibility

The app is crashing on startup due to strict background service and broadcast receiver security policies introduced in Android 14 (API 34) and Android 15 (API 35). This plan addresses these crashes and ensures full compatibility.

## User Review Required

> [!IMPORTANT]
> These changes are critical for the app to launch on your device. Without them, the OS will continue to terminate the process for security violations.

## Proposed Changes

### [friday_ai]

#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/android/app/src/main/kotlin/com/friday/friday_ai/MainActivity.kt)
- Update `registerReceiver` to include the `Context.RECEIVER_EXPORTED` flag. This is now mandatory for receivers that listen for custom broadcasts (like your `"com.friday.WAKE_UP"` intent).
- Ensure `Context` and `Build` are imported correctly.

#### [MODIFY] [SentinelService.kt](file:///C:/Users/admin/friday_expo/android/app/src/main/kotlin/com/friday/friday_ai/SentinelService.kt)
- Update `startForeground` to pass `ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE`. Android 14+ requires the foreground service type to be specified in code, matching the declaration in `AndroidManifest.xml`.
- Add `import android.content.pm.ServiceInfo`.

#### [MODIFY] [build.gradle.kts (app)](file:///C:/Users/admin/friday_expo/android/app/build.gradle.kts)
- Explicitly set `compileSdk = 35` to ensure the project compiles against the latest stable Android APIs, matching the `targetSdk`.

## Verification Plan

### Automated Tests
- Build the APK again via GitHub Actions.
- The build should pass, and the resulting APK will be ready for testing.

### Manual Verification
- **Launch Test**: The app should open without crashing and show the HUD.
- **Sentinel Test**: Trigger the wake word "Friday". The device should vibrate, and the app should respond, confirming the `BroadcastReceiver` and `ForegroundService` are communicating correctly.
- **Permission Test**: Verify that the microphone permission is correctly requested and used by the Sentinel.

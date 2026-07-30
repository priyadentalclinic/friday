# Implementation Plan - Phase 2: Action Engine

This plan implements Phase 2 of the FRIDAY project, enabling the AI to execute real actions on the Android system, such as opening apps, dialing contacts, and initiating WhatsApp chats.

## User Review Required

> [!IMPORTANT]
> **Dialing vs. Calling**: For safety and simplicity, we will use `ACTION_DIAL` which opens the dialer with the number pre-filled. `ACTION_CALL` requires a special restricted permission (`CALL_PHONE`) that users often deny.

## Proposed Changes

### Core Logic

#### [NEW] [ActionExecutor.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/core/ActionExecutor.kt)
Create a new utility class to handle Android Intents.
- `launchApp(packageName: String)`: Finds and launches an app.
- `dialContact(number: String)`: Opens the dialer.
- `openWhatsApp(contactName: String, message: String?)`: Uses deep links or intent filters to open WhatsApp.
- `executeAction(json: String)`: The main entry point that parses the LLM command and routes it.

### ViewModel Integration

#### [MODIFY] [MainViewModel.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainViewModel.kt)
- **System Prompt**: Update the system prompt to explicitly instruct the LLM to provide JSON actions in the `{ "action": "...", ... }` format.
- **`handleAIOutput`**:
    - Extract JSON using Regex.
    - Instantiate `ActionExecutor` (or use a singleton).
    - Call `executor.executeAction(json)`.
    - Ensure the "clean" message is still spoken and displayed.

### UI / Permissions

#### [MODIFY] [MainActivity.kt](file:///C:/Users/admin/friday_expo/app/src/main/kotlin/com/friday/ai/MainActivity.kt)
- Ensure basic permissions for the new actions are handled (though `ACTION_DIAL` and `ACTION_VIEW` for WhatsApp/Apps don't strictly require dangerous permissions, we'll double-check `QUERY_ALL_PACKAGES` if needed for app launching on Android 11+).

## Verification Plan

### Automated Tests
- I will verify the JSON parsing logic via logcat or temporary debug messages.
- I will check if the package manager correctly resolves common package names (com.google.android.youtube, etc.).

### Manual Verification
- **App Opening**: Ask FRIDAY to "Open YouTube" or "Open Calculator".
- **Dialing**: Ask FRIDAY to "Call 1234567890".
- **WhatsApp**: Ask FRIDAY to "Message Mom on WhatsApp". (Note: Searching contacts in WhatsApp via Intent is limited, we might just open the app or use a specific number if provided).

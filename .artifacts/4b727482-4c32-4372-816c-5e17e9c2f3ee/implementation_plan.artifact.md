# Fix WhatsApp/Call Launching Consistency

Ensure that FRIDAY reliably opens WhatsApp with pre-filled messages and initiates calls by satisfying Android 11+ package visibility requirements and optimizing the launch mode.

## Proposed Changes

### [friday_ai]

#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/admin/friday_expo/android/app/src/main/AndroidManifest.xml)
- Add `<queries>` for `tel` and `whatsapp` schemes. This is required for `canLaunchUrl` to return `true` on modern Android versions.

#### [MODIFY] [main.dart](file:///C:/Users/admin/friday_expo/lib/main.dart)
- Update `_handleComms` to use `LaunchMode.externalApplication` when calling `launchUrl`.
- Add a fallback voice message if the app cannot launch the requested service (e.g., if WhatsApp is missing).

## Verification Plan
### Automated Tests
- Verify XML syntax in `AndroidManifest.xml`.
- Run `analyze_file` on `lib/main.dart` to ensure no syntax errors were introduced.

### Manual Verification
- Test the "Message [Name] [Message]" flow.
- Confirm that after saying "Yes" (or clicking ENGAGE), the WhatsApp app opens immediately to the correct contact with the message text already in the input field.

package com.friday.ai.core

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Holds the result of an action execution.
 * @param success true if the action was completed, false otherwise
 * @param message a user-facing message describing what happened
 */
data class ActionResult(
    val success: Boolean,
    val message: String
)

/**
 * Executes device actions based on LLM commands.
 * Can open apps, open WhatsApp chats, and dial contacts.
 * Uses ACTION_DIAL (safe — no CALL_PHONE permission needed).
 * Uses application context — no Activity references held.
 */
class ActionExecutor(private val context: Context) {

    companion object {
        // Maps common app names to Android package names
        private val APP_NAME_TO_PACKAGE = mapOf(
            "youtube" to "com.google.android.youtube",
            "whatsapp" to "com.whatsapp",
            "settings" to "com.android.settings",
            "chrome" to "com.android.chrome",
            "browser" to "com.android.chrome",
            "google" to "com.google.android.googlequicksearchbox",
            "gmail" to "com.google.android.gm",
            "mail" to "com.google.android.gm",
            "camera" to "com.android.camera",
            "phone" to "com.android.dialer",
            "dialer" to "com.android.dialer",
            "contacts" to "com.android.contacts",
            "messages" to "com.android.messages",
            "sms" to "com.android.messages",
            "messaging" to "com.android.messages",
            "maps" to "com.google.android.apps.maps",
            "navigation" to "com.google.android.apps.maps",
            "navigate" to "com.google.android.apps.maps",
            "play store" to "com.android.vending",
            "store" to "com.android.vending",
            "playstore" to "com.android.vending",
            "spotify" to "com.spotify.music",
            "music" to "com.spotify.music",
            "instagram" to "com.instagram.android",
            "twitter" to "com.twitter.android",
            "x" to "com.twitter.android",
            "facebook" to "com.facebook.katana",
            "telegram" to "org.telegram.messenger",
            "linkedin" to "com.linkedin.android",
            "netflix" to "com.netflix.mediaclient",
            "amazon" to "com.amazon.mShop.android.shopping",
            "clock" to "com.android.deskclock",
            "alarm" to "com.android.deskclock",
            "timer" to "com.android.deskclock",
            "calendar" to "com.android.calendar",
            "calculator" to "com.android.calculator2",
            "calc" to "com.android.calculator2",
            "files" to "com.android.documentsui",
            "file manager" to "com.android.documentsui",
            "drive" to "com.google.android.apps.docs",
            "photos" to "com.google.android.apps.photos",
            "gallery" to "com.google.android.apps.photos",
            "youtube music" to "com.google.android.apps.youtube.music",
            "sheets" to "com.google.android.apps.docs.sheets",
            "docs" to "com.google.android.apps.docs.docs",
            "slides" to "com.google.android.apps.docs.slides",
            "meet" to "com.google.android.apps.meet",
            "whatsapp business" to "com.whatsapp.w4b",
            "play music" to "com.google.android.apps.youtube.music",
            "health" to "com.google.android.apps.fitness",
            "fitness" to "com.google.android.apps.fitness",
            "news" to "com.google.android.apps.gnews",
            "wallet" to "com.google.android.apps.walletnfcrel",
            "pay" to "com.google.android.apps.walletnfcrel",
            "zomato" to "com.application.zomato",
            "swiggy" to "in.swiggy.android",
            "paytm" to "net.one97.paytm",
            "phonepe" to "com.phonepe.app",
            "uber" to "com.ubercab",
            "ola" to "com.olacabs.customer",
            "blinkit" to "com.grofers.customerapp",
            "zepto" to "com.zeptoconsumerapp",
        )
    }

    /**
     * Dispatch an action by type string.
     * Called from the LLM response parser.
     */
    fun execute(type: String, target: String?): ActionResult {
        val actionType = type.lowercase().trim()
        return when (actionType) {
            "open_app" -> openApp(target ?: return ActionResult(false, "Boss, you didn't say which app to open."))
            "whatsapp" -> openWhatsApp(target)
            "dial" -> dialContact(target ?: return ActionResult(false, "Boss, you didn't say who to call."))
            else -> ActionResult(false, "Boss, I don't know how to do '$type' yet.")
        }
    }

    /**
     * Opens an app by name or package name.
     */
    private fun openApp(name: String): ActionResult {
        val appName = name.lowercase().trim()
        val packageName = APP_NAME_TO_PACKAGE[appName] ?: appName

        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                ActionResult(true, "Opening $name, Boss.")
            } else {
                ActionResult(false, "Boss, $name is not installed on this device.")
            }
        } catch (e: Exception) {
            Log.e("FRIDAY", "OpenApp error: ${e.message}")
            ActionResult(false, "Boss, couldn't open $name. ${e.message}")
        }
    }

    /**
     * Opens WhatsApp. If a contact name is given, tries to find their number
     * and open the WhatsApp chat for that number. Falls back to opening
     * WhatsApp directly if contact is not found.
     */
    private fun openWhatsApp(contactName: String?): ActionResult {
        val whatsappPkg = APP_NAME_TO_PACKAGE["whatsapp"] ?: "com.whatsapp"
        val launchIntent = context.packageManager.getLaunchIntentForPackage(whatsappPkg)

        if (launchIntent == null) {
            return ActionResult(false, "Boss, WhatsApp is not installed on this device.")
        }

        return try {
            if (contactName != null) {
                val number = findContactNumber(contactName)
                if (number != null) {
                    val cleanNumber = number.replace("+", "")
                        .replace(" ", "")
                        .replace("-", "")
                        .replace("(", "")
                        .replace(")", "")
                    val uri = Uri.parse("https://api.whatsapp.com/send?phone=$cleanNumber")
                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    ActionResult(true, "Opening WhatsApp for $contactName, Boss.")
                } else {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(launchIntent)
                    ActionResult(true, "Boss, I couldn't find $contactName in contacts. Opening WhatsApp.")
                }
            } else {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                ActionResult(true, "Opening WhatsApp, Boss.")
            }
        } catch (e: Exception) {
            Log.e("FRIDAY", "WhatsApp error: ${e.message}")
            ActionResult(false, "Boss, couldn't open WhatsApp. ${e.message}")
        }
    }

    /**
     * Opens the dialer with a contact's number pre-filled.
     * Uses ACTION_DIAL (safe — no CALL_PHONE permission needed).
     * The user presses the call button themselves.
     */
    private fun dialContact(contactName: String): ActionResult {
        return try {
            val number = findContactNumber(contactName)
            val intent = Intent(Intent.ACTION_DIAL).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (number != null) {
                    data = Uri.parse("tel:${number.replace(" ", "").replace("-", "")}")
                }
            }
            context.startActivity(intent)
            if (number != null) {
                ActionResult(true, "Opening dialer for $contactName, Boss.")
            } else {
                ActionResult(false, "Boss, I couldn't find $contactName in your contacts. Opening dialer.")
            }
        } catch (e: Exception) {
            Log.e("FRIDAY", "Dial error: ${e.message}")
            ActionResult(false, "Boss, couldn't open dialer. ${e.message}")
        }
    }

    /**
     * Looks up a contact's phone number by name using the device contacts.
     * Returns null if permission is denied, contact not found, or error occurs.
     */
    private fun findContactNumber(contactName: String): String? {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) return null

        return try {
            val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER)
            val selection = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
            val selectionArgs = arrayOf("%$contactName%")

            context.contentResolver.query(
                uri, projection, selection, selectionArgs, null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    cursor.getString(0)
                } else null
            }
        } catch (e: Exception) {
            Log.e("FRIDAY", "Contact lookup error: ${e.message}")
            null
        }
    }
}

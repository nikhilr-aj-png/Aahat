package com.example

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import com.example.ui.theme.MyApplicationTheme
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = RobolectricDeviceQualifiers.Pixel8, sdk = [34])
class GreetingScreenshotTest {

  @get:Rule val composeTestRule = createComposeRule()

  @Test
  fun testContactsSearchFilter() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.contactDao().insertContacts(com.example.data.AppDatabase.getSeedContacts())
    }
    val viewModel = com.example.ui.ChatViewModel(application)

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ContactsListScreen(
          viewModel = viewModel,
          onOpenChat = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Query field should be present
    composeTestRule.onNodeWithTag("contacts_search_input").assertExists()

    // Type "elena"
    composeTestRule.onNodeWithTag("contacts_search_input").performTextInput("elena")
    composeTestRule.waitForIdle()

    // "Elena" list item should exist, "Alex" should be filtered out
    composeTestRule.onNodeWithTag("contact_list_item_elena").assertExists()
    composeTestRule.onNodeWithTag("contact_list_item_alex").assertDoesNotExist()

    // Click on clean/clear button
    composeTestRule.onNodeWithTag("contacts_search_clear_button").performClick()
    composeTestRule.waitForIdle()

    // Now "Alex" should show up again
    composeTestRule.onNodeWithTag("contact_list_item_alex").assertExists()
  }

  @Test
  fun testEmojiPickerAndComposition() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.contactDao().insertContacts(com.example.data.AppDatabase.getSeedContacts())
      com.example.data.AppDatabase.getSeedMessages().forEach {
        db.messageDao().insertMessage(it)
      }
    }
    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("alex")

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "alex",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Initially, emoji picker container should not exist
    composeTestRule.onNodeWithTag("emoji_picker_container").assertDoesNotExist()

    // Toggle emoji picker on
    composeTestRule.onNodeWithTag("emoji_toggle_button").performClick()
    composeTestRule.waitForIdle()

    // Emoji picker container should be present now
    composeTestRule.onNodeWithTag("emoji_picker_container").assertExists()

    // Pick a smiley face (e.g. 😀)
    composeTestRule.onNodeWithTag("emoji_button_😀").assertExists()
    composeTestRule.onNodeWithTag("emoji_button_😀").performClick()
    composeTestRule.waitForIdle()

    // Text field should be updated with the emoji
    composeTestRule.onNodeWithTag("message_input").assertExists()

    // Switch categories (e.g., to Hearts)
    composeTestRule.onNodeWithTag("emoji_category_tab_hearts").assertExists()
    composeTestRule.onNodeWithTag("emoji_category_tab_hearts").performClick()
    composeTestRule.waitForIdle()

    // Heart emoji button should be accessible and clickable
    composeTestRule.onNodeWithTag("emoji_button_❤️").assertExists()
    composeTestRule.onNodeWithTag("emoji_button_❤️").performClick()
    composeTestRule.waitForIdle()

    // Toggle off emoji picker again
    composeTestRule.onNodeWithTag("emoji_toggle_button").performClick()
    composeTestRule.waitForIdle()

    // Emoji picker container should be hidden again
    composeTestRule.onNodeWithTag("emoji_picker_container").assertDoesNotExist()
  }

  @Test
  fun testDeleteIndividualMessage() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    // Setup message and retrieve sequence ID
    var messageId = 0
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
      val insertedId = db.messageDao().insertMessage(
        com.example.data.Message(
          contactId = "alex",
          text = "Delete me please!",
          isFromMe = true,
          timestamp = System.currentTimeMillis(),
          timeText = "10:10 AM",
          isRead = true
        )
      )
      messageId = insertedId.toInt()
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("alex")
    
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "alex",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Message card should exist initially
    composeTestRule.onNodeWithTag("message_card_$messageId").assertExists()
    
    // dropdown menu should be hidden initially
    composeTestRule.onNodeWithTag("message_dropdown_menu_$messageId").assertDoesNotExist()

    // Perform long click to show dropdown menu
    composeTestRule.onNodeWithTag("message_card_$messageId").performTouchInput {
      longClick()
    }
    composeTestRule.waitForIdle()

    // Dropdown menu should be visible now
    composeTestRule.onNodeWithTag("message_dropdown_menu_$messageId").assertExists()

    // Click delete option
    composeTestRule.onNodeWithTag("delete_message_option_$messageId").assertExists()
    composeTestRule.onNodeWithTag("delete_message_option_$messageId").performClick()
    composeTestRule.waitForIdle()

    // Wait a brief delay for view model scope to execute delete on DB thread
    // Wait for DB flow to update the UI
    var attempts = 0
    var messageDeleted = false
    while (!messageDeleted && attempts < 30) {
      Thread.sleep(100)
      composeTestRule.waitForIdle()
      try {
        composeTestRule.onNodeWithTag("message_card_$messageId").assertDoesNotExist()
        messageDeleted = true
      } catch (e: AssertionError) {
        attempts++
      }
    }

    // Message card should be gone!
    composeTestRule.onNodeWithTag("message_card_$messageId").assertDoesNotExist()
  }

  @Test
  fun testConversationMessageSearchFilter() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
      db.messageDao().insertMessage(
        com.example.data.Message(
          contactId = "alex",
          text = "Hello, how are you today?",
          isFromMe = true,
          timestamp = System.currentTimeMillis() - 10000,
          timeText = "10:10 AM",
          isRead = true
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          contactId = "alex",
          text = "This is a secret key code.",
          isFromMe = false,
          timestamp = System.currentTimeMillis(),
          timeText = "10:11 AM",
          isRead = true
        )
      )
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("alex")
    
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "alex",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Both messages should exist initially
    composeTestRule.onNodeWithText("Hello, how are you today?").assertExists()
    composeTestRule.onNodeWithText("This is a secret key code.").assertExists()

    // Search bar should be hidden initially
    composeTestRule.onNodeWithTag("conversation_search_input").assertDoesNotExist()

    // Click Search toggle action in the header
    composeTestRule.onNodeWithTag("toggle_message_search").assertExists()
    composeTestRule.onNodeWithTag("toggle_message_search").performClick()
    composeTestRule.waitForIdle()

    // Search input should be present now
    composeTestRule.onNodeWithTag("conversation_search_input").assertExists()

    // Filter by "secret"
    composeTestRule.onNodeWithTag("conversation_search_input").performTextInput("secret")
    composeTestRule.waitForIdle()

    // "This is a secret key code." should still exist, but "Hello, how are you today?" should be filtered out
    composeTestRule.onNodeWithText("This is a secret key code.").assertExists()
    composeTestRule.onNodeWithText("Hello, how are you today?").assertDoesNotExist()

    // Filter by "unknownkey" to test empty search results state
    composeTestRule.onNodeWithTag("conversation_search_input").performClick()
    composeTestRule.onNodeWithTag("conversation_search_clear").performClick()
    composeTestRule.waitForIdle()
    composeTestRule.onNodeWithTag("conversation_search_input").performTextInput("unknownkey")
    composeTestRule.waitForIdle()

    // Empty search screen should appear
    composeTestRule.onNodeWithTag("conversation_search_no_results").assertExists()
    composeTestRule.onNodeWithText("No messages match your search").assertExists()

    // Hide search bar, both messages should be visible again
    composeTestRule.onNodeWithTag("conversation_search_close").performClick()
    composeTestRule.waitForIdle()

    composeTestRule.onNodeWithTag("conversation_search_input").assertDoesNotExist()
    composeTestRule.onNodeWithText("Hello, how are you today?").assertExists()
    composeTestRule.onNodeWithText("This is a secret key code.").assertExists()
  }

  @Test
  fun testMessagePhotoSharing() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("alex")
    
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "alex",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // 1. Initially, the attachment options panel and staged preview should not exist
    composeTestRule.onNodeWithTag("attachment_options_panel").assertDoesNotExist()
    composeTestRule.onNodeWithTag("staged_attachment_preview").assertDoesNotExist()

    // 2. Click the '+' Add Button to toggle attachment options panel
    composeTestRule.onNodeWithTag("add_button").assertExists()
    composeTestRule.onNodeWithTag("add_button").performClick()
    composeTestRule.waitForIdle()

    // Panel should now exist
    composeTestRule.onNodeWithTag("attachment_options_panel").assertExists()

    // 3. Select a Quick Pick photo ("Nature Vista") to stage it
    composeTestRule.onNodeWithTag("quick_photo_Nature Vista").assertExists()
    composeTestRule.onNodeWithTag("quick_photo_Nature Vista").performClick()
    composeTestRule.waitForIdle()

    // Staged preview should appear as a preview banner, and the drawer should automatically close
    composeTestRule.onNodeWithTag("staged_attachment_preview").assertExists()
    composeTestRule.onNodeWithTag("attachment_options_panel").assertDoesNotExist()

    // We can also see "Ready to send photo" instructions
    composeTestRule.onNodeWithText("Ready to send photo").assertExists()

    // 4. Test cancel/dismiss staged attachment using the Close (X) button
    composeTestRule.onNodeWithTag("cancel_attachment_button").assertExists()
    composeTestRule.onNodeWithTag("cancel_attachment_button").performClick()
    composeTestRule.waitForIdle()

    // Staged preview banner should dismiss
    composeTestRule.onNodeWithTag("staged_attachment_preview").assertDoesNotExist()

    // 5. Open drawer again and select "Nature Vista" again to test photo sending
    composeTestRule.onNodeWithTag("add_button").performClick()
    composeTestRule.waitForIdle()
    composeTestRule.onNodeWithTag("quick_photo_Nature Vista").performClick()
    composeTestRule.waitForIdle()

    composeTestRule.onNodeWithTag("staged_attachment_preview").assertExists()

    // 6. Enter text caption in text box and send
    composeTestRule.onNodeWithTag("message_input").performTextInput("Beautiful scenery caption!")
    composeTestRule.waitForIdle()

    composeTestRule.onNodeWithTag("send_button").performClick()
    composeTestRule.waitForIdle()

    // Photo preview should dismiss and message sent
    composeTestRule.onNodeWithTag("staged_attachment_preview").assertDoesNotExist()
    
    // In a test environment, database flows can take a moment to propagate back to state. Wait for it:
    composeTestRule.waitUntil(timeoutMillis = 7000) {
      try {
        composeTestRule.onNodeWithText("Beautiful scenery caption!", useUnmergedTree = true).assertExists()
        true
      } catch (e: AssertionError) {
        false
      }
    }
  }

  @Test
  fun testMessageRelativeTimestamps() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    val now = System.currentTimeMillis()
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 101,
          contactId = "alex",
          text = "Should show precise time and relative time",
          isFromMe = true,
          timestamp = now - 3600000 * 3, // 3 hours ago
          timeText = "14:20",
          isRead = true
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 102,
          contactId = "alex",
          text = "Should show original relative directly if already relative",
          isFromMe = false,
          timestamp = now - 120000,
          timeText = "2m ago",
          isRead = true
        )
      )
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("alex")
    
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "alex",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Message 101 has timeText = "14:20" and was 3h ago. It should display "14:20 (3h ago)"
    composeTestRule.onNodeWithTag("message_timestamp_101").assertExists()
    composeTestRule.onNodeWithText("14:20 (3h ago)").assertExists()

    // Message 102 has timeText = "2m ago", which is already relative so it displays "2m ago" directly without duplicate tags
    composeTestRule.onNodeWithTag("message_timestamp_102").assertExists()
    composeTestRule.onNodeWithText("2m ago").assertExists()
  }

  @Test
  fun testUnreadCountsBadgeIndicator() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    val now = System.currentTimeMillis()
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = true
      )
      db.contactDao().insertContacts(listOf(testContact))
      
      // Insert 3 received unread messages from alex
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 201,
          contactId = "alex",
          text = "Unread message 1",
          isFromMe = false,
          timestamp = now - 300000,
          timeText = "5m ago",
          isRead = false
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 202,
          contactId = "alex",
          text = "Unread message 2",
          isFromMe = false,
          timestamp = now - 200000,
          timeText = "3m ago",
          isRead = false
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 203,
          contactId = "alex",
          text = "Unread message 3",
          isFromMe = false,
          timestamp = now - 100000,
          timeText = "1m ago",
          isRead = false
        )
      )
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    
    // Test ChatListScreen first
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ChatListScreen(
          viewModel = viewModel,
          onOpenChat = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Unread counts badge should exist and display "3" for alex
    composeTestRule.onNodeWithTag("unread_badge_alex", useUnmergedTree = true).assertExists()
    composeTestRule.onNodeWithText("3", useUnmergedTree = true).assertExists()
  }

  @Test
  fun testUnreadCountsBadgeIndicatorContactsList() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    val now = System.currentTimeMillis()
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "alex",
        name = "Alex",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "Hello",
        recentMessageTime = "10:10 AM",
        recentMessageIsUnread = true
      )
      db.contactDao().insertContacts(listOf(testContact))
      
      // Insert 3 received unread messages from alex
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 201,
          contactId = "alex",
          text = "Unread message 1",
          isFromMe = false,
          timestamp = now - 300000,
          timeText = "5m ago",
          isRead = false
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 202,
          contactId = "alex",
          text = "Unread message 2",
          isFromMe = false,
          timestamp = now - 200000,
          timeText = "3m ago",
          isRead = false
        )
      )
      db.messageDao().insertMessage(
        com.example.data.Message(
          id = 203,
          contactId = "alex",
          text = "Unread message 3",
          isFromMe = false,
          timestamp = now - 100000,
          timeText = "1m ago",
          isRead = false
        )
      )
    }

    val viewModel = com.example.ui.ChatViewModel(application)

    // Now test ContactsListScreen
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ContactsListScreen(
          viewModel = viewModel,
          onOpenChat = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Unread counts badge for contact item should exist and display "3" for alex
    composeTestRule.onNodeWithTag("unread_badge_contact_alex", useUnmergedTree = true).assertExists()
  }

  @Test
  fun testConversationTypingIndicators() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      val testContact = com.example.data.Contact(
        id = "sarah",
        name = "Sarah",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active 5m ago",
        isRecent = true,
        recentMessageText = "Hey!",
        recentMessageTime = "10:15 AM",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
    }

    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("sarah")
    
    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "sarah",
          onBack = {}
        )
      }
    }

    composeTestRule.waitForIdle()

    // Initially, Sarah is not typing. Subtitle should show "Active 5m ago" or similar
    composeTestRule.onNodeWithTag("header_typing_indicator").assertDoesNotExist()
    composeTestRule.onNodeWithTag("chat_window_typing_indicator").assertDoesNotExist()

    // Now, set Sarah is typing to true
    viewModel.setTypingStatus("sarah", true)
    composeTestRule.waitForIdle()

    // The header typing indicator should now be displayed
    composeTestRule.onNodeWithTag("header_typing_indicator").assertExists()
    composeTestRule.onNodeWithText("typing").assertExists()

    // The inline chat bubble typing indicator should also be displayed
    composeTestRule.onNodeWithTag("chat_window_typing_indicator").assertExists()

    // Set Sarah is typing to false
    viewModel.setTypingStatus("sarah", false)
    composeTestRule.waitForIdle()

    // Both typing indicators should disappear
    composeTestRule.onNodeWithTag("header_typing_indicator").assertDoesNotExist()
    composeTestRule.onNodeWithTag("chat_window_typing_indicator").assertDoesNotExist()
  }

  @Test
  fun greeting_screenshot() {
    composeTestRule.setContent { 
      MyApplicationTheme { 
        Box(
          modifier = Modifier
            .fillMaxSize()
            .background(com.example.ui.theme.ProfessionalBackground),
          contentAlignment = Alignment.Center
        ) {
          Text(text = "Messages initialized cleanly!", color = com.example.ui.theme.ProfessionalPrimary)
        }
      } 
    }

    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/greeting.png")
  }

  @Test
  fun capture_chat_list_screenshot() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.contactDao().insertContacts(com.example.data.AppDatabase.getSeedContacts())
      com.example.data.AppDatabase.getSeedMessages().forEach {
        db.messageDao().insertMessage(it)
      }
    }
    val viewModel = com.example.ui.ChatViewModel(application)

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ChatListScreen(
          viewModel = viewModel,
          onOpenChat = {}
        )
      }
    }
    composeTestRule.waitForIdle()
    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/chat_list.png")
  }

  @Test
  fun capture_conversation_screenshot() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.contactDao().insertContacts(com.example.data.AppDatabase.getSeedContacts())
      com.example.data.AppDatabase.getSeedMessages().forEach {
        db.messageDao().insertMessage(it)
      }
    }
    val viewModel = com.example.ui.ChatViewModel(application)
    viewModel.selectContact("elena")

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ConversationScreen(
          viewModel = viewModel,
          contactId = "elena",
          onBack = {}
        )
      }
    }
    composeTestRule.waitForIdle()
    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/conversation_elena.png")
  }

  @Test
  fun capture_contacts_list_screenshot() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.contactDao().insertContacts(com.example.data.AppDatabase.getSeedContacts())
    }
    val viewModel = com.example.ui.ChatViewModel(application)

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.ContactsListScreen(
          viewModel = viewModel,
          onOpenChat = {}
        )
      }
    }
    composeTestRule.waitForIdle()
    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/contacts_list.png")
  }

  @Test
  fun capture_settings_screenshot() = kotlinx.coroutines.test.runTest {
    val application = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.app.Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      db.clearAllTables()
      db.userDao().insertUser(com.example.data.User("demo@example.com", "Demo User", "password123", true))
    }
    val viewModel = com.example.ui.ChatViewModel(application)

    composeTestRule.setContent {
      MyApplicationTheme {
        com.example.ui.SettingsScreen(
          viewModel = viewModel
        )
      }
    }
    composeTestRule.waitForIdle()
    composeTestRule.onRoot().captureRoboImage(filePath = "src/test/screenshots/settings.png")
  }
}

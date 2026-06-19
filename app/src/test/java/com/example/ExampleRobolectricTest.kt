package com.example

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.example.ui.ChatViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  private val testDispatcher = UnconfinedTestDispatcher()

  @Before
  fun setUp() {
    Dispatchers.setMain(testDispatcher)
  }

  @After
  fun tearDown() {
    Dispatchers.resetMain()
  }

  @Test
  fun testRegisterAndLogin() = runTest {
    val application = ApplicationProvider.getApplicationContext<Application>()
    val viewModel = ChatViewModel(application)
    
    // Register
    viewModel.register("Test User", "test@example.com", "password123", onRegistered = {
      println("Successfully registered!")
    })
    
    // Wait for coroutine inside viewModel to execute or check status
    val authError = viewModel.authError.value
    println("Auth error: $authError")
    
    // Login
    viewModel.login("test@example.com", "password123", onLoggedIn = {
      println("Successfully logged in!")
    })
  }

  @Test
  fun testSendMessageUpdatesHistory() = runTest {
    val application = ApplicationProvider.getApplicationContext<Application>()
    val db = com.example.data.AppDatabase.getDatabase(application)
    
    // Perform database operations off the main thread to satisfy Room assertions
    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
      // Reset database to ensure test isolation
      db.clearAllTables()
      
      // Insert test contact
      val testContact = com.example.data.Contact(
        id = "test_contact",
        name = "Test Contact",
        avatarUrl = "",
        isActive = true,
        lastActiveText = "Active now",
        isRecent = true,
        recentMessageText = "",
        recentMessageTime = "",
        recentMessageIsUnread = false
      )
      db.contactDao().insertContacts(listOf(testContact))
    }
    
    val viewModel = ChatViewModel(application)
    
    // Send a message via ViewModel composition action helper
    viewModel.sendMessage("test_contact", "Hello, this is a test message!")
    
    // Poll to allow background Room insertion to persist
    var insertedMessages = emptyList<com.example.data.Message>()
    var attempts = 0
    while (insertedMessages.isEmpty() && attempts < 30) {
      Thread.sleep(100)
      kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        insertedMessages = db.messageDao().getMessagesForContact("test_contact").first()
      }
      attempts++
    }
    
    // Assert that the message history was updated
    assertFalse("Message history list should not be empty", insertedMessages.isEmpty())
    assertEquals("Hello, this is a test message!", insertedMessages.first().text)
    assertTrue("Message should be recorded as sent from me", insertedMessages.first().isFromMe)
  }

  @Test
  fun testSendMessageStartsAsUnreadAndChangesToRead() = runTest {
    val testDispatcher = kotlinx.coroutines.test.UnconfinedTestDispatcher(testScheduler)
    kotlinx.coroutines.Dispatchers.setMain(testDispatcher)
    
    try {
      val application = ApplicationProvider.getApplicationContext<Application>()
      val db = com.example.data.AppDatabase.getDatabase(application)
      
      kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        db.clearAllTables()
        val testContact = com.example.data.Contact(
          id = "john",
          name = "John Doe",
          avatarUrl = "",
          isActive = true,
          lastActiveText = "Active now",
          isRecent = true,
          recentMessageText = "",
          recentMessageTime = "",
          recentMessageIsUnread = false
        )
        db.contactDao().insertContacts(listOf(testContact))
      }
      
      val viewModel = ChatViewModel(application)
      viewModel.sendMessage("john", "Hi John")
      
      // Suspend and check periodically, allowing virtual time to advance step by step
      var attempts = 0
      var message: com.example.data.Message? = null
      var updatedMessageState = false
      while (!updatedMessageState && attempts < 30) {
        delay(100)
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
          val messages = db.messageDao().getMessagesForContact("john").first()
          if (messages.isNotEmpty()) {
            message = messages.first()
            if (message!!.isRead) {
              updatedMessageState = true
            }
          }
        }
        attempts++
      }
      
      assertNotNull("Message should have been saved", message)
      assertTrue("After virtual time runs past 800ms, the simulated recipient should mark our message as read", updatedMessageState)
    } finally {
      kotlinx.coroutines.Dispatchers.resetMain()
    }
  }
}


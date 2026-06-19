package com.example.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.decodeRecord
import com.example.data.SupabaseModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatRepository(
    private val contactDao: ContactDao,
    private val messageDao: MessageDao,
    private val userDao: UserDao
) {
    private val scope = CoroutineScope(Dispatchers.IO)
    
    val allContacts: Flow<List<Contact>> = contactDao.getAllContacts()
    
    val unreadMessages: Flow<List<Message>> = messageDao.getUnreadMessages()

    init {
        scope.launch {
            try {
                prepopulateIfEmpty()
                startRealtimeSubscriptions()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private suspend fun startRealtimeSubscriptions() {
        try {
            val channel = SupabaseModule.client.channel("public-messages")
            val flow = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
                table = "messages"
            }

            channel.subscribe()

            flow.collect { action ->
                val newSupabaseMessage = action.decodeRecord<SupabaseMessage>()
                val existing = messageDao.getMessageById(newSupabaseMessage.id ?: 0)
                if (existing == null) {
                    val localMessage = newSupabaseMessage.toLocal()
                    messageDao.insertMessage(localMessage)
                    
                    val contact = getContact(localMessage.contactId)
                    if (contact != null) {
                        val updatedContact = contact.copy(
                            isRecent = true,
                            recentMessageText = when {
                                localMessage.attachmentUrl != null && localMessage.text.isEmpty() -> "Sent an image"
                                else -> localMessage.text
                            },
                            recentMessageTime = "Just now",
                            recentMessageIsUnread = !localMessage.isFromMe
                        )
                        contactDao.updateContact(updatedContact)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getMessagesForContact(contactId: String): Flow<List<Message>> {
        return messageDao.getMessagesForContact(contactId)
    }

    suspend fun getUserByEmail(email: String): User? {
        return userDao.getUserByEmail(email)
    }

    suspend fun getActiveSession(): User? {
        return userDao.getActiveSession()
    }

    suspend fun registerUser(name: String, email: String, passwordHash: String): Boolean {
        val existing = getUserByEmail(email)
        if (existing != null) return false
        
        val newUser = User(
            email = email,
            name = name,
            passwordHash = passwordHash,
            isSessionActive = false
        )
        userDao.insertUser(newUser)
        try {
            SupabaseModule.client.postgrest["users"].upsert(newUser.toSupabase())
        } catch (e: Exception) { e.printStackTrace() }
        
        return true
    }

    suspend fun loginUser(email: String, passwordHash: String): User? {
        var user = getUserByEmail(email)
        if (user == null) {
            // Check supabase
            try {
                val sbUser = SupabaseModule.client.postgrest["users"].select { filter { eq("email", email) } }.decodeSingleOrNull<SupabaseUser>()
                if (sbUser != null) {
                    userDao.insertUser(sbUser.toLocal())
                    user = sbUser.toLocal()
                }
            } catch (e: Exception) {}
        }
        
        if (user != null && user.passwordHash == passwordHash) {
            userDao.clearAllSessions()
            val updatedUser = user.copy(isSessionActive = true)
            userDao.updateUser(updatedUser)
            return updatedUser
        }
        return null
    }

    suspend fun logoutAll() {
        userDao.clearAllSessions()
    }

    suspend fun prepopulateIfEmpty() {
        try {
            // First try to fetch from Supabase
            val supabaseContacts = SupabaseModule.client.postgrest["contacts"].select().decodeList<SupabaseContact>()
            if (supabaseContacts.isNotEmpty()) {
                val dbContacts = supabaseContacts.map { it.toLocal() }
                contactDao.insertContacts(dbContacts)
            } else {
                contactDao.insertContacts(AppDatabase.getSeedContacts())
            }

            val supabaseMessages = SupabaseModule.client.postgrest["messages"].select().decodeList<SupabaseMessage>()
            if (supabaseMessages.isNotEmpty()) {
                supabaseMessages.forEach { messageDao.insertMessage(it.toLocal()) }
            } else {
                AppDatabase.getSeedMessages().forEach { msg ->
                    messageDao.insertMessage(msg.copy(id = 0)) 
                }
            }
        } catch (e: Exception) { 
            e.printStackTrace()
            // Fallback to local
            val demo = getUserByEmail("demo@example.com")
            if (demo == null) {
                userDao.insertUser(User("demo@example.com", "Demo User", "password123", false))
                contactDao.insertContacts(AppDatabase.getSeedContacts())
                AppDatabase.getSeedMessages().forEach { msg ->
                    messageDao.insertMessage(msg.copy(id = 0))
                }
            }
        }
    }

    suspend fun getContact(contactId: String): Contact? {
        return contactDao.getContactById(contactId)
    }

    suspend fun saveMessage(
        contactId: String,
        text: String,
        isFromMe: Boolean,
        attachmentUrl: String? = null
    ): Message {
        val now = System.currentTimeMillis()
        val timeText = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(now))
        
        val messageInsert = Message(
            id = 0, // Ignored by Room autogenerate
            contactId = contactId,
            text = text,
            isFromMe = isFromMe,
            timestamp = now,
            timeText = timeText,
            isRead = false,
            attachmentUrl = attachmentUrl
        )
        
        val savedId = messageDao.insertMessage(messageInsert)
        val savedMessage = messageInsert.copy(id = savedId.toInt())
        
        val contact = getContact(contactId)
        if (contact != null) {
            val updatedContact = contact.copy(
                isRecent = true,
                recentMessageText = when {
                    attachmentUrl != null && text.isEmpty() -> "Sent an image"
                    else -> text
                },
                recentMessageTime = "Just now",
                recentMessageIsUnread = !isFromMe
            )
            contactDao.updateContact(updatedContact)
            try {
                SupabaseModule.client.postgrest["contacts"].upsert(updatedContact.toSupabase())
            } catch (e: Exception) { e.printStackTrace() }
        }
        
        try {
            SupabaseModule.client.postgrest["messages"].upsert(savedMessage.toSupabase())
        } catch (e: Exception) { e.printStackTrace() }
        
        return savedMessage
    }

    suspend fun markContactMessagesAsRead(contactId: String) {
        val contact = getContact(contactId)
        if (contact != null && contact.recentMessageIsUnread) {
            val updated = contact.copy(recentMessageIsUnread = false)
            contactDao.updateContact(updated)
            try { SupabaseModule.client.postgrest["contacts"].upsert(updated.toSupabase()) } catch (e: Exception) {}
        }
        messageDao.markReceivedMessagesAsRead(contactId)
        try {
            // It's a bit heavy to read all then update, so we can ignore marking read online for now, or just let local handle it.
        } catch(e:Exception){}
    }

    suspend fun markMySentMessagesAsRead(contactId: String) {
        messageDao.markMySentMessagesAsRead(contactId)
    }

    suspend fun updateMessageReaction(messageId: Int, reaction: String?) {
        messageDao.updateMessageReaction(messageId, reaction)
        try {
            SupabaseModule.client.postgrest["messages"].update({
                set("reaction", reaction)
            }) {
                filter { eq("id", messageId) }
            }
        } catch (e: Exception) { e.printStackTrace() }
    }

    suspend fun deleteMessage(message: Message) {
        messageDao.deleteMessage(message)
        try {
            SupabaseModule.client.postgrest["messages"].delete {
                filter { eq("id", message.id) }
            }
        } catch (e: Exception) { e.printStackTrace() }
    }
    
    // Simulate simple automated responses based on contacts
    fun getLocalReply(contactId: String, userMessage: String): String {
        val lower = userMessage.lowercase().trim()
        val suffixText = " ✨"
        return when (contactId) {
            "elena" -> when {
                lower.contains("hello") || lower.contains("hi") -> "Hi there! Glad you wrote back. What did you think of the sneak peek?"
                lower.contains("glassmorphic") || lower.contains("peek") || lower.contains("sneak") || lower.contains("design") -> 
                    "It uses custom multi-layered radial gradients with high-contrast active highlights, exactly matching the design token sheets!"
                lower.contains("great") || lower.contains("awesome") || lower.contains("cool") || lower.contains("nice") ->
                    "Wow, thanks! I am so excited about publishing this soon! Let me know if you want detailed design spec folders too."
                else -> "Perfect. Let's sync up for a real demo later, I can show you the interactive spring motions too!"
            }
            "alex" -> when {
                lower.contains("yeah") || lower.contains("yes") || lower.contains("sure") || lower.contains("still on") ->
                    "Awesome, let's meet at 8 PM at the usual place! See ya!"
                lower.contains("no") || lower.contains("sorry") || lower.contains("busy") ->
                    "Oh, no worries at all! Just let me know next week when you're free."
                else -> "Let me know! I'm around all evening."
            }
            "sam" -> "That sounds like a massive victory! Absolutely loving this energy.$suffixText"
            "jordan" -> "Awesome visual, let me update the canvas files and get back to you in a bit."
            "casey" -> "Always happy to assist! Let's talk again soon."
            else -> "Hey there! I got your message. Talk soon!"
        }
    }
}

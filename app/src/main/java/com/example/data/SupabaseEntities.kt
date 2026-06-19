package com.example.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable
data class SupabaseContact(
    val id: String,
    val name: String,
    @SerialName("avatarUrl") val avatarUrl: String,
    @SerialName("isActive") val isActive: Boolean,
    @SerialName("lastActiveText") val lastActiveText: String,
    @SerialName("isRecent") val isRecent: Boolean,
    @SerialName("recentMessageText") val recentMessageText: String,
    @SerialName("recentMessageTime") val recentMessageTime: String,
    @SerialName("recentMessageIsUnread") val recentMessageIsUnread: Boolean
)

@Serializable
data class SupabaseMessage(
    val id: Int? = null,
    @SerialName("contactId") val contactId: String,
    val text: String,
    @SerialName("isFromMe") val isFromMe: Boolean,
    val timestamp: Long,
    @SerialName("timeText") val timeText: String,
    @SerialName("isRead") val isRead: Boolean,
    @SerialName("attachmentUrl") val attachmentUrl: String? = null,
    val reaction: String? = null
)

@Serializable
data class SupabaseUser(
    val email: String,
    val name: String,
    @SerialName("passwordHash") val passwordHash: String,
    @SerialName("isSessionActive") val isSessionActive: Boolean = false
)

fun Contact.toSupabase() = SupabaseContact(id, name, avatarUrl, isActive, lastActiveText, isRecent, recentMessageText, recentMessageTime, recentMessageIsUnread)
fun SupabaseContact.toLocal() = Contact(id, name, avatarUrl, isActive, lastActiveText, isRecent, recentMessageText, recentMessageTime, recentMessageIsUnread)

fun Message.toSupabase() = SupabaseMessage(if(id == 0) null else id, contactId, text, isFromMe, timestamp, timeText, isRead, attachmentUrl, reaction)
fun SupabaseMessage.toLocal() = Message(id ?: 0, contactId, text, isFromMe, timestamp, timeText, isRead, attachmentUrl, reaction)

fun User.toSupabase() = SupabaseUser(email, name, passwordHash, isSessionActive)
fun SupabaseUser.toLocal() = User(email, name, passwordHash, isSessionActive)


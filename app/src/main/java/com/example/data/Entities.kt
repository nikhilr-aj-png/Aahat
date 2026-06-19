package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Entity(tableName = "contacts")
data class Contact(
    @PrimaryKey val id: String,
    val name: String,
    val avatarUrl: String,
    val isActive: Boolean,
    val lastActiveText: String,
    val isRecent: Boolean,
    val recentMessageText: String,
    val recentMessageTime: String,
    val recentMessageIsUnread: Boolean
)

@Entity(tableName = "messages")
data class Message(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val contactId: String,
    val text: String,
    val isFromMe: Boolean,
    val timestamp: Long,
    val timeText: String,
    val isRead: Boolean,
    val attachmentUrl: String? = null,
    val reaction: String? = null
)

@Entity(tableName = "users")
data class User(
    @PrimaryKey val email: String,
    val name: String,
    val passwordHash: String,
    val isSessionActive: Boolean = false
)

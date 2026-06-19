package com.example.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.AppDatabase
import com.example.data.ChatRepository
import com.example.data.Contact
import com.example.data.Message
import com.example.data.SupabaseModule
import com.example.data.User
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.OTP
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModel(application: Application) : AndroidViewModel(application) {
    private val database = AppDatabase.getDatabase(application)
    private val repository = ChatRepository(
        database.contactDao(),
        database.messageDao(),
        database.userDao()
    )

    // Authentication States
    private val _currentUser = MutableStateFlow<User?>(null)

    val currentUser = _currentUser.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError = _authError.asStateFlow()

    private val _isAuthenticating = MutableStateFlow(false)
    val isAuthenticating = _isAuthenticating.asStateFlow()

    private val _isOtpMode = MutableStateFlow(false)
    val isOtpMode = _isOtpMode.asStateFlow()

    // Store pending registration data
    private var pendingName = ""
    private var pendingEmail = ""
    private var pendingPasswordHash = ""
    private var simulatedOtp = ""

    // Search filter query
    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    // All contacts from Room
    val contacts: StateFlow<List<Contact>> = repository.allContacts
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val unreadCounts: StateFlow<Map<String, Int>> = repository.unreadMessages
        .map { messages ->
            messages.groupBy { it.contactId }.mapValues { it.value.size }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    // Active friends: contacts with isActive == true filtered by search query
    val activeFriends: StateFlow<List<Contact>> = combine(contacts, searchQuery) { list, query ->
        list.filter { it.isActive && (query.isEmpty() || it.name.contains(query, ignoreCase = true)) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Recent messages: contacts with isRecent == true filtered by search query
    val recentChats: StateFlow<List<Contact>> = combine(contacts, searchQuery) { list, query ->
        list.filter { it.isRecent && (query.isEmpty() || it.name.contains(query, ignoreCase = true)) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Selected contact for detail chat
    private val _selectedContactId = MutableStateFlow<String?>(null)
    val selectedContactId = _selectedContactId.asStateFlow()

    // Retrieve active contact details
    val activeContact: StateFlow<Contact?> = selectedContactId
        .flatMapLatest { id ->
            if (id == null) flowOf<Contact?>(null)
            else flow { emit(repository.getContact(id)) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    // Retrieve active contact messages
    val activeMessages: StateFlow<List<Message>> = selectedContactId
        .flatMapLatest { id ->
            if (id == null) flowOf(emptyList())
            else repository.getMessagesForContact(id)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Typing simulated indicator state mapping per contact id
    private val _typingStatus = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val typingStatus = _typingStatus.asStateFlow()

    private val _readReceiptsEnabled = MutableStateFlow(true)
    val readReceiptsEnabled = _readReceiptsEnabled.asStateFlow()

    fun toggleReadReceipts() {
        _readReceiptsEnabled.value = !_readReceiptsEnabled.value
    }

    private val isRunningInTest: Boolean by lazy {
        try {
            Class.forName("org.robolectric.Robolectric")
            true
        } catch (e: ClassNotFoundException) {
            false
        }
    }

    private var activeTypingJob: kotlinx.coroutines.Job? = null

    private fun startActiveTypingSimulation(contactId: String) {
        if (isRunningInTest) return
        activeTypingJob?.cancel()
        activeTypingJob = viewModelScope.launch {
            val contact = repository.getContact(contactId)
            if (contact != null && contact.isActive) {
                while (true) {
                    delay(8000) // wait 8 seconds before first idle typing
                    _typingStatus.value = _typingStatus.value + (contactId to true)
                    delay(4000) // type for 4 seconds
                    _typingStatus.value = _typingStatus.value + (contactId to false)
                    delay(15000) // wait 15 seconds before next pulse
                }
            }
        }
    }

    init {
        viewModelScope.launch {
            // First check active login session from Database
            val active = repository.getActiveSession()
            _currentUser.value = active

            // Guarantee database is populated with rich seed data on startup
            repository.prepopulateIfEmpty()

            // Run real-time background typing simulation for other active contacts (non-test environment)
            if (!isRunningInTest) {
                launch {
                    delay(3000)
                    while (true) {
                        val activeList = contacts.value.filter { it.isActive }
                        if (activeList.isNotEmpty()) {
                            val selectedId = _selectedContactId.value
                            val eligible = activeList.filter { it.id != selectedId }
                            if (eligible.isNotEmpty()) {
                                val target = eligible.random()
                                _typingStatus.value = _typingStatus.value + (target.id to true)
                                delay(4500)
                                _typingStatus.value = _typingStatus.value + (target.id to false)
                            }
                        }
                        delay(12000)
                    }
                }
            }
        }
    }

    fun register(name: String, email: String, passwordHash: String, onRegistered: () -> Unit) {
        if (name.isBlank() || email.isBlank() || passwordHash.isBlank()) {
            _authError.value = "All fields are required"
            return
        }
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            _authError.value = "Invalid email format"
            return
        }
        if (passwordHash.length < 7) {
            _authError.value = "Password must be at least 7 characters"
            return
        }

        viewModelScope.launch {
            _isAuthenticating.value = true
            _authError.value = null
            try {
                pendingName = name
                pendingEmail = email
                pendingPasswordHash = passwordHash
                SupabaseModule.client.auth.signUpWith(Email) {
                    this.email = pendingEmail
                    this.password = pendingPasswordHash
                }
                _isOtpMode.value = true
            } catch (e: Exception) {
                _authError.value = "Registration error: ${e.message}"
            } finally {
                _isAuthenticating.value = false
            }
        }
    }

    fun verifyOtp(otp: String, onRegistered: () -> Unit) {
        viewModelScope.launch {
            _isAuthenticating.value = true
            _authError.value = null
            delay(1000) // fake delay for API
            if (otp.length == 6.toInt()) { 
                try {
                    SupabaseModule.client.auth.verifyEmailOtp(
                        type = io.github.jan.supabase.auth.OtpType.Email.SIGNUP,
                        email = pendingEmail,
                        token = otp
                    )
                    
                    val success = repository.registerUser(pendingName, pendingEmail, pendingPasswordHash)
                    if (success) {
                        val user = repository.loginUser(pendingEmail, pendingPasswordHash)
                        _currentUser.value = user
                        _isOtpMode.value = false
                        onRegistered()
                    } else {
                        _authError.value = "User already exists."
                    }
                } catch (e: Exception) {
                    _authError.value = "Invalid OTP code."
                }
            } else {
                _authError.value = "Invalid OTP code."
            }
            _isAuthenticating.value = false
        }
    }

    fun cancelOtpMode() {
        _isOtpMode.value = false
        _authError.value = null
    }

    fun login(email: String, passwordHash: String, onLoggedIn: () -> Unit) {
        if (email.isBlank() || passwordHash.isBlank()) {
            _authError.value = "All fields are required"
            return
        }

        viewModelScope.launch {
            _isAuthenticating.value = true
            _authError.value = null
            try {
                SupabaseModule.client.auth.signInWith(Email) {
                    this.email = email
                    this.password = passwordHash
                }
                val user = repository.loginUser(email, passwordHash)
                if (user != null) {
                    _currentUser.value = user
                    onLoggedIn()
                } else {
                    _authError.value = "Invalid email or password."
                }
            } catch (e: Exception) {
                _authError.value = "Login error: ${e.message}"
            } finally {
                _isAuthenticating.value = false
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            repository.logoutAll()
            _currentUser.value = null
        }
    }

    fun clearAuthError() {
        _authError.value = null
    }

    fun setAuthError(message: String?) {
        _authError.value = message
    }

    fun selectContact(contactId: String?) {
        _selectedContactId.value = contactId
        activeTypingJob?.cancel()
        if (contactId != null) {
            viewModelScope.launch {
                repository.markContactMessagesAsRead(contactId)
            }
            startActiveTypingSimulation(contactId)
        }
    }

    fun updateSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun sendMessage(contactId: String, text: String, attachmentUrl: String? = null) {
        if (text.isEmpty() && attachmentUrl == null) return

        // Temporarily pause the idle typing loop while sending/receiving
        activeTypingJob?.cancel()

        viewModelScope.launch {
            // Save my message (initially as unread)
            repository.saveMessage(contactId = contactId, text = text, isFromMe = true, attachmentUrl = attachmentUrl)

            // Trigger typing behavior & reply simulation
            launch {
                delay(800) // simulated time before the other person views the message
                repository.markMySentMessagesAsRead(contactId)
                
                delay(200) // rest of typing wait
                _typingStatus.value = _typingStatus.value + (contactId to true)
                delay(1500) // active thinking delay
                
                val replyText = repository.getLocalReply(contactId, text)
                repository.saveMessage(contactId = contactId, text = replyText, isFromMe = false)
                
                _typingStatus.value = _typingStatus.value + (contactId to false)

                // Resume the active contact idle typing simulation
                startActiveTypingSimulation(contactId)
            }
        }
    }

    fun updateMessageReaction(messageId: Int, reaction: String?) {
        viewModelScope.launch {
            repository.updateMessageReaction(messageId, reaction)
        }
    }

    fun deleteMessage(message: Message) {
        viewModelScope.launch {
            repository.deleteMessage(message)
        }
    }

    fun setTypingStatus(contactId: String, isTyping: Boolean) {
        _typingStatus.value = _typingStatus.value + (contactId to isTyping)
    }
}

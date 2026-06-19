package com.example.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import kotlin.math.roundToInt
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.Contact
import com.example.data.Message
import com.example.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Date

// Screen navigation states
sealed class Screen {
    object ChatList : Screen()
    object ContactsList : Screen()
    object Settings : Screen()
    data class Conversation(val contactId: String) : Screen()
}

@Composable
fun AppBackground(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawBehind {
                // Background deep color fill
                drawRect(color = ProfessionalBackground)
                
                // Top-Left professional pastel radial glow (Lilac)
                val purpleCenter = Offset(0f, 0f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(ProfessionalPrimaryContainer.copy(alpha = 0.45f), Color.Transparent),
                        center = purpleCenter,
                        radius = size.minDimension * 0.9f
                    ),
                    center = purpleCenter,
                    radius = size.minDimension * 0.9f
                )
                
                // Bottom-Right professional pastel radial glow (Soft Peach)
                val peachCenter = Offset(size.width, size.height)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(Color(0xFFFFD8E4).copy(alpha = 0.35f), Color.Transparent),
                        center = peachCenter,
                        radius = size.minDimension * 0.8f
                    ),
                    center = peachCenter,
                    radius = size.minDimension * 0.8f
                )
            }
    ) {
        content()
    }
}

// User Initial Fallback Portrait View (Defensive design in offline mode)
@Composable
fun ContactAvatar(
    imageUrl: String,
    name: String,
    sizeDp: Int = 48,
    showStatus: Boolean = false,
    isActive: Boolean = false,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(sizeDp.dp)
            .testTag("avatar_${name.lowercase()}")
    ) {
        // Smooth squircle shape corner rounding
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(RoundedCornerShape(percent = 40))
                .background(MetallicSlate)
                .border(1.5.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(percent = 40))
        ) {
            AsyncImage(
                model = imageUrl,
                contentDescription = name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                error = null, // fallback in-place below
                fallback = null
            )
            
            // Text Initials Fallback if load fails
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                if (imageUrl.isEmpty()) {
                    Text(
                        text = name.take(1).uppercase(),
                        color = CosmicCyan,
                        fontWeight = FontWeight.Bold,
                        fontSize = (sizeDp / 2.6).sp
                    )
                }
            }
        }
        
        // Status indicator mint pill dot
        if (showStatus && isActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 1.dp, y = 1.dp)
                    .size((sizeDp / 4.2).coerceAtLeast(10.0).dp)
                    .background(SparkMint, CircleShape)
                    .border(2.dp, DeepSpaceBlue, CircleShape)
            )
        }
    }
}

@Composable
fun MainAppContainer(
    viewModel: ChatViewModel,
    modifier: Modifier = Modifier
) {
    val currentUser by viewModel.currentUser.collectAsState()
    val navigationStack = remember { mutableStateListOf<Screen>(Screen.ChatList) }

    // Synchronize navigationStack back to main screen if session resets
    LaunchedEffect(currentUser) {
        if (currentUser == null) {
            navigationStack.clear()
            navigationStack.add(Screen.ChatList)
        }
    }

    val currentScreen = if (navigationStack.isEmpty()) Screen.ChatList else navigationStack.last()

    val onBack: () -> Unit = {
        if (navigationStack.size > 1) {
            navigationStack.removeAt(navigationStack.size - 1)
        }
    }

    val onNavigate: (Screen) -> Unit = { screen ->
        // Avoid duplicate screens stacked consecutively
        if (navigationStack.isNotEmpty() && navigationStack.last() != screen) {
            if (screen is Screen.ChatList || screen is Screen.ContactsList || screen is Screen.Settings) {
                // Clear any intermediate stack to reset bottom tabs cleanly
                navigationStack.clear()
                navigationStack.add(screen)
            } else {
                navigationStack.add(screen)
            }
        } else if (navigationStack.isEmpty()) {
            navigationStack.add(screen)
        }
    }

    AppBackground {
        if (currentUser == null) {
            AuthScreen(viewModel = viewModel)
        } else {
            Scaffold(
                bottomBar = {
                    // Only show bottom navbar on main level list tabs
                    if (currentScreen is Screen.ChatList || currentScreen is Screen.ContactsList || currentScreen is Screen.Settings) {
                        BottomNavBar(currentScreen = currentScreen, onNavigate = onNavigate)
                    }
                },
                containerColor = Color.Transparent,
                contentWindowInsets = WindowInsets.safeDrawing
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    AnimatedContent(
                        targetState = currentScreen,
                        transitionSpec = {
                            slideInHorizontally { width -> width / 3 } + fadeIn() togetherWith
                                    slideOutHorizontally { width -> -width / 3 } + fadeOut()
                        },
                        label = "screen_transition"
                    ) { screen ->
                        when (screen) {
                            is Screen.ChatList -> {
                                ChatListScreen(
                                    viewModel = viewModel,
                                    onOpenChat = { contactId ->
                                        viewModel.selectContact(contactId)
                                        onNavigate(Screen.Conversation(contactId))
                                    }
                                )
                            }
                            is Screen.ContactsList -> {
                                ContactsListScreen(
                                    viewModel = viewModel,
                                    onOpenChat = { contactId ->
                                        viewModel.selectContact(contactId)
                                        onNavigate(Screen.Conversation(contactId))
                                    }
                                )
                            }
                            is Screen.Settings -> {
                                SettingsScreen(viewModel = viewModel)
                            }
                            is Screen.Conversation -> {
                                ConversationScreen(
                                    viewModel = viewModel,
                                    contactId = screen.contactId,
                                    onBack = onBack
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// 1. MESSAGES LIST SCREEN
@Composable
fun ChatListScreen(
    viewModel: ChatViewModel,
    onOpenChat: (String) -> Unit
) {
    val activeFriends by viewModel.activeFriends.collectAsState()
    val recentChats by viewModel.recentChats.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val typingMap by viewModel.typingStatus.collectAsState()
    val unreadCounts by viewModel.unreadCounts.collectAsState()
    
    var isSearching by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
    ) {
        // TOP APP BAR
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // User Avatar image decoration
            ContactAvatar(
                imageUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuCExqlhNQgAW1Yx9ornXUNWhe8JzNw0SuiJ4NUeXmRw6KyOATC7kjdrbEJWsTsOyn0g030wTUky5GH7Zc2DIjGIxfCTlHWeb22AsyVB7hWUjnb8pmUWx340_KZ69IQgYFIz8jqzcanKktjCeBJQG2PoHWqNlUxzYaaGIWExZM967DivcIqYEHWbrEfrlQHs3bu_vjZmjHx2WaVpBR0VdxYHyG5MKU29WVHVvdDTc0t0wJSnO_P-_4e7h_2iz826xipVKMNOu8RBbqQL",
                name = "Me",
                sizeDp = 40
            )

            if (!isSearching) {
                Text(
                    text = "Messages",
                    fontFamily = FontFamilyHeadline,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = CosmicCyan
                )
            } else {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { viewModel.updateSearchQuery(it) },
                    modifier = Modifier
                        .fillMaxWidth(0.82f)
                        .testTag("search_input"),
                    placeholder = { Text("Search chats...", color = CosmicCyan.copy(alpha = 0.5f)) },
                    textStyle = TextStyleBody.copy(color = OnSpaceBlue),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GlowLavender,
                        unfocusedBorderColor = CosmicCyan.copy(alpha = 0.3f),
                        unfocusedContainerColor = VoidSlate,
                        focusedContainerColor = VoidSlate
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            IconButton(
                onClick = {
                    if (isSearching) {
                        viewModel.updateSearchQuery("")
                        focusManager.clearFocus()
                    }
                    isSearching = !isSearching
                },
                modifier = Modifier.testTag("search_button")
            ) {
                Icon(
                    imageVector = if (isSearching) Icons.Default.Close else Icons.Default.Search,
                    contentDescription = "Search",
                    tint = CosmicCyan
                )
            }
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Horizontal Active Friends list
            if (activeFriends.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(10.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(activeFriends, key = { it.id }) { friend ->
                            Column(
                                modifier = Modifier
                                    .clickable(
                                        interactionSource = remember { MutableInteractionSource() },
                                        indication = null
                                    ) { onOpenChat(friend.id) }
                                    .width(64.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                ContactAvatar(
                                    imageUrl = friend.avatarUrl,
                                    name = friend.name,
                                    sizeDp = 60,
                                    showStatus = true,
                                    isActive = true
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = friend.name.split(" ").first(),
                                    fontFamily = FontFamilyBody,
                                    fontSize = 12.sp,
                                    color = CosmicCyan.copy(alpha = 0.85f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }

            // Chat list divider header label
            item {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = if (isSearching) "Search Results" else "Recent Chats",
                    fontFamily = FontFamilyHeadline,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = GlowLavender,
                    letterSpacing = 1.0.sp
                )
            }

            if (recentChats.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Default.ChatBubbleOutline,
                                contentDescription = "No chats",
                                tint = SoftMutedText,
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                "No chats found",
                                color = SoftMutedText,
                                fontFamily = FontFamilyBody,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            } else {
                items(recentChats, key = { it.id }) { chat ->
                    val unreadCount = unreadCounts[chat.id] ?: 0
                    ChatCard(
                        contact = chat,
                        isTyping = typingMap[chat.id] == true,
                        unreadCount = unreadCount,
                        onClick = { onOpenChat(chat.id) }
                    )
                }
            }

            item {
                Spacer(modifier = Modifier.height(90.dp)) // height margin to offset bottom bar overlap safely
            }
        }
    }
}

@Composable
fun ChatCard(
    contact: Contact,
    isTyping: Boolean = false,
    unreadCount: Int = 0,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .testTag("chat_card_${contact.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (contact.recentMessageIsUnread) GlassyBlue.copy(alpha = 0.65f) else GlassyBlue.copy(alpha = 0.35f)
        ),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.05f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ContactAvatar(
                imageUrl = contact.avatarUrl,
                name = contact.name,
                sizeDp = 48,
                showStatus = contact.isActive,
                isActive = contact.isActive
            )

            Spacer(modifier = Modifier.width(14.dp))

            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = contact.name,
                        fontFamily = FontFamilyHeadline,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = OnSpaceBlue,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    Text(
                        text = contact.recentMessageTime,
                        fontFamily = FontFamilyBody,
                        fontSize = 11.sp,
                        color = if (contact.recentMessageIsUnread) GlowLavender else SoftMutedText,
                        fontWeight = if (contact.recentMessageIsUnread) FontWeight.SemiBold else FontWeight.Normal
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))

                if (isTyping) {
                    Text(
                        text = "typing...",
                        fontFamily = FontFamilyBody,
                        fontSize = 14.sp,
                        color = SparkMint,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("chat_card_typing_${contact.id}")
                    )
                } else {
                    Text(
                        text = contact.recentMessageText.ifEmpty { "Tap to open chat" },
                        fontFamily = FontFamilyBody,
                        fontSize = 14.sp,
                        color = if (contact.recentMessageIsUnread) GlowLavender else CosmicCyan.copy(alpha = 0.7f),
                        fontWeight = if (contact.recentMessageIsUnread) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (unreadCount > 0 || contact.recentMessageIsUnread) {
                val displayCount = if (unreadCount > 0) unreadCount else 1
                Spacer(modifier = Modifier.width(10.dp))
                Box(
                    modifier = Modifier
                        .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                        .background(DeepPurple, CircleShape)
                        .border(1.dp, GlowLavender.copy(alpha = 0.3f), CircleShape)
                        .padding(horizontal = 4.dp)
                        .testTag("unread_badge_${contact.id}"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = displayCount.toString(),
                        fontFamily = FontFamilyHeadline,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

// 2. CONTACTS LIST SCREEN
@Composable
fun ContactsListScreen(
    viewModel: ChatViewModel,
    onOpenChat: (String) -> Unit
) {
    val contacts by viewModel.contacts.collectAsState()
    val unreadCounts by viewModel.unreadCounts.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    
    val filteredContacts = remember(contacts, searchQuery) {
        if (searchQuery.isBlank()) {
            contacts
        } else {
            contacts.filter { it.name.contains(searchQuery, ignoreCase = true) }
        }
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Contacts",
            fontFamily = FontFamilyHeadline,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = CosmicCyan
        )
        Spacer(modifier = Modifier.height(12.dp))

        // Search Input Field above the friends list
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("contacts_search_input"),
            placeholder = { Text("Search friends...", color = CosmicCyan.copy(alpha = 0.5f)) },
            textStyle = TextStyleBody.copy(color = OnSpaceBlue),
            leadingIcon = {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search icon",
                    tint = CosmicCyan.copy(alpha = 0.7f)
                )
            },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(
                        onClick = { searchQuery = "" },
                        modifier = Modifier.testTag("contacts_search_clear_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Clear search",
                            tint = CosmicCyan
                        )
                    }
                }
            },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = GlowLavender,
                unfocusedBorderColor = CosmicCyan.copy(alpha = 0.3f),
                unfocusedContainerColor = VoidSlate,
                focusedContainerColor = VoidSlate
            ),
            shape = RoundedCornerShape(12.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(filteredContacts, key = { it.id }) { contact ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onOpenChat(contact.id) }
                        .testTag("contact_list_item_${contact.id}"),
                    colors = CardDefaults.cardColors(containerColor = GlassyBlue.copy(alpha = 0.25f)),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        ContactAvatar(
                            imageUrl = contact.avatarUrl,
                            name = contact.name,
                            sizeDp = 42,
                            showStatus = true,
                            isActive = contact.isActive
                        )
                        Spacer(modifier = Modifier.width(14.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = contact.name,
                                fontFamily = FontFamilyHeadline,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = OnSpaceBlue
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = if (contact.isActive) "Online" else contact.lastActiveText,
                                fontFamily = FontFamilyBody,
                                fontSize = 12.sp,
                                color = if (contact.isActive) SparkMint else SoftMutedText
                            )
                        }

                        val unreadCount = unreadCounts[contact.id] ?: 0
                        if (unreadCount > 0 || contact.recentMessageIsUnread) {
                            val displayCount = if (unreadCount > 0) unreadCount else 1
                            Box(
                                modifier = Modifier
                                    .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
                                    .background(DeepPurple, CircleShape)
                                    .border(1.dp, GlowLavender.copy(alpha = 0.3f), CircleShape)
                                    .padding(horizontal = 4.dp)
                                    .testTag("unread_badge_contact_${contact.id}"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = displayCount.toString(),
                                    fontFamily = FontFamilyHeadline,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }
            item {
                Spacer(modifier = Modifier.height(90.dp))
            }
        }
    }
}

// 3. SETTINGS / PERSONALIZATION SCREEN
@Composable
fun SettingsScreen(
    viewModel: ChatViewModel
) {
    val currentUser by viewModel.currentUser.collectAsState()
    var automaticRepliesEnabled by remember { mutableStateOf(true) }
    var onlineStatusOn by remember { mutableStateOf(true) }
    var currentThemeText by remember { mutableStateOf("Cosmic Velvet (Purple Gradient)") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Settings",
            fontFamily = FontFamilyHeadline,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = CosmicCyan
        )
        Spacer(modifier = Modifier.height(16.dp))

        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
            // My profile card summary
            Card(
                colors = CardDefaults.cardColors(containerColor = GlassyBlue.copy(alpha = 0.4f)),
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.05f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    ContactAvatar(
                        imageUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuCExqlhNQgAW1Yx9ornXUNWhe8JzNw0SuiJ4NUeXmRw6KyOATC7kjdrbEJWsTsOyn0g030wTUky5GH7Zc2DIjGIxfCTlHWeb22AsyVB7hWUjnb8pmUWx340_KZ69IQgYFIz8jqzcanKktjCeBJQG2PoHWqNlUxzYaaGIWExZM967DivcIqYEHWbrEfrlQHs3bu_vjZmjHx2WaVpBR0VdxYHyG5MKU29WVHVvdDTc0t0wJSnO_P-_4e7h_2iz826xipVKMNOu8RBbqQL",
                        name = currentUser?.name ?: "User",
                        sizeDp = 54
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(
                            text = currentUser?.name ?: "Nikhil R.",
                            fontFamily = FontFamilyHeadline,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = OnSpaceBlue
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = currentUser?.email ?: "krnikhilam@gmail.com",
                            fontFamily = FontFamilyBody,
                            fontSize = 13.sp,
                            color = CosmicCyan.copy(alpha = 0.6f)
                        )
                    }
                }
            }

            Text(
                text = "Preferences",
                fontFamily = FontFamilyHeadline,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = GlowLavender,
                letterSpacing = 0.8.sp,
                modifier = Modifier.padding(top = 10.dp)
            )

            // Switch settings items
            SettingsToggleRow(
                icon = Icons.Default.SmartToy,
                title = "Smart Automated Replies",
                subtitle = "Let contacts reply with smart mock answers",
                checked = automaticRepliesEnabled,
                onCheckedChange = { automaticRepliesEnabled = it }
            )

            SettingsToggleRow(
                icon = Icons.Default.RadioButtonChecked,
                title = "Show Active Status Indicators",
                subtitle = "Broadcast your presence mint-color dots",
                checked = onlineStatusOn,
                onCheckedChange = { onlineStatusOn = it }
            )

            // Dynamic card selection items
            SettingsActionCard(
                icon = Icons.Default.Palette,
                title = "Aesthetic Theme Vibe",
                subtitle = currentThemeText,
                onClick = {}
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Log Out Action Button
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .testTag("logout_button")
                    .clickable { viewModel.logout() },
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.15f)),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.2f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                        contentDescription = "Sign Out",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Text(
                        text = "Sign Out",
                        fontFamily = FontFamilyHeadline,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            Spacer(modifier = Modifier.height(100.dp))
        }
    }
}

@Composable
fun SettingsToggleRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = GlassyBlue.copy(alpha = 0.2f)),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .background(MetallicSlate, RoundedCornerShape(30))
                        .border(
                            1.dp,
                            Color.White.copy(alpha = 0.05f),
                            RoundedCornerShape(30)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(imageVector = icon, contentDescription = null, tint = GlowLavender)
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text(
                        text = title,
                        fontFamily = FontFamilyHeadline,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = OnSpaceBlue
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        fontFamily = FontFamilyBody,
                        fontSize = 12.sp,
                        color = SoftMutedText
                    )
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = VoidSlate,
                    checkedTrackColor = GlowLavender,
                    uncheckedThumbColor = SoftMutedText,
                    uncheckedTrackColor = MetallicSlate
                )
            )
        }
    }
}

@Composable
fun SettingsActionCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = GlassyBlue.copy(alpha = 0.2f)),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .background(MetallicSlate, RoundedCornerShape(30))
                        .border(
                            1.dp,
                            Color.White.copy(alpha = 0.05f),
                            RoundedCornerShape(30)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(imageVector = icon, contentDescription = null, tint = CosmicCyan)
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column {
                    Text(
                        text = title,
                        fontFamily = FontFamilyHeadline,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = OnSpaceBlue
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        fontFamily = FontFamilyBody,
                        fontSize = 12.sp,
                        color = SparkMint
                    )
                }
            }
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = SoftMutedText
            )
        }
    }
}

// 4. CONVERSATION VIEW SCREEN
@Composable
fun ConversationScreen(
    viewModel: ChatViewModel,
    contactId: String,
    onBack: () -> Unit
) {
    val contact by viewModel.activeContact.collectAsState()
    val messages by viewModel.activeMessages.collectAsState()
    val typingMap by viewModel.typingStatus.collectAsState()
    val isTyping = typingMap[contactId] == true

    var textInput by remember { mutableStateOf("") }
    var replyingToMessage by remember { mutableStateOf<Message?>(null) }
    var showEmojiPicker by remember { mutableStateOf(false) }
    var selectedAttachmentUrl by remember { mutableStateOf<String?>(null) }
    var showAttachmentOptions by remember { mutableStateOf(false) }

    val galleryLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri: android.net.Uri? ->
        uri?.let {
            selectedAttachmentUrl = it.toString()
        }
    }

    val cameraLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.TakePicturePreview()
    ) { bitmap: android.graphics.Bitmap? ->
        selectedAttachmentUrl = "https://images.unsplash.com/photo-154dfa474A-811bb44db016?w=600"
    }
    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    var showMessageSearchBar by remember { mutableStateOf(false) }
    var messageSearchQuery by remember { mutableStateOf("") }
    var showSettingsMenu by remember { mutableStateOf(false) }
    val readReceiptsEnabled by viewModel.readReceiptsEnabled.collectAsState()

    val filteredMessages = remember(messages, messageSearchQuery) {
        if (messageSearchQuery.isBlank()) {
            messages
        } else {
            messages.filter { it.text.contains(messageSearchQuery, ignoreCase = true) }
        }
    }

    // Scroll to bottom whenever messages list grows or isTyping changes, unless a search filter is active
    LaunchedEffect(messages.size, isTyping) {
        if (messages.isNotEmpty() && messageSearchQuery.isBlank()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // TOP APP BAR (CUSTOM TRANS-GLASS LOOK WITH AVATAR AND VIDEOCAM)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(DeepSpaceBlue.copy(alpha = 0.7f))
                .statusBarsPadding()
                .height(64.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .testTag("back_button")
                    .padding(end = 4.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = CosmicCyan
                )
            }

            contact?.let { c ->
                ContactAvatar(
                    imageUrl = c.avatarUrl,
                    name = c.name,
                    sizeDp = 40,
                    showStatus = true,
                    isActive = c.isActive
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = c.name,
                        fontFamily = FontFamilyHeadline,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = CosmicCyan
                    )
                    AnimatedContent(
                        targetState = isTyping,
                        transitionSpec = {
                            fadeIn(animationSpec = tween(150)) togetherWith fadeOut(animationSpec = tween(150))
                        },
                        label = "header_subtitle"
                    ) { typing ->
                        if (typing) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.testTag("header_typing_indicator")
                            ) {
                                Text(
                                    text = "typing",
                                    fontFamily = FontFamilyBody,
                                    fontSize = 12.sp,
                                    color = SparkMint,
                                    fontWeight = FontWeight.Medium
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                HeaderTypingDots()
                            }
                        } else {
                            Text(
                                text = if (c.isActive) "Active now" else c.lastActiveText,
                                fontFamily = FontFamilyBody,
                                fontSize = 12.sp,
                                color = if (c.isActive) SparkMint else SoftMutedText,
                                fontWeight = FontWeight.Normal
                            )
                        }
                    }
                }

                IconButton(onClick = {}) {
                    Icon(
                        imageVector = Icons.Default.Videocam,
                        contentDescription = "Video Call",
                        tint = CosmicCyan
                    )
                }

                IconButton(
                    onClick = {
                        showMessageSearchBar = !showMessageSearchBar
                        if (!showMessageSearchBar) {
                            messageSearchQuery = ""
                        }
                    },
                    modifier = Modifier.testTag("toggle_message_search")
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = if (showMessageSearchBar) SparkMint else CosmicCyan
                    )
                }

                Box {
                    IconButton(
                        onClick = { showSettingsMenu = true },
                        modifier = Modifier.testTag("chat_settings_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "Settings",
                            tint = CosmicCyan
                        )
                    }
                    DropdownMenu(
                        expanded = showSettingsMenu,
                        onDismissRequest = { showSettingsMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Read Receipts") },
                            trailingIcon = {
                                Switch(
                                    checked = readReceiptsEnabled,
                                    onCheckedChange = { viewModel.toggleReadReceipts() }
                                )
                            },
                            onClick = {
                                viewModel.toggleReadReceipts()
                            }
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = showMessageSearchBar,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ProfessionalSecondaryContainer)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = messageSearchQuery,
                    onValueChange = { messageSearchQuery = it },
                    placeholder = { Text("Filter messages in this chat...", fontFamily = FontFamilyBody, color = SoftMutedText) },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("conversation_search_input")
                        .heightIn(max = 52.dp),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = CosmicCyan,
                        unfocusedBorderColor = ProfessionalOutline,
                        focusedContainerColor = ProfessionalBackground,
                        unfocusedContainerColor = ProfessionalBackground,
                        focusedTextColor = ProfessionalOnBackground,
                        unfocusedTextColor = ProfessionalOnBackground
                    ),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search icon",
                            tint = SoftMutedText
                        )
                    },
                    trailingIcon = {
                        if (messageSearchQuery.isNotEmpty()) {
                            IconButton(
                                onClick = { messageSearchQuery = "" },
                                modifier = Modifier.testTag("conversation_search_clear")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Clear search",
                                    tint = SoftMutedText
                                )
                            }
                        }
                    },
                    shape = RoundedCornerShape(12.dp)
                )
                
                Spacer(modifier = Modifier.width(8.dp))
                
                IconButton(
                    onClick = {
                        showMessageSearchBar = false
                        messageSearchQuery = ""
                    },
                    modifier = Modifier.testTag("conversation_search_close")
                ) {
                    Icon(
                        imageVector = Icons.Default.Cancel,
                        contentDescription = "Hide search bar",
                        tint = SoftMutedText
                    )
                }
            }
        }

        // Timeline Scroll list
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Spacer(modifier = Modifier.height(14.dp))
                // Central clean Yesterday date label
                Box(
                    modifier = Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = GlassyBlue.copy(alpha = 0.45f)),
                        shape = RoundedCornerShape(100)
                    ) {
                        Text(
                            text = "Yesterday",
                            fontFamily = FontFamilyBody,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = CosmicCyan,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            }

            if (filteredMessages.isEmpty() && messages.isNotEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 48.dp)
                            .testTag("conversation_search_no_results"),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "No results",
                            tint = SoftMutedText.copy(alpha = 0.5f),
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No messages match your search",
                            fontFamily = FontFamilyBody,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            color = SoftMutedText
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Try typing a different keyword or phrase.",
                            fontFamily = FontFamilyBody,
                            fontSize = 13.sp,
                            color = SoftMutedText.copy(alpha = 0.7f)
                        )
                    }
                }
            } else {
                items(filteredMessages, key = { it.id }) { message ->
                    MessageBubbleRow(
                        message = message,
                        contact = contact,
                        onDeleteMessage = { viewModel.deleteMessage(it) },
                        onReply = { replyingToMessage = it },
                        readReceiptsEnabled = readReceiptsEnabled,
                        onReaction = { msg, rxn -> viewModel.updateMessageReaction(msg.id, rxn) }
                    )
                }
            }

            // Typing Indicator Row
            item {
                AnimatedVisibility(
                    visible = isTyping,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically()
                ) {
                    TypingDotsIndicatorCard(contact = contact)
                }
            }

            item {
                Spacer(modifier = Modifier.height(100.dp)) // Avoid blocking behind message editor panel
            }
        }

        // BOTTOM Floating capsule editor and Emoji Picker Container
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(DeepSpaceBlue)
        ) {
            // 1. ATTACHMENT OPTIONS PANEL (Shows Camera, Gallery options + Sandbox Demo Photos)
            AnimatedVisibility(
                visible = showAttachmentOptions,
                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(VoidSlate.copy(alpha = 0.95f))
                        .padding(16.dp)
                        .testTag("attachment_options_panel")
                ) {
                    Text(
                        text = "Share Photo",
                        fontFamily = FontFamilyHeadline,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = CosmicCyan,
                        modifier = Modifier.padding(bottom = 12.dp)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Camera Button
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .clickable {
                                    showAttachmentOptions = false
                                    try {
                                        cameraLauncher.launch(null)
                                    } catch (e: Exception) {
                                        selectedAttachmentUrl = "https://images.unsplash.com/photo-154dfa474A-811bb44db016?w=600"
                                    }
                                }
                                .padding(8.dp)
                                .testTag("camera_trigger_button")
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .background(
                                        Brush.linearGradient(colors = listOf(DeepPurple, GlowLavender)),
                                        CircleShape
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhotoCamera,
                                    contentDescription = "Camera",
                                    tint = DeepSpaceBlue,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Camera",
                                fontFamily = FontFamilyBody,
                                fontSize = 12.sp,
                                color = SoftMutedText,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        // Gallery / File Input Button
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .clickable {
                                    showAttachmentOptions = false
                                    try {
                                        galleryLauncher.launch("image/*")
                                    } catch (e: Exception) {
                                        selectedAttachmentUrl = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600"
                                    }
                                }
                                .padding(8.dp)
                                .testTag("gallery_trigger_button")
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .background(MetallicSlate, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhotoLibrary,
                                    contentDescription = "Gallery",
                                    tint = CosmicCyan,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Gallery",
                                fontFamily = FontFamilyBody,
                                fontSize = 12.sp,
                                color = SoftMutedText,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Demo Photo Sandbox",
                        fontFamily = FontFamilyBody,
                        fontSize = 11.sp,
                        color = CosmicCyan.copy(alpha = 0.6f),
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    // Seeded Quick-pick photos for rich offline demo and easy testing
                    LazyRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        val quickPhotos = listOf(
                            "Nature Vista" to "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600",
                            "Cyber Light" to "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600",
                            "City Glow" to "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600",
                            "Cute Pet" to "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600"
                        )
                        items(quickPhotos) { (label, url) ->
                            Box(
                                modifier = Modifier
                                    .size(64.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                                    .clickable {
                                        selectedAttachmentUrl = url
                                        showAttachmentOptions = false
                                    }
                                    .testTag("quick_photo_$label")
                            ) {
                                AsyncImage(
                                    model = url,
                                    contentDescription = label,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop
                                )
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color.Black.copy(alpha = 0.6f))
                                        .align(Alignment.BottomCenter)
                                        .padding(vertical = 1.dp)
                                ) {
                                    Text(
                                        text = label,
                                        fontFamily = FontFamilyBody,
                                        fontSize = 8.sp,
                                        color = Color.White,
                                        modifier = Modifier.align(Alignment.Center),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 2. PHOTO ATTACHMENT PREVIEW BANNER (Shows when an image is staged for composition)
            AnimatedVisibility(
                visible = selectedAttachmentUrl != null,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                if (selectedAttachmentUrl != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(VoidSlate.copy(alpha = 0.9f))
                            .padding(horizontal = 20.dp, vertical = 8.dp)
                            .testTag("staged_attachment_preview")
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MetallicSlate.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                .padding(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .border(1.dp, CosmicCyan.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                            ) {
                                AsyncImage(
                                    model = selectedAttachmentUrl,
                                    contentDescription = "Staged photo",
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop
                                )
                            }

                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Ready to send photo",
                                    fontFamily = FontFamilyBody,
                                    fontSize = 13.sp,
                                    color = CosmicCyan,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Add a caption below or click Send",
                                    fontFamily = FontFamilyBody,
                                    fontSize = 11.sp,
                                    color = SoftMutedText
                                )
                            }

                            IconButton(
                                onClick = { selectedAttachmentUrl = null },
                                modifier = Modifier
                                    .size(32.dp)
                                    .testTag("cancel_attachment_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Cancel selection",
                                    tint = SoftMutedText,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }

            // 3. REPLY PREVIEW BANNER
            AnimatedVisibility(
                visible = replyingToMessage != null,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                replyingToMessage?.let { replyToMsg ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(VoidSlate.copy(alpha = 0.9f))
                            .padding(horizontal = 20.dp, vertical = 8.dp)
                            .testTag("reply_preview_banner")
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MetallicSlate.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                .padding(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(4.dp)
                                    .height(40.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(SparkMint)
                            )
                            Spacer(modifier = Modifier.width(12.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (replyToMsg.isFromMe) "Replying to yourself" else "Replying to ${contact?.name ?: "User"}",
                                    fontFamily = FontFamilyBody,
                                    fontSize = 13.sp,
                                    color = SparkMint,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = replyToMsg.text,
                                    fontFamily = FontFamilyBody,
                                    fontSize = 11.sp,
                                    color = SoftMutedText,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            IconButton(
                                onClick = { replyingToMessage = null },
                                modifier = Modifier
                                    .size(32.dp)
                                    .testTag("cancel_reply_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Cancel reply",
                                    tint = SoftMutedText,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 12.dp, top = 8.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(VoidSlate.copy(alpha = 0.82f), RoundedCornerShape(100))
                        .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(100))
                        .padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // "+" icon button toggles attachment options
                    IconButton(
                        onClick = {
                            showAttachmentOptions = !showAttachmentOptions
                            showEmojiPicker = false // Close emoji picker to avoid screen crowding
                        },
                        modifier = Modifier
                            .size(36.dp)
                            .background(MetallicSlate, CircleShape)
                            .testTag("add_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Attach picture",
                            tint = CosmicCyan,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    // Emoji toggle button
                    IconButton(
                        onClick = { showEmojiPicker = !showEmojiPicker },
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("emoji_toggle_button")
                    ) {
                        Icon(
                            imageVector = if (showEmojiPicker) Icons.Default.Keyboard else Icons.Default.Mood,
                            contentDescription = "Toggle emoji picker",
                            tint = CosmicCyan,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    // Input bar field
                    TextField(
                        value = textInput,
                        onValueChange = { textInput = it },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("message_input"),
                        placeholder = { Text("Message...", color = CosmicCyan.copy(alpha = 0.5f)) },
                        textStyle = TextStyleBody.copy(color = OnSpaceBlue),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            disabledContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent
                        ),
                        maxLines = 4
                    )

                    // Send action button
                    IconButton(
                        onClick = {
                            val input = textInput.trim()
                            if (input.isNotEmpty() || selectedAttachmentUrl != null) {
                                contact?.let { c ->
                                    viewModel.sendMessage(
                                        contactId = c.id,
                                        text = input,
                                        attachmentUrl = selectedAttachmentUrl
                                    )
                                }
                                textInput = ""
                                selectedAttachmentUrl = null
                                replyingToMessage = null
                                showEmojiPicker = false // close picker on send
                                showAttachmentOptions = false // close options panel on send
                            }
                        },
                        modifier = Modifier
                            .size(36.dp)
                            .background(
                                Brush.linearGradient(colors = listOf(DeepPurple, GlowLavender)),
                                CircleShape
                            )
                            .testTag("send_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Send message",
                            tint = DeepSpaceBlue,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            AnimatedVisibility(
                visible = showEmojiPicker,
                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
            ) {
                EmojiPicker(
                    onEmojiSelected = { emoji ->
                        textInput += emoji
                    }
                )
            }
        }
    }
}

@Composable
fun EmojiPicker(
    onEmojiSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val emojiCategories = listOf(
        "Smileys" to listOf("😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤠", "🥳", "😎", "🤓", "🧐"),
        "Gestures" to listOf("👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "✍️"),
        "Hearts" to listOf("❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝"),
        "Expressions" to listOf("😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤔", "🫣")
    )

    var selectedCategoryIndex by remember { mutableStateOf(0) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(260.dp)
            .background(VoidSlate)
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .padding(16.dp)
            .testTag("emoji_picker_container")
    ) {
        // Category Selector tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            emojiCategories.forEachIndexed { index, (categoryName, _) ->
                val isSelected = selectedCategoryIndex == index
                val textColor = if (isSelected) GlowLavender else SoftMutedText
                val borderModifier = if (isSelected) {
                    Modifier.drawBehind {
                        val strokeWidth = 2.dp.toPx()
                        val y = size.height - strokeWidth / 2
                        drawLine(
                            color = GlowLavender,
                            start = Offset(0f, y),
                            end = Offset(size.width, y),
                            strokeWidth = strokeWidth
                        )
                    }
                } else Modifier

                Text(
                    text = categoryName,
                    fontFamily = FontFamilyHeadline,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                    color = textColor,
                    modifier = Modifier
                        .clickable(
                            indication = null,
                            interactionSource = remember { MutableInteractionSource() }
                        ) {
                            selectedCategoryIndex = index
                        }
                        .then(borderModifier)
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                        .testTag("emoji_category_tab_${categoryName.lowercase()}")
                )
            }
        }

        // Grid scroll of emojis for selected category
        val currentEmojis = emojiCategories[selectedCategoryIndex].second
        val chunkedEmojis = remember(currentEmojis) { currentEmojis.chunked(7) }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .testTag("emoji_picker_grid")
        ) {
            chunkedEmojis.forEach { rowList ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    rowList.forEach { emoji ->
                        Box(
                            modifier = Modifier
                                .size(48.dp) // Minimum Touch Target size 48dp
                                .clickable {
                                    onEmojiSelected(emoji)
                                }
                                .testTag("emoji_button_$emoji"),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = emoji,
                                fontSize = 24.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

fun getRelativeTimeString(timestamp: Long): String {
    val diff = System.currentTimeMillis() - timestamp
    if (diff < 60000L) {
        return "just now"
    }
    val minutes = diff / 60000L
    if (minutes < 60L) {
        return "${minutes}m ago"
    }
    val hours = minutes / 60L
    if (hours < 24L) {
        return "${hours}h ago"
    }
    val days = hours / 24L
    if (days < 7L) {
        return "${days}d ago"
    }
    val weeks = days / 7L
    return "${weeks}w ago"
}

@Composable
fun MessageBubbleRow(
    message: Message,
    contact: Contact?,
    onDeleteMessage: (Message) -> Unit,
    onReply: (Message) -> Unit = {},
    readReceiptsEnabled: Boolean = true,
    onReaction: (Message, String?) -> Unit = { _, _ -> }
) {
    val date = Date(message.timestamp)
    var showMenu by remember { mutableStateOf(false) }
    
    var offsetX by remember { mutableFloatStateOf(0f) }
    val offsetXAnimated by animateFloatAsState(targetValue = offsetX, label = "swipe_reply_offset")
    
    val displayTime = remember(message.timeText, message.timestamp) {
        getRelativeTimeString(message.timestamp).replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
    
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
    ) {
        // Reply icon background layer
        Row(
            modifier = Modifier.matchParentSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start
        ) {
            val iconAlpha = (offsetX / 100f).coerceIn(0f, 1f)
            if (iconAlpha > 0f) {
                Icon(
                    imageVector = Icons.Default.Reply,
                    contentDescription = "Reply",
                    tint = CosmicCyan.copy(alpha = iconAlpha),
                    modifier = Modifier.padding(start = 16.dp).size(24.dp).testTag("reply_swipe_icon_${message.id}")
                )
            }
        }
        
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetXAnimated.roundToInt(), 0) }
                .pointerInput(message.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, dragAmount ->
                            if (offsetX + dragAmount > 0) { // Swipe right to reply
                                offsetX = (offsetX + dragAmount).coerceIn(0f, 150f)
                            }
                        },
                        onDragEnd = {
                            if (offsetX > 80f) {
                                onReply(message)
                            }
                            offsetX = 0f
                        },
                        onDragCancel = {
                            offsetX = 0f
                        }
                    )
                },
            horizontalAlignment = if (message.isFromMe) Alignment.End else Alignment.Start
        ) {
        if (message.isFromMe) {
            // Sent message premium professional purple/violet gradient
            Box {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                    shape = RoundedCornerShape(
                        topStart = 20.dp,
                        topEnd = 20.dp,
                        bottomStart = 20.dp,
                        bottomEnd = 4.dp
                    ),
                    modifier = Modifier
                        .widthIn(max = 280.dp)
                        .background(
                            Brush.linearGradient(colors = listOf(ProfessionalPrimary, Color(0xFF8E24AA))),
                            shape = RoundedCornerShape(
                                topStart = 20.dp,
                                topEnd = 20.dp,
                                bottomStart = 20.dp,
                                bottomEnd = 4.dp
                            )
                        )
                        .pointerInput(message.id) {
                            detectTapGestures(
                                onLongPress = {
                                    showMenu = true
                                }
                            )
                        }
                        .testTag("message_card_${message.id}")
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        if (message.attachmentUrl != null) {
                            AsyncImage(
                                model = message.attachmentUrl,
                                contentDescription = "Snaps",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(140.dp)
                                    .clip(RoundedCornerShape(14.dp)),
                                contentScale = ContentScale.Crop
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        Text(
                            text = message.text,
                            fontFamily = FontFamilyBody,
                            fontSize = 15.sp,
                            color = Color.White, // outstanding legibility on primary gradient
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                message.reaction?.let { rxn ->
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .offset(x = 8.dp, y = 8.dp)
                            .shadow(2.dp, CircleShape)
                            .background(ProfessionalPrimaryContainer, CircleShape)
                            .padding(4.dp)
                    ) {
                        Text(text = rxn, fontSize = 12.sp)
                    }
                }

                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false },
                    modifier = Modifier
                        .background(VoidSlate)
                        .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        .testTag("message_dropdown_menu_${message.id}")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        listOf("👍", "❤️", "😂", "😮", "😢", "🙏").forEach { emoji ->
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .clip(CircleShape)
                                    .clickable {
                                        onReaction(message, if (message.reaction == emoji) null else emoji)
                                        showMenu = false
                                    }
                            ) {
                                Text(
                                    text = emoji,
                                    fontSize = 20.sp,
                                    modifier = Modifier.padding(4.dp)
                                )
                            }
                        }
                    }
                    Divider(color = Color.White.copy(alpha = 0.1f))
                    DropdownMenuItem(
                        text = { Text("Delete Message", color = Color.Red) },
                        onClick = {
                            onDeleteMessage(message)
                            showMenu = false
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = Color.Red,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        modifier = Modifier.testTag("delete_message_option_${message.id}")
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(3.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End,
                modifier = Modifier.padding(end = 4.dp)
            ) {
                Text(
                    text = displayTime,
                    fontFamily = FontFamilyBody,
                    fontSize = 10.sp,
                    color = ProfessionalOnBackground.copy(alpha = 0.5f),
                    modifier = Modifier.testTag("message_timestamp_${message.id}")
                )
                Spacer(modifier = Modifier.width(3.dp))
                if (readReceiptsEnabled) {
                    if (message.isRead) {
                        Icon(
                            imageVector = Icons.Default.DoneAll,
                            contentDescription = "Read",
                            tint = Color(0xFF0288D1), // Active blue read indicator
                            modifier = Modifier
                                .size(13.dp)
                                .testTag("read_receipt_icon_read_${message.id}")
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Done,
                            contentDescription = "Sent",
                            tint = ProfessionalOnBackground.copy(alpha = 0.35f), // Muted for unread/sent status
                            modifier = Modifier
                                .size(13.dp)
                                .testTag("read_receipt_icon_sent_${message.id}")
                        )
                    }
                }
            }
        } else {
            // Received message professional light grey/lilac bubble card
            Box {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ProfessionalSecondaryContainer),
                    shape = RoundedCornerShape(
                        topStart = 20.dp,
                        topEnd = 20.dp,
                        bottomStart = 4.dp,
                        bottomEnd = 20.dp
                    ),
                    border = BorderStroke(1.dp, ProfessionalOutline.copy(alpha = 0.3f)),
                    modifier = Modifier
                        .widthIn(max = 280.dp)
                        .pointerInput(message.id) {
                            detectTapGestures(
                                onLongPress = {
                                    showMenu = true
                                }
                            )
                        }
                        .testTag("message_card_${message.id}")
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        if (message.attachmentUrl != null) {
                            AsyncImage(
                                model = message.attachmentUrl,
                                contentDescription = "Referred Photo",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(140.dp)
                                    .clip(RoundedCornerShape(14.dp)),
                                contentScale = ContentScale.Crop
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        Text(
                            text = message.text,
                            fontFamily = FontFamilyBody,
                            fontSize = 15.sp,
                            color = ProfessionalOnBackground
                        )
                    }
                }

                message.reaction?.let { rxn ->
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .offset(x = (-8).dp, y = 8.dp)
                            .shadow(2.dp, CircleShape)
                            .background(ProfessionalPrimaryContainer, CircleShape)
                            .padding(4.dp)
                    ) {
                        Text(text = rxn, fontSize = 12.sp)
                    }
                }

                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false },
                    modifier = Modifier
                        .background(VoidSlate)
                        .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        .testTag("message_dropdown_menu_${message.id}")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        listOf("👍", "❤️", "😂", "😮", "😢", "🙏").forEach { emoji ->
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .clip(CircleShape)
                                    .clickable {
                                        onReaction(message, if (message.reaction == emoji) null else emoji)
                                        showMenu = false
                                    }
                            ) {
                                Text(
                                    text = emoji,
                                    fontSize = 20.sp,
                                    modifier = Modifier.padding(4.dp)
                                )
                            }
                        }
                    }
                    Divider(color = Color.White.copy(alpha = 0.1f))
                    DropdownMenuItem(
                        text = { Text("Delete Message", color = Color.Red) },
                        onClick = {
                            onDeleteMessage(message)
                            showMenu = false
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete",
                                tint = Color.Red,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        modifier = Modifier.testTag("delete_message_option_${message.id}")
                    )
                }
            }
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = displayTime,
                fontFamily = FontFamilyBody,
                fontSize = 10.sp,
                color = ProfessionalOnBackground.copy(alpha = 0.5f),
                modifier = Modifier
                    .padding(start = 4.dp)
                    .testTag("message_timestamp_${message.id}")
            )
        }
    }
    }
}

// Simulated Pulsing Dots Typing Indicator
@Composable
fun TypingDotsIndicatorCard(
    contact: Contact?
) {
    Row(
        modifier = Modifier.testTag("chat_window_typing_indicator"),
        verticalAlignment = Alignment.CenterVertically
    ) {
        contact?.let { c ->
            // Tiny small avatar left offset
            ContactAvatar(
                imageUrl = c.avatarUrl.replace("/AB6AXuBecroCfGivkOavOxpU5BY2AJEmy9BifH9FThj_GvI-RrWCYoLmchy_3tsNCsz8L_Ckz0QbL96woQCTQpkaxgrkZi3g4CHj_VJflTmF9h1Sojwu0V9VZ-6WdyA6u41Rk-gfKRE7H3oz2FimR2QN-HNdXhnzwRf1pDjKre0ZUMdY9x--yXzensBQ2fJIho2aockX8qYokEJ0ifQG6qu0v3OVtiCnyJHU4-wjCEzW-1nILf0HmW9srnkR3OCfZaTbpaLpbB98nzA-BEkx", "https://lh3.googleusercontent.com/aida-public/AB6AXuCxNBcUYL3Comv18qNCszePIUI9X2MnFzekcE5GSIHQxWOnMPKS23NMEpbN3WG01jf7h3ICkilotY-ZNiuCnTBFFCTo4Hok7-MTPBfM8NhxvpDTVtzyNtTDpqi0A1yoWXikWOJ0XMcRCLkTDAQf7b6BvRy26H-Cnbp7wpzGCkMu5-pUtyX5KckXILWHf05GsE7NuILWlBnnFsqt8mO2P9OwpQApyPQqH9gjpFRJTaFZClup8Ik0YNmWw2QqzRfVCv0kpCXkdE2Zgj6S"), // matching small avatar URL from screen 2
                name = c.name,
                sizeDp = 24
            )
            Spacer(modifier = Modifier.width(8.dp))
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = SparkMint.copy(alpha = 0.1f)),
            shape = RoundedCornerShape(100),
            border = BorderStroke(1.dp, SparkMint.copy(alpha = 0.15f))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Pulsing dot animations
                val transition = rememberInfiniteTransition(label = "typing_dots")
                
                val d1State by transition.animateFloat(
                    initialValue = 0.3f,
                    targetValue = 1.0f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(600, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "dot1"
                )
                val d2State by transition.animateFloat(
                    initialValue = 0.3f,
                    targetValue = 1.0f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(600, delayMillis = 150, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "dot2"
                )
                val d3State by transition.animateFloat(
                    initialValue = 0.3f,
                    targetValue = 1.0f,
                    animationSpec = infiniteRepeatable(
                        animation = tween(600, delayMillis = 300, easing = LinearEasing),
                        repeatMode = RepeatMode.Reverse
                    ),
                    label = "dot3"
                )

                Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(SparkMint.copy(alpha = d1State)))
                Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(SparkMint.copy(alpha = d2State)))
                Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(SparkMint.copy(alpha = d3State)))
            }
        }
    }
}

@Composable
fun HeaderTypingDots() {
    val transition = rememberInfiniteTransition(label = "header_typing_dots")
    val d1State by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "hdot1"
    )
    val d2State by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, delayMillis = 150, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "hdot2"
    )
    val d3State by transition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(600, delayMillis = 300, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "hdot3"
    )

    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(modifier = Modifier.size(4.dp).clip(CircleShape).background(SparkMint.copy(alpha = d1State)))
        Box(modifier = Modifier.size(4.dp).clip(CircleShape).background(SparkMint.copy(alpha = d2State)))
        Box(modifier = Modifier.size(4.dp).clip(CircleShape).background(SparkMint.copy(alpha = d3State)))
    }
}

// 5. BOTTOM NAVIGATION BAR (SEMI-GLASS TRANSLUCENT CAPSULE)
@Composable
fun BottomNavBar(
    currentScreen: Screen,
    onNavigate: (Screen) -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.Transparent, DeepSpaceBlue.copy(alpha = 0.82f))
                )
            )
            .padding(horizontal = 24.dp)
            .padding(bottom = 24.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(VoidSlate.copy(alpha = 0.9f), RoundedCornerShape(100))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(100))
                .navigationBarsPadding()
                .padding(vertical = 8.dp, horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            NavBarTabItem(
                icon = Icons.Default.ChatBubble,
                active = currentScreen is Screen.ChatList,
                onClick = { onNavigate(Screen.ChatList) },
                testTag = "chats_tab"
            )
            NavBarTabItem(
                icon = Icons.Default.Contacts,
                active = currentScreen is Screen.ContactsList,
                onClick = { onNavigate(Screen.ContactsList) },
                testTag = "contacts_tab"
            )
            NavBarTabItem(
                icon = Icons.Default.Settings,
                active = currentScreen is Screen.Settings,
                onClick = { onNavigate(Screen.Settings) },
                testTag = "settings_tab"
            )
        }
    }
}

@Composable
fun NavBarTabItem(
    icon: ImageVector,
    active: Boolean,
    onClick: () -> Unit,
    testTag: String
) {
    val scaleState by animateFloatAsState(
        targetValue = if (active) 1.15f else 1.0f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "tab_scale"
    )

    IconButton(
        onClick = onClick,
        modifier = Modifier
            .testTag(testTag)
            .background(
                color = if (active) GlowLavender.copy(alpha = 0.15f) else Color.Transparent,
                shape = CircleShape
            )
            .size(46.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (active) GlowLavender else CosmicCyan.copy(alpha = 0.6f),
            modifier = Modifier
                .size(22.dp)
                .clickable { onClick() }
        )
    }
}

@Composable
fun AuthScreen(viewModel: ChatViewModel) {
    var isSignUp by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val authError by viewModel.authError.collectAsState()
    val isAuthenticating by viewModel.isAuthenticating.collectAsState()
    val isOtpMode by viewModel.isOtpMode.collectAsState()

    var otpCode by remember { mutableStateOf("") }

    // Reset error on toggle screen
    LaunchedEffect(isSignUp) {
        viewModel.clearAuthError()
    }

    if (isOtpMode) {
        Box(
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Email,
                    contentDescription = "Email Verification",
                    tint = ProfessionalPrimary,
                    modifier = Modifier.size(64.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Verify Your Email",
                    fontFamily = FontFamilyHeadline,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = ProfessionalPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "We've sent a 6-digit OTP code to your email. Please enter it below to complete registration.",
                    fontFamily = FontFamilyBody,
                    fontSize = 14.sp,
                    color = ProfessionalOnBackground.copy(alpha = 0.7f),
                    textAlign = TextAlign.Center
                )
                
                Spacer(modifier = Modifier.height(32.dp))

                if (authError != null) {
                    Text(
                        text = authError ?: "",
                        color = Color(0xFFB3261E),
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }

                OutlinedTextField(
                    value = otpCode,
                    onValueChange = { if (it.length <= 6) otpCode = it },
                    label = { Text("6-Digit OTP") },
                    placeholder = { Text("123456") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(32.dp))

                Button(
                    onClick = { viewModel.verifyOtp(otpCode, onRegistered = {}) },
                    enabled = otpCode.length == 6 && !isAuthenticating,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ProfessionalPrimary)
                ) {
                    if (isAuthenticating) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                    } else {
                        Text("Verify and Login", fontWeight = FontWeight.Bold)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                TextButton(onClick = { viewModel.cancelOtpMode() }) {
                    Text("Go Back")
                }
            }
        }
    } else {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
            contentAlignment = Alignment.Center
        ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // App Branding Brand Header
            Card(
                colors = CardDefaults.cardColors(containerColor = ProfessionalPrimaryContainer.copy(alpha = 0.6f)),
                shape = CircleShape,
                modifier = Modifier.size(64.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.ChatBubble,
                        contentDescription = "App Icon",
                        tint = ProfessionalPrimary,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "MESSAGES",
                fontFamily = FontFamilyHeadline,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = ProfessionalPrimary,
                letterSpacing = 2.sp
            )

            Text(
                text = if (isSignUp) "Create your professional profile" else "Sign in to keep connection",
                fontFamily = FontFamilyBody,
                fontSize = 14.sp,
                color = ProfessionalOnBackground.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 4.dp)
            )

            Spacer(modifier = Modifier.height(28.dp))

            // TAB SWITCHER
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .background(ProfessionalSecondaryContainer, RoundedCornerShape(24.dp))
                    .padding(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(
                            color = if (!isSignUp) ProfessionalPrimary else Color.Transparent,
                            shape = RoundedCornerShape(20.dp)
                        )
                        .clickable { isSignUp = false }
                        .testTag("tab_signin"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Sign In",
                        fontFamily = FontFamilyHeadline,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (!isSignUp) Color.White else ProfessionalOnBackground.copy(alpha = 0.7f)
                    )
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(
                            color = if (isSignUp) ProfessionalPrimary else Color.Transparent,
                            shape = RoundedCornerShape(20.dp)
                        )
                        .clickable { isSignUp = true }
                        .testTag("tab_signup"),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Sign Up",
                        fontFamily = FontFamilyHeadline,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isSignUp) Color.White else ProfessionalOnBackground.copy(alpha = 0.7f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Error Display Card
            if (authError != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFD8E4)),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp),
                    border = BorderStroke(1.dp, Color(0xFFB3261E).copy(alpha = 0.2f))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Error,
                            contentDescription = "Error",
                            tint = Color(0xFFB3261E),
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = authError ?: "",
                            color = Color(0xFF31111d),
                            fontFamily = FontFamilyBody,
                            fontSize = 13.sp
                        )
                    }
                }
            }

            // INPUT FORMS
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (isSignUp) {
                    // Full Name Input
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Full Name") },
                        placeholder = { Text("John Doe") },
                        leadingIcon = {
                            Icon(Icons.Default.Person, contentDescription = null, tint = ProfessionalPrimary)
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("signup_name_input"),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ProfessionalPrimary,
                            unfocusedBorderColor = ProfessionalOutline
                        )
                    )
                }

                // Email Input
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email Address") },
                    placeholder = { Text("you@example.com") },
                    leadingIcon = {
                        Icon(Icons.Default.Email, contentDescription = null, tint = ProfessionalPrimary)
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("auth_email_input"),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ProfessionalPrimary,
                        unfocusedBorderColor = ProfessionalOutline
                    )
                )

                // Password Input
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    placeholder = { Text("••••••••") },
                    leadingIcon = {
                        Icon(Icons.Default.Lock, contentDescription = null, tint = ProfessionalPrimary)
                    },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Hide Password" else "Show Password",
                                tint = ProfessionalPrimary
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (isSignUp) ImeAction.Next else ImeAction.Done
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("auth_password_input"),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ProfessionalPrimary,
                        unfocusedBorderColor = ProfessionalOutline
                    )
                )

                if (isSignUp) {
                    // Confirm Password Input
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = { Text("Confirm Password") },
                        placeholder = { Text("••••••••") },
                        leadingIcon = {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = ProfessionalPrimary)
                        },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("signup_confirm_password_input"),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ProfessionalPrimary,
                            unfocusedBorderColor = ProfessionalOutline
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(28.dp))

            // Submit Button
            Button(
                onClick = {
                    if (isSignUp) {
                        if (password != confirmPassword) {
                            viewModel.setAuthError("Passwords do not match.")
                        } else {
                            viewModel.register(name, email, password, onRegistered = {})
                        }
                    } else {
                        viewModel.login(email, password, onLoggedIn = {})
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag(if (isSignUp) "signup_button" else "login_button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ProfessionalPrimary,
                    contentColor = Color.White
                ),
                shape = RoundedCornerShape(25.dp),
                enabled = !isAuthenticating
            ) {
                if (isAuthenticating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = if (isSignUp) "Create Account" else "Sign In",
                        fontFamily = FontFamilyHeadline,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Alt option switcher Text Button
            TextButton(
                onClick = { isSignUp = !isSignUp },
                modifier = Modifier
                    .height(48.dp)
                    .testTag("switch_auth_mode")
            ) {
                Text(
                    text = if (isSignUp) "Already have an account? Sign In" else "New to Messages? Create an Account",
                    color = ProfessionalPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp
                )
            }
        }
    }
}
}

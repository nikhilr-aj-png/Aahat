package com.example.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [Contact::class, Message::class, User::class], version = 3, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun contactDao(): ContactDao
    abstract fun messageDao(): MessageDao
    abstract fun userDao(): UserDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "messages_database"
                )
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                INSTANCE = instance
                instance
            }
        }

        fun getSeedContacts(): List<Contact> = listOf(
            Contact(
                id = "elena",
                name = "Elena R.",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuBecroCfGivkOavOxpU5BY2AJEmy9BifH9FThj_GvI-RrWCYoLmchy_3tsNCsz8L_Ckz0QbL96woQCTQpkaxgrkZi3g4CHj_VJflTmF9h1Sojwu0V9VZ-6WdyA6u41Rk-gfKRE7H3oz2FimR2QN-HNdXhnzwRf1pDjKre0ZUMdY9x--yXzensBQ2fJIho2aockX8qYokEJ0ifQG6qu0v3OVtiCnyJHU4-wjCEzW-1nILf0HmW9srnkR3OCfZaTbpaLpbB98nzA-BEkx",
                isActive = true,
                lastActiveText = "Active now",
                isRecent = true,
                recentMessageText = "Here's a sneak peek.",
                recentMessageTime = "14:45",
                recentMessageIsUnread = false
            ),
            Contact(
                id = "alex",
                name = "Alex",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuCAZTTl1dYqg1Zcop8JVoWzFHtL2BL1mA8Es7oih4H6ocgUNFWpHqf-SLQ5kLY4h-fLEeSAmP4SFuHc3Hl2jUnVqO-tDHUOg7kupe4ZoW-xctftiJKbLBx6k2KAXVJaNQ7svhwr-jomJYvz080A28Tdp7rYwMSUZuyY9e5CEqilXkehFH15RCQlg5COT-14sNzedDpHP2Dp-tfCcUIUjA9-IGG3VEZM-GhXxDEerK32VkxygVanyAC_tukQ1IBD4VqBB4V64QiWJiYz",
                isActive = true,
                lastActiveText = "Active 2m ago",
                isRecent = true,
                recentMessageText = "Are we still on for tonight?",
                recentMessageTime = "2m ago",
                recentMessageIsUnread = true
            ),
            Contact(
                id = "sam",
                name = "Sam",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuCOXPbVV7NsGOYkwfWqnAGXfDT13OIgpnPD5s3T-ka_L2luCX1hEghMDjPm3nfkqgGdcWRP9aGKR18tfIvZILdqfRR2cQ6ucwkqbiFvPs6zGeGuzSvCoPm7uwyn35FCeke4iz7qqn1mh4HMzSv8Z1hFGtcJQnVFlo7Zeq812bI1fIkzbhngJ2jEs4voMqqqnd7dsD7y5cOxwAUy8SEpsP7HEs6a1HS24_eB9POLbKoQWwlE1TUkPtt73jdLTKQPuk0no2P2y_sIhsdc",
                isActive = true,
                lastActiveText = "Active 1h ago",
                isRecent = true,
                recentMessageText = "That sounds like a great plan!",
                recentMessageTime = "1h ago",
                recentMessageIsUnread = false
            ),
            Contact(
                id = "jordan",
                name = "Jordan",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuBm8W-kr0b9IvK3KWwj5lcUp2FzqXaiC23pAwywIoX4vO-5XnVe58tIuPS602OI_gheiS88xreUNZSZy9qucjs-vbyyvir4Y_echYnxuxr-tqFJmORKfM9A663lCeusA4MqBZrVKineKmMxfiIk5LMjqIndhTIQMAtEEydRc3n4XHOO6H-CCd3DLSzw2i4tfwTtXrgPMHSUI7BqW15TGj-_Qo2LvlMZjJE5FRcEFN5xNzCyoLcH-qqSoIbHlDA7eXMWlVRUwpoQElhh",
                isActive = true,
                lastActiveText = "Active 3h ago",
                isRecent = true,
                recentMessageText = "Sent an image",
                recentMessageTime = "3h ago",
                recentMessageIsUnread = true
            ),
            Contact(
                id = "casey",
                name = "Casey",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuDGbeMraIWJ4X795ruj-jOu94Da7mshYV5Qo9bK0j-rkN17lucUSlRhakud2BaOswRw0jYCEbUTMp63DYcM_kqfYEo93sSAniu3N69CYpBvK1UnBVdWu3hMJ7HXfD28GATbpaGxi4KFuZPmvkRTrId9cWtam3giM3mB2Hg41Pfy-xbkNkj6i5g_vTZEqczlEFfOOskyqPU0oeKIWVf2HXes8J0Sx7zjlfEvaDaVhnSrreu-ehn_bJZZjYKX-DgKUt8eStMmLYJVcNVM",
                isActive = false,
                lastActiveText = "Active yesterday",
                isRecent = true,
                recentMessageText = "Thanks for the update, talk later.",
                recentMessageTime = "Yesterday",
                recentMessageIsUnread = false
            ),
            Contact(
                id = "taylor",
                name = "Taylor",
                avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuDyPUSWmsNCPpvylRE-p0X61COhz2frVEXefuI76cQlr-TwfnHn8PZjKtc77uIzQi-66hJFRwtNG1SY3_Am_yQ-q1a-98rbgOgPud51sd6AgROOvaHkvO0Kg9KHbvXa-RUC1yx_dt62Cfkb_h0lxdk_l0I9LPf12N_lJh-pFHSpI83m4Hck2tANW9l2kBlc8v3i8jO5fR58yTjVwGIETW1RwPl2W_xo8EsT9GoDNM2iXczmctPLGPxPGffjQ2wOPGENrug6ozg1xgLO",
                isActive = true,
                lastActiveText = "Active 5h ago",
                isRecent = false,
                recentMessageText = "",
                recentMessageTime = "",
                recentMessageIsUnread = false
            )
        )

        fun getSeedMessages(): List<Message> {
            val now = System.currentTimeMillis()
            return listOf(
                // Elena's initial conversation
                Message(
                    contactId = "elena",
                    text = "Hey! Are we still on for the design review later today?",
                    isFromMe = false,
                    timestamp = now - 3600000 * 2, // 2 hours ago
                    timeText = "14:23",
                    isRead = true
                ),
                Message(
                    contactId = "elena",
                    text = "Absolutely. I've got the new glassmorphic prototypes ready to show.",
                    isFromMe = true,
                    timestamp = now - 3600000 * 2 + 300000, // 5 min later
                    timeText = "14:28",
                    isRead = true
                ),
                Message(
                    contactId = "elena",
                    text = "Perfect. Can't wait to see them.",
                    isFromMe = false,
                    timestamp = now - 3600000 * 2 + 420000, // another 2 min later
                    timeText = "14:30",
                    isRead = true
                ),
                Message(
                    contactId = "elena",
                    text = "Here's a sneak peek.",
                    isFromMe = true,
                    timestamp = now - 3600000 * 2 + 1320000, // another 15 min later
                    timeText = "14:45",
                    isRead = true,
                    attachmentUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuA_eejNg_SF5ymlzQk-9QGWvdj3m6u67oC6Gs6YwWYqfaOMoB4iIQsX-5jA7bRwV5d3S5LhzXzGmqzPVwGc6Z_xQ8_8gKYubF58a1vSDOF_riBHHvKEVM8mbK00eFF2nQSeUlOYtYQzMfJLX8EjlCxF4saoT44ruqPF-XN5BKtqrTpUkDGsxB5dwXtjAJ-m4osSHE9NvW07UGogZuBMIhQKLZUwuOfVALm5nSrXvgg2EXWQ58b9cDWv1-iI2YUNQJ2JXXErW-oy632Y"
                ),

                // Other contacts initial unread / read messages
                Message(
                    contactId = "alex",
                    text = "Are we still on for tonight?",
                    isFromMe = false,
                    timestamp = now - 120000, // 2min ago
                    timeText = "2m ago",
                    isRead = false
                ),
                Message(
                    contactId = "sam",
                    text = "That sounds like a great plan!",
                    isFromMe = false,
                    timestamp = now - 3600000, // 1h ago
                    timeText = "1h ago",
                    isRead = true
                ),
                Message(
                    contactId = "jordan",
                    text = "Sent an image",
                    isFromMe = false,
                    timestamp = now - 3600000 * 3, // 3h ago
                    timeText = "3h ago",
                    isRead = false,
                    attachmentUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuA_eejNg_SF5ymlzQk-9QGWvdj3m6u67oC6Gs6YwWYqfaOMoB4iIQsX-5jA7bRwV5d3S5LhzXzGmqzPVwGc6Z_xQ8_8gKYubF58a1vSDOF_riBHHvKEVM8mbK00eFF2nQSeUlOYtYQzMfJLX8EjlCxF4saoT44ruqPF-XN5BKtqrTpUkDGsxB5dwXtjAJ-m4osSHE9NvW07UGogZuBMIhQKLZUwuOfVALm5nSrXvgg2EXWQ58b9cDWv1-iI2YUNQJ2JXXErW-oy632Y"
                ),
                Message(
                    contactId = "casey",
                    text = "Thanks for the update, talk later.",
                    isFromMe = false,
                    timestamp = now - 3600000 * 24, // yesterday
                    timeText = "Yesterday",
                    isRead = true
                )
            )
        }
    }
}

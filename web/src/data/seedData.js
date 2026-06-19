/**
 * Seed data for the Aahat messaging application.
 * Used as fallback when Supabase is unavailable or returns empty data.
 */

export const SEED_CONTACTS = [
  {
    id: "aahat-design-group",
    name: "Aahat Design Team",
    avatarUrl: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150",
    isActive: true,
    lastActiveText: "Active now",
    isRecent: true,
    recentMessageText: "Let's review the sound-wave logo today",
    recentMessageTime: "15:30",
    recentMessageIsUnread: false,
    isGroup: true,
    memberCount: 12,
    description: "Official group for Aahat design tokens, micro-interactions and SaaS dashboard design.",
    isPinned: true,
    unreadCount: 0
  },
  {
    id: "elena",
    name: "Elena R.",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    isActive: true,
    lastActiveText: "Active now",
    isRecent: true,
    recentMessageText: "Here's a sneak peek.",
    recentMessageTime: "14:45",
    recentMessageIsUnread: false,
    isFavorite: true,
    isPinned: true,
    unreadCount: 0,
    stories: [
      { id: "e1", type: "image", url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600", timestamp: Date.now() - 3600000, views: 42 },
      { id: "e2", type: "text", content: "Glassmorphism aesthetics are just incredible. ✨", bgGradient: "linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)", timestamp: Date.now() - 7200000, views: 58 }
    ]
  },
  {
    id: "dev-studio",
    name: "Engineers Studio",
    avatarUrl: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=150",
    isActive: true,
    lastActiveText: "Active now",
    isRecent: true,
    recentMessageText: "Realtime channels are set up!",
    recentMessageTime: "12:15",
    recentMessageIsUnread: false,
    isGroup: true,
    memberCount: 6,
    description: "Development updates, WebRTC video calling and Firebase integration sync.",
    unreadCount: 0
  },
  {
    id: "kigye",
    name: "kigye",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    isActive: true,
    lastActiveText: "Active now",
    isRecent: true,
    recentMessageText: "I love it! It is super fast and looks extremely premium.",
    recentMessageTime: "10m ago",
    recentMessageIsUnread: false,
    stories: [
      { id: "k1", type: "image", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600", timestamp: Date.now() - 1800000, views: 12 }
    ]
  },
  {
    id: "alex",
    name: "Alex",
    avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
    isActive: true,
    lastActiveText: "Active 2m ago",
    isRecent: true,
    recentMessageText: "Are we still on for tonight?",
    recentMessageTime: "2m ago",
    recentMessageIsUnread: true,
    unreadCount: 1,
    isFavorite: true,
    stories: [
      { id: "a1", type: "text", content: "Working on the calling UI components right now...", bgGradient: "linear-gradient(135deg, #10B981 0%, #059669 100%)", timestamp: Date.now() - 10000000, views: 19 }
    ]
  },
  {
    id: "sam",
    name: "Sam",
    avatarUrl: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150",
    isActive: true,
    lastActiveText: "Active 1h ago",
    isRecent: true,
    recentMessageText: "That sounds like a great plan!",
    recentMessageTime: "1h ago",
    recentMessageIsUnread: false
  },
  {
    id: "jordan",
    name: "Jordan",
    avatarUrl: "https://images.unsplash.com/photo-1527983359383-4758693f760c?w=150",
    isActive: true,
    lastActiveText: "Active 3h ago",
    isRecent: true,
    recentMessageText: "Sent an image",
    recentMessageTime: "3h ago",
    recentMessageIsUnread: true,
    unreadCount: 2
  },
  {
    id: "casey",
    name: "Casey",
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150",
    isActive: false,
    lastActiveText: "Active yesterday",
    isRecent: true,
    recentMessageText: "Thanks for the update, talk later.",
    recentMessageTime: "Yesterday",
    recentMessageIsUnread: false,
    isArchived: true
  },
  {
    id: "taylor",
    name: "Taylor",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150",
    isActive: true,
    lastActiveText: "Active 5h ago",
    isRecent: false,
    recentMessageText: "",
    recentMessageTime: "",
    recentMessageIsUnread: false
  }
];

export const SEED_MESSAGES = [
  {
    contactId: "aahat-design-group",
    text: "Hey everyone! Let's finalize the design style guide today.",
    isFromMe: false,
    timestamp: Date.now() - 10000000,
    timeText: "14:10",
    isRead: true
  },
  {
    contactId: "aahat-design-group",
    text: "Agreed. The primary theme color is indigo (#4F46E5) and cyan (#06B6D4) for primary accents.",
    isFromMe: true,
    timestamp: Date.now() - 9000000,
    timeText: "14:15",
    isRead: true
  },
  {
    contactId: "aahat-design-group",
    text: "Let's review the sound-wave logo today",
    isFromMe: false,
    timestamp: Date.now() - 8000000,
    timeText: "15:30",
    isRead: true
  },
  {
    contactId: "elena",
    text: "Hey! Are we still on for the design review later today?",
    isFromMe: false,
    timestamp: Date.now() - 7200000,
    timeText: "14:23",
    isRead: true
  },
  {
    contactId: "elena",
    text: "Absolutely. I've got the new glassmorphic prototypes ready to show.",
    isFromMe: true,
    timestamp: Date.now() - 6900000,
    timeText: "14:28",
    isRead: true
  },
  {
    contactId: "elena",
    text: "Perfect. Can't wait to see them.",
    isFromMe: false,
    timestamp: Date.now() - 6780000,
    timeText: "14:30",
    isRead: true
  },
  {
    contactId: "elena",
    text: "Here's a sneak peek.",
    isFromMe: true,
    timestamp: Date.now() - 5460000,
    timeText: "14:45",
    isRead: true,
    attachmentUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600"
  },
  {
    contactId: "dev-studio",
    text: "Supabase integration looks very smooth.",
    isFromMe: false,
    timestamp: Date.now() - 15000000,
    timeText: "11:30",
    isRead: true
  },
  {
    contactId: "dev-studio",
    text: "Realtime channels are set up!",
    isFromMe: false,
    timestamp: Date.now() - 12000000,
    timeText: "12:15",
    isRead: true
  },
  {
    contactId: "alex",
    text: "Are we still on for tonight?",
    isFromMe: false,
    timestamp: Date.now() - 120000,
    timeText: "2m ago",
    isRead: false
  },
  {
    contactId: "sam",
    text: "That sounds like a great plan!",
    isFromMe: false,
    timestamp: Date.now() - 3600000,
    timeText: "1h ago",
    isRead: true
  },
  {
    contactId: "jordan",
    text: "Sent an image",
    isFromMe: false,
    timestamp: Date.now() - 10800000,
    timeText: "3h ago",
    isRead: false,
    attachmentUrl: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600"
  },
  {
    contactId: "casey",
    text: "Thanks for the update, talk later.",
    isFromMe: false,
    timestamp: Date.now() - 86400000,
    timeText: "Yesterday",
    isRead: true
  },
  {
    contactId: "kigye",
    text: "Hi there! I am kigye, your new dummy contact.",
    isFromMe: false,
    timestamp: Date.now() - 3600000,
    timeText: "1h ago",
    isRead: true
  },
  {
    contactId: "kigye",
    text: "Great to meet you! How do you like the new Aahat interface?",
    isFromMe: true,
    timestamp: Date.now() - 1800000,
    timeText: "30m ago",
    isRead: true
  },
  {
    contactId: "kigye",
    text: "I love it! It is super fast and looks extremely premium.",
    isFromMe: false,
    timestamp: Date.now() - 600000,
    timeText: "10m ago",
    isRead: true
  }
];

/**
 * Generate a contextual auto-reply based on contact and user message.
 */
export function getLocalReply(contactId, userMessage) {
  const lower = (userMessage || "").toLowerCase().trim();
  switch (contactId) {
    case "elena":
      if (lower.includes("hello") || lower.includes("hi")) {
        return "Hi there! Glad you wrote back. What did you think of the sneak peek?";
      }
      if (lower.includes("glassmorphic") || lower.includes("peek") || lower.includes("sneak") || lower.includes("design")) {
        return "It uses custom multi-layered radial gradients with high-contrast active highlights, exactly matching the design token sheets!";
      }
      if (lower.includes("great") || lower.includes("awesome") || lower.includes("cool") || lower.includes("nice")) {
        return "Wow, thanks! I am so excited about publishing this soon! Let me know if you want detailed design spec folders too.";
      }
      return "Perfect. Let's sync up for a real demo later, I can show you the interactive spring motions too!";
    case "alex":
      if (lower.includes("yeah") || lower.includes("yes") || lower.includes("sure") || lower.includes("still on")) {
        return "Awesome, let's meet at 8 PM at the usual place! See ya!";
      }
      if (lower.includes("no") || lower.includes("sorry") || lower.includes("busy")) {
        return "Oh, no worries at all! Just let me know next week when you're free.";
      }
      return "Let me know! I'm around all evening.";
    case "sam":
      return "That sounds like a massive victory! Absolutely loving this energy. ✨";
    case "jordan":
      return "Awesome visual, let me update the canvas files and get back to you in a bit.";
    case "casey":
      return "Always happy to assist! Let's talk again soon.";
    case "kigye":
      if (lower.includes("hello") || lower.includes("hi")) {
        return "Hi there! I'm kigye. Let me know what you think of this premium layout!";
      }
      return "That sounds awesome! Let's build something amazing with Aahat.";
    default:
      return "Hey there! I got your message. Talk soon!";
  }
}

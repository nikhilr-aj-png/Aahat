-- =====================================================================
-- AAHAT (आहट) MESSAGING PLATFORM — V2 PRODUCTION SQL SCHEMA
-- Target: Supabase PostgreSQL
-- Features: Normalized schema, strict RLS, real-time, presence,
--           groups, channels, stories, calls, message status tracking
-- =====================================================================

-- =============================================================
-- 0. EXTENSIONS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- 1. PROFILES (replaces old 'users' table)
-- Linked to Supabase auth.users via id
-- =============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    bio TEXT DEFAULT 'Hey there! I am using Aahat.',
    phone TEXT,
    virtual_number TEXT UNIQUE,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT now(),
    fcm_token TEXT,
    privacy_settings JSONB DEFAULT '{"last_seen": true, "read_receipts": true, "profile_photo": "everyone", "status": "contacts"}'::jsonb,
    notification_settings JSONB DEFAULT '{"sound": true, "previews": true, "push_enabled": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-generate virtual_number on insert
CREATE OR REPLACE FUNCTION generate_virtual_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.virtual_number IS NULL THEN
        NEW.virtual_number := lpad(floor(random() * 10000000000)::text, 10, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_virtual_number ON profiles;
CREATE TRIGGER trg_generate_virtual_number
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION generate_virtual_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, username)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        split_part(NEW.email, '@', 1)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- 2. CONVERSATIONS (unified: direct, group, self)
-- =============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'self')),
    name TEXT,                      -- NULL for direct chats, set for groups
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    invite_code TEXT UNIQUE,        -- For group invite links
    is_admin_only_post BOOLEAN DEFAULT false,  -- Only admins can post
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_conversations_updated ON conversations;
CREATE TRIGGER trg_conversations_updated
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 3. CONVERSATION_MEMBERS
-- =============================================================
CREATE TABLE IF NOT EXISTS conversation_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    is_muted BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_favorite BOOLEAN DEFAULT false,
    unread_count INTEGER DEFAULT 0,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(conversation_id, user_id)
);

-- =============================================================
-- 4. MESSAGES
-- =============================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'voice_note', 'file', 'system')),
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_size INTEGER,
    attachment_mime_type TEXT,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    forwarded_from_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted_for_everyone BOOLEAN DEFAULT false,
    deleted_for_users UUID[] DEFAULT '{}',  -- Array of user IDs who deleted locally
    is_pinned BOOLEAN DEFAULT false,
    is_starred_by UUID[] DEFAULT '{}',      -- Array of user IDs who starred
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    edited_at TIMESTAMPTZ
);

-- =============================================================
-- 5. MESSAGE_REACTIONS
-- =============================================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(message_id, user_id, emoji)
);

-- =============================================================
-- 6. MESSAGE_STATUS (sent → delivered → read)
-- =============================================================
CREATE TABLE IF NOT EXISTS message_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    status_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(message_id, user_id)
);

-- =============================================================
-- 7. BLOCKED_USERS
-- =============================================================
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(blocker_id, blocked_id)
);

-- =============================================================
-- 8. STATUSES (Stories — with 24h expiration)
-- =============================================================
CREATE TABLE IF NOT EXISTS statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video')),
    content TEXT,                 -- For text statuses
    media_url TEXT,               -- For image/video statuses
    bg_gradient TEXT,             -- Background gradient for text statuses
    view_count INTEGER DEFAULT 0,
    privacy TEXT DEFAULT 'contacts' CHECK (privacy IN ('everyone', 'contacts', 'private')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================
-- 9. STATUS_VIEWS
-- =============================================================
CREATE TABLE IF NOT EXISTS status_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(status_id, viewer_id)
);

-- =============================================================
-- 10. CALLS
-- =============================================================
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    initiator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
    status TEXT DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected', 'busy')),
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0
);

-- =============================================================
-- 11. CALL_PARTICIPANTS
-- =============================================================
CREATE TABLE IF NOT EXISTS call_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    is_muted BOOLEAN DEFAULT false,
    is_camera_off BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT now(),
    left_at TIMESTAMPTZ,
    UNIQUE(call_id, user_id)
);

-- =============================================================
-- 12. CHANNELS
-- =============================================================
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private')),
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subscriber_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_channels_updated ON channels;
CREATE TRIGGER trg_channels_updated
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 13. CHANNEL_MEMBERS
-- =============================================================
CREATE TABLE IF NOT EXISTS channel_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'subscriber' CHECK (role IN ('admin', 'subscriber')),
    joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(channel_id, user_id)
);

-- =============================================================
-- 14. CHANNEL_POSTS
-- =============================================================
CREATE TABLE IF NOT EXISTS channel_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video', 'file', NULL)),
    reaction_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================
-- 15. USER_NOTIFICATIONS
-- =============================================================
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,           -- 'message', 'call', 'mention', 'group_invite', 'status_reaction'
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================
-- 16. CALL_SIGNALING (WebRTC signaling via database)
-- =============================================================
CREATE TABLE IF NOT EXISTS call_signaling (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice_candidate', 'hangup', 'reject')),
    signal_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================
-- PERFORMANCE INDEXES
-- =============================================================

-- Messages: most common query — fetch messages in a conversation sorted by time
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at DESC);

-- Messages: filter out deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted
    ON messages (conversation_id, is_deleted_for_everyone)
    WHERE is_deleted_for_everyone = false;

-- Conversation members: lookup conversations for a user
CREATE INDEX IF NOT EXISTS idx_conv_members_user
    ON conversation_members (user_id, conversation_id);

-- Conversation members: lookup members of a conversation
CREATE INDEX IF NOT EXISTS idx_conv_members_conversation
    ON conversation_members (conversation_id, user_id);

-- Message status: lookup status for a message
CREATE INDEX IF NOT EXISTS idx_message_status_message
    ON message_status (message_id, user_id);

-- Profiles: lookup by email and username
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_virtual_number ON profiles (virtual_number);

-- Statuses: filter active (non-expired) statuses
CREATE INDEX IF NOT EXISTS idx_statuses_active
    ON statuses (user_id, expires_at DESC);

-- Blocked users: lookup blocks for a user
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked_id);

-- Calls: lookup calls for a conversation
CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls (conversation_id, started_at DESC);

-- Call signaling: lookup signals for a call
CREATE INDEX IF NOT EXISTS idx_call_signaling_call ON call_signaling (call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_signaling_receiver ON call_signaling (receiver_id, created_at DESC);

-- Channels: lookup by type
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels (type);

-- Channel members: lookup channels for a user
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members (user_id);

-- Notifications: unread notifications for a user
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON user_notifications (user_id, is_read, created_at DESC)
    WHERE is_read = false;

-- =============================================================
-- HELPER FUNCTIONS
-- =============================================================

-- Get or create a direct conversation between two users
CREATE OR REPLACE FUNCTION get_or_create_direct_conversation(
    user1_id UUID,
    user2_id UUID
) RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    -- Check if direct conversation already exists between these two users
    SELECT c.id INTO conv_id
    FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = user1_id
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = user2_id
    WHERE c.type = 'direct'
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Create new direct conversation
    INSERT INTO conversations (type, created_by)
    VALUES ('direct', user1_id)
    RETURNING id INTO conv_id;

    -- Add both members
    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES
        (conv_id, user1_id, 'member'),
        (conv_id, user2_id, 'member');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get or create self-chat conversation
CREATE OR REPLACE FUNCTION get_or_create_self_conversation(
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    SELECT c.id INTO conv_id
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = p_user_id
    WHERE c.type = 'self'
    LIMIT 1;

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    INSERT INTO conversations (type, name, created_by)
    VALUES ('self', 'You (Message Yourself)', p_user_id)
    RETURNING id INTO conv_id;

    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, p_user_id, 'admin');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a group conversation
CREATE OR REPLACE FUNCTION create_group_conversation(
    p_creator_id UUID,
    p_name TEXT,
    p_description TEXT DEFAULT '',
    p_avatar_url TEXT DEFAULT '',
    p_member_ids UUID[] DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    conv_id UUID;
    member_id UUID;
BEGIN
    INSERT INTO conversations (type, name, description, avatar_url, created_by, invite_code)
    VALUES ('group', p_name, p_description, p_avatar_url, p_creator_id, encode(gen_random_bytes(8), 'hex'))
    RETURNING id INTO conv_id;

    -- Add creator as admin
    INSERT INTO conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, p_creator_id, 'admin');

    -- Add other members
    FOREACH member_id IN ARRAY p_member_ids
    LOOP
        IF member_id != p_creator_id THEN
            INSERT INTO conversation_members (conversation_id, user_id, role)
            VALUES (conv_id, member_id, 'member')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;
    END LOOP;

    -- Insert system message
    INSERT INTO messages (conversation_id, sender_id, content, message_type)
    VALUES (conv_id, p_creator_id, 'created this group', 'system');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment unread count for all members except sender
CREATE OR REPLACE FUNCTION increment_unread_on_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.message_type != 'system' THEN
        UPDATE conversation_members
        SET unread_count = unread_count + 1
        WHERE conversation_id = NEW.conversation_id
          AND user_id != NEW.sender_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_unread ON messages;
CREATE TRIGGER trg_increment_unread
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION increment_unread_on_message();

-- =============================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_signaling ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "profiles_select_authenticated" ON profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- ---- CONVERSATIONS ----
-- Users can see conversations they are members of
CREATE POLICY "conversations_select_member" ON conversations
    FOR SELECT TO authenticated
    USING (
        id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "conversations_insert_authenticated" ON conversations
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "conversations_update_member" ON conversations
    FOR UPDATE TO authenticated
    USING (
        id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "conversations_delete_admin" ON conversations
    FOR DELETE TO authenticated
    USING (
        id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- ---- CONVERSATION_MEMBERS ----
CREATE POLICY "conv_members_select" ON conversation_members
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "conv_members_insert" ON conversation_members
    FOR INSERT TO authenticated
    WITH CHECK (
        -- User can add self, or is admin of the conversation
        user_id = auth.uid()
        OR conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "conv_members_update_own" ON conversation_members
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "conv_members_delete" ON conversation_members
    FOR DELETE TO authenticated
    USING (
        -- User can remove self, or is admin of the conversation
        user_id = auth.uid()
        OR conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

-- ---- MESSAGES ----
CREATE POLICY "messages_select_member" ON messages
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "messages_insert_member" ON messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "messages_update_sender" ON messages
    FOR UPDATE TO authenticated
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_delete_sender" ON messages
    FOR DELETE TO authenticated
    USING (sender_id = auth.uid());

-- ---- MESSAGE_REACTIONS ----
CREATE POLICY "reactions_select_member" ON message_reactions
    FOR SELECT TO authenticated
    USING (
        message_id IN (
            SELECT m.id FROM messages m
            JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE cm.user_id = auth.uid()
        )
    );

CREATE POLICY "reactions_insert_own" ON message_reactions
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "reactions_delete_own" ON message_reactions
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ---- MESSAGE_STATUS ----
CREATE POLICY "msg_status_select_member" ON message_status
    FOR SELECT TO authenticated
    USING (
        message_id IN (
            SELECT m.id FROM messages m
            JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE cm.user_id = auth.uid()
        )
    );

CREATE POLICY "msg_status_insert_own" ON message_status
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "msg_status_update_own" ON message_status
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ---- BLOCKED_USERS ----
CREATE POLICY "blocked_select_own" ON blocked_users
    FOR SELECT TO authenticated
    USING (blocker_id = auth.uid());

CREATE POLICY "blocked_insert_own" ON blocked_users
    FOR INSERT TO authenticated
    WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "blocked_delete_own" ON blocked_users
    FOR DELETE TO authenticated
    USING (blocker_id = auth.uid());

-- ---- STATUSES ----
CREATE POLICY "statuses_select_visible" ON statuses
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()  -- Always see own
        OR privacy = 'everyone'
        OR (privacy = 'contacts' AND user_id IN (
            SELECT cm2.user_id FROM conversation_members cm1
            JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
            WHERE cm1.user_id = auth.uid() AND cm2.user_id != auth.uid()
        ))
    );

CREATE POLICY "statuses_insert_own" ON statuses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "statuses_update_own" ON statuses
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "statuses_delete_own" ON statuses
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ---- STATUS_VIEWS ----
CREATE POLICY "status_views_select" ON status_views
    FOR SELECT TO authenticated
    USING (
        viewer_id = auth.uid()
        OR status_id IN (SELECT id FROM statuses WHERE user_id = auth.uid())
    );

CREATE POLICY "status_views_insert_own" ON status_views
    FOR INSERT TO authenticated
    WITH CHECK (viewer_id = auth.uid());

-- ---- CALLS ----
CREATE POLICY "calls_select_member" ON calls
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "calls_insert_member" ON calls
    FOR INSERT TO authenticated
    WITH CHECK (
        initiator_id = auth.uid()
        AND conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "calls_update_member" ON calls
    FOR UPDATE TO authenticated
    USING (
        conversation_id IN (
            SELECT conversation_id FROM conversation_members
            WHERE user_id = auth.uid()
        )
    );

-- ---- CALL_PARTICIPANTS ----
CREATE POLICY "call_parts_select" ON call_participants
    FOR SELECT TO authenticated
    USING (
        call_id IN (
            SELECT c.id FROM calls c
            JOIN conversation_members cm ON cm.conversation_id = c.conversation_id
            WHERE cm.user_id = auth.uid()
        )
    );

CREATE POLICY "call_parts_insert_own" ON call_participants
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "call_parts_update_own" ON call_participants
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- ---- CALL_SIGNALING ----
CREATE POLICY "signaling_select_participant" ON call_signaling
    FOR SELECT TO authenticated
    USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "signaling_insert_sender" ON call_signaling
    FOR INSERT TO authenticated
    WITH CHECK (sender_id = auth.uid());

-- ---- CHANNELS ----
CREATE POLICY "channels_select_public" ON channels
    FOR SELECT TO authenticated
    USING (
        type = 'public'
        OR id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid())
    );

CREATE POLICY "channels_insert_authenticated" ON channels
    FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "channels_update_admin" ON channels
    FOR UPDATE TO authenticated
    USING (
        id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "channels_delete_admin" ON channels
    FOR DELETE TO authenticated
    USING (
        id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin')
    );

-- ---- CHANNEL_MEMBERS ----
CREATE POLICY "ch_members_select" ON channel_members
    FOR SELECT TO authenticated
    USING (
        channel_id IN (SELECT id FROM channels WHERE type = 'public')
        OR user_id = auth.uid()
    );

CREATE POLICY "ch_members_insert" ON channel_members
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        OR channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "ch_members_delete" ON channel_members
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid()
        OR channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin')
    );

-- ---- CHANNEL_POSTS ----
CREATE POLICY "ch_posts_select_member" ON channel_posts
    FOR SELECT TO authenticated
    USING (
        channel_id IN (
            SELECT channel_id FROM channel_members WHERE user_id = auth.uid()
        )
        OR channel_id IN (SELECT id FROM channels WHERE type = 'public')
    );

CREATE POLICY "ch_posts_insert_admin" ON channel_posts
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND channel_id IN (
            SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "ch_posts_delete_admin" ON channel_posts
    FOR DELETE TO authenticated
    USING (
        author_id = auth.uid()
        OR channel_id IN (SELECT channel_id FROM channel_members WHERE user_id = auth.uid() AND role = 'admin')
    );

-- ---- USER_NOTIFICATIONS ----
CREATE POLICY "notifications_select_own" ON user_notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON user_notifications
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "notifications_update_own" ON user_notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON user_notifications
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- =============================================================
-- REALTIME PUBLICATIONS
-- =============================================================
DO $$
BEGIN
    -- Add tables to realtime publication
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Add all relevant tables to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
ALTER PUBLICATION supabase_realtime ADD TABLE call_signaling;
ALTER PUBLICATION supabase_realtime ADD TABLE statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE channel_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;

-- =============================================================
-- STORAGE BUCKET POLICIES (Reference — apply via Supabase Dashboard)
-- =============================================================
-- Bucket: 'avatars' — profile pictures
-- Bucket: 'attachments' — message attachments (images, videos, files)
-- Bucket: 'voice-notes' — voice note audio files
-- Bucket: 'status-media' — story/status images and videos
-- Bucket: 'channel-media' — channel post media

-- Policy pattern for all buckets:
-- SELECT: authenticated users can view
-- INSERT: authenticated users can upload (path must start with their user ID)
-- UPDATE: owner only (path starts with user ID)
-- DELETE: owner only (path starts with user ID)

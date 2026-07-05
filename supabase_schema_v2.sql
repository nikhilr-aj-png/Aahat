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

-- =====================================================
-- SUPER ADMIN DASHBOARD POLICIES
-- Apply after the base policies above. These let users with
-- profiles.role = 'super_admin' manage the v2 admin dashboard via Supabase Auth.
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_super_admin" ON profiles;
CREATE POLICY "profiles_select_super_admin" ON profiles
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "profiles_update_super_admin" ON profiles;
CREATE POLICY "profiles_update_super_admin" ON profiles
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "conversations_select_super_admin" ON conversations;
CREATE POLICY "conversations_select_super_admin" ON conversations
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "conversations_update_super_admin" ON conversations;
CREATE POLICY "conversations_update_super_admin" ON conversations
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "conv_members_select_super_admin" ON conversation_members;
CREATE POLICY "conv_members_select_super_admin" ON conversation_members
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "conv_members_update_super_admin" ON conversation_members;
CREATE POLICY "conv_members_update_super_admin" ON conversation_members
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "messages_select_super_admin" ON messages;
CREATE POLICY "messages_select_super_admin" ON messages
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "messages_update_super_admin" ON messages;
CREATE POLICY "messages_update_super_admin" ON messages
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "calls_select_super_admin" ON calls;
CREATE POLICY "calls_select_super_admin" ON calls
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "statuses_select_super_admin" ON statuses;
CREATE POLICY "statuses_select_super_admin" ON statuses
  FOR SELECT USING (public.is_super_admin());

DROP POLICY IF EXISTS "channels_select_super_admin" ON channels;
CREATE POLICY "channels_select_super_admin" ON channels
  FOR SELECT USING (public.is_super_admin());

-- =====================================================
-- STORAGE BUCKETS AND POLICIES
-- Requires Supabase Storage extension/schema. Safe to re-run.
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('attachments', 'attachments', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('voice-notes', 'voice-notes', true, 10485760, ARRAY['audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/ogg']),
  ('status-media', 'status-media', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']),
  ('channel-media', 'channel-media', true, 52428800, ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "storage_public_read_aahat" ON storage.objects;
CREATE POLICY "storage_public_read_aahat" ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars','attachments','voice-notes','status-media','channel-media'));

DROP POLICY IF EXISTS "storage_user_upload_aahat" ON storage.objects;
CREATE POLICY "storage_user_upload_aahat" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('avatars','attachments','voice-notes','status-media','channel-media')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "storage_user_update_aahat" ON storage.objects;
CREATE POLICY "storage_user_update_aahat" ON storage.objects
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('avatars','attachments','voice-notes','status-media','channel-media')
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_super_admin())
  ) WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('avatars','attachments','voice-notes','status-media','channel-media')
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "storage_user_delete_aahat" ON storage.objects;
CREATE POLICY "storage_user_delete_aahat" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('avatars','attachments','voice-notes','status-media','channel-media')
    AND (split_part(name, '/', 1) = auth.uid()::text OR public.is_super_admin())
  );


-- =====================================================
-- AAHAT V2.1 PRODUCTION HARDENING
-- Adds moderation, device/session, attachment, edit-history,
-- report, saved-message, and audit tables requested for a
-- production messaging platform. Safe to re-run.
-- =====================================================

CREATE TABLE IF NOT EXISTS user_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nickname TEXT,
    status TEXT DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    bucket_id TEXT NOT NULL,
    object_path TEXT NOT NULL,
    public_url TEXT,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    mime_type TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS message_edit_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    editor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    old_content TEXT DEFAULT '',
    new_content TEXT DEFAULT '',
    edited_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    assigned_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('warn', 'ban', 'unban', 'delete_message', 'dismiss_report', 'resolve_report')),
    reason TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_name TEXT DEFAULT 'Unknown device',
    platform TEXT DEFAULT 'web',
    push_token TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, push_token)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_id UUID REFERENCES user_devices(id) ON DELETE SET NULL,
    ip_hash TEXT,
    user_agent TEXT,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS starred_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, message_id)
);

CREATE TABLE IF NOT EXISTS saved_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_owner ON user_contacts(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_edit_history_message ON message_edit_history(message_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_actions_admin ON moderation_actions(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation ON pinned_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_starred_messages_user ON starred_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_messages_user ON saved_messages(user_id, created_at DESC);

ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_edit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE starred_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_own_access" ON user_contacts;
CREATE POLICY "contacts_own_access" ON user_contacts FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_super_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "attachments_member_select" ON message_attachments;
CREATE POLICY "attachments_member_select" ON message_attachments FOR SELECT TO authenticated USING (message_id IN (SELECT m.id FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE cm.user_id = auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "attachments_sender_insert" ON message_attachments;
CREATE POLICY "attachments_sender_insert" ON message_attachments FOR INSERT TO authenticated WITH CHECK (message_id IN (SELECT id FROM messages WHERE sender_id = auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "edit_history_member_select" ON message_edit_history;
CREATE POLICY "edit_history_member_select" ON message_edit_history FOR SELECT TO authenticated USING (message_id IN (SELECT m.id FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE cm.user_id = auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "edit_history_sender_insert" ON message_edit_history;
CREATE POLICY "edit_history_sender_insert" ON message_edit_history FOR INSERT TO authenticated WITH CHECK (editor_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "reports_insert_own" ON reports;
CREATE POLICY "reports_insert_own" ON reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "reports_select_own_or_admin" ON reports;
CREATE POLICY "reports_select_own_or_admin" ON reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "reports_update_admin" ON reports;
CREATE POLICY "reports_update_admin" ON reports FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "moderation_actions_admin" ON moderation_actions;
CREATE POLICY "moderation_actions_admin" ON moderation_actions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "devices_own" ON user_devices;
CREATE POLICY "devices_own" ON user_devices FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "sessions_own" ON user_sessions;
CREATE POLICY "sessions_own" ON user_sessions FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "audit_logs_admin_select" ON audit_logs;
CREATE POLICY "audit_logs_admin_select" ON audit_logs FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS "audit_logs_admin_insert" ON audit_logs;
CREATE POLICY "audit_logs_admin_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR actor_id = auth.uid());
DROP POLICY IF EXISTS "pinned_messages_member_select" ON pinned_messages;
CREATE POLICY "pinned_messages_member_select" ON pinned_messages FOR SELECT TO authenticated USING (conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "pinned_messages_member_insert" ON pinned_messages;
CREATE POLICY "pinned_messages_member_insert" ON pinned_messages FOR INSERT TO authenticated WITH CHECK (conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()) OR public.is_super_admin());
DROP POLICY IF EXISTS "starred_messages_own" ON starred_messages;
CREATE POLICY "starred_messages_own" ON starred_messages FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
DROP POLICY IF EXISTS "saved_messages_own" ON saved_messages;
CREATE POLICY "saved_messages_own" ON saved_messages FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

DROP TRIGGER IF EXISTS trg_user_contacts_updated ON user_contacts;
CREATE TRIGGER trg_user_contacts_updated BEFORE UPDATE ON user_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_reports_updated ON reports;
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

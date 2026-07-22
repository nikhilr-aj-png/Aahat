/**
 * Fixture data for the design preview harness.
 *
 * Shaped to match what the production hooks return, so the preview renders the
 * REAL components rather than mock-ups. If a component changes its data
 * contract, the preview breaks the same way the app would — which is the point.
 *
 * Dev-only. Never imported by the shipped app.
 */

const hoursAgo = hours => new Date(Date.now() - hours * 3600_000).toISOString();
const minutesAgo = minutes => new Date(Date.now() - minutes * 60_000).toISOString();

export const CURRENT_USER_ID = 'user-self-0001';
const OTHER_ID = 'user-other-0002';

export const conversations = [
  {
    id: 'conv-1', type: 'direct', name: 'Anshu Priya', avatarUrl: '',
    otherMemberId: OTHER_ID, otherMemberVirtualNumber: '4820193756',
    previewText: 'Photo', previewTime: '1:40 PM', unreadCount: 2,
    isPinned: true, isMuted: false, isArchived: false, isFavorite: true,
    lastMessageAt: minutesAgo(6)
  },
  {
    id: 'conv-2', type: 'direct', name: 'Nilambuj Sharma', avatarUrl: '',
    otherMemberId: 'user-other-0003', otherMemberVirtualNumber: '9014857263',
    previewText: 'Ho gya apk download', previewTime: 'Yesterday', unreadCount: 0,
    isPinned: false, isMuted: true, isArchived: false, isFavorite: false,
    lastMessageAt: hoursAgo(26)
  },
  {
    id: 'conv-3', type: 'group', name: 'Design Review', avatarUrl: '',
    memberCount: 8, previewText: 'Ankit: shipping the new build tonight',
    previewTime: '11:02 AM', unreadCount: 12,
    isPinned: false, isMuted: false, isArchived: false, isFavorite: false,
    lastMessageAt: hoursAgo(4)
  },
  {
    id: 'conv-4', type: 'direct', name: 'A name long enough to test truncation behaviour', avatarUrl: '',
    otherMemberId: 'user-other-0004', otherMemberVirtualNumber: '7712094583',
    previewText: 'A deliberately long preview line that should ellipsis rather than wrap or overflow its row',
    previewTime: 'Monday', unreadCount: 0,
    isPinned: false, isMuted: false, isArchived: false, isFavorite: false,
    lastMessageAt: hoursAgo(72)
  },
  {
    id: 'conv-5', type: 'self', name: 'Message yourself', avatarUrl: '',
    previewText: 'Notes to self', previewTime: 'Tuesday', unreadCount: 0,
    isPinned: false, isMuted: false, isArchived: false, isFavorite: false,
    lastMessageAt: hoursAgo(50)
  }
];

export const activeConversation = conversations[0];

export const messages = [
  {
    id: 'm1', conversation_id: 'conv-1', sender_id: OTHER_ID, content: 'Hey — did the build go out?',
    message_type: 'text', created_at: hoursAgo(3), isFromMe: false, senderName: 'Anshu Priya', reactionList: []
  },
  {
    id: 'm2', conversation_id: 'conv-1', sender_id: CURRENT_USER_ID,
    content: 'Yes, pushed about an hour ago. Running the smoke tests now.',
    message_type: 'text', created_at: hoursAgo(2.8), isFromMe: true, senderName: 'You',
    reactionList: [{ emoji: '👍', user_id: OTHER_ID }], _status: 'read'
  },
  {
    id: 'm3', conversation_id: 'conv-1', sender_id: OTHER_ID,
    content: 'Perfect. This is a deliberately long message written to check how a bubble wraps at narrow widths, whether the timestamp stays aligned, and whether anything overflows the row on a 300px screen.',
    message_type: 'text', created_at: hoursAgo(2.5), isFromMe: false, senderName: 'Anshu Priya', reactionList: []
  },
  {
    id: 'm4', conversation_id: 'conv-1', sender_id: OTHER_ID, content: '',
    message_type: 'image', attachment_url: 'https://example.invalid/storage/v1/object/public/attachments/x/IMG20260721103343.jpg',
    attachment_name: 'IMG20260721103343.jpg', attachment_size: 158_320, attachment_mime_type: 'image/jpeg',
    attachment_bucket: 'attachments', attachment_path: 'x/IMG20260721103343.jpg',
    created_at: hoursAgo(2), isFromMe: false, senderName: 'Anshu Priya', reactionList: []
  },
  {
    id: 'm5', conversation_id: 'conv-1', sender_id: CURRENT_USER_ID, content: '',
    message_type: 'file', attachment_url: 'https://example.invalid/storage/v1/object/public/attachments/x/quarterly-report.pdf',
    attachment_name: 'quarterly-report-with-a-long-filename.pdf', attachment_size: 2_411_000,
    attachment_mime_type: 'application/pdf', attachment_bucket: 'attachments', attachment_path: 'x/quarterly-report.pdf',
    created_at: hoursAgo(1.5), isFromMe: true, senderName: 'You', reactionList: [], _status: 'delivered'
  },
  {
    id: 'm6', conversation_id: 'conv-1', sender_id: OTHER_ID, content: '',
    message_type: 'image', attachment_url: null, attachment_consumed_at: hoursAgo(1),
    attachment_expired_type: 'image', created_at: hoursAgo(1.2), isFromMe: false,
    senderName: 'Anshu Priya', reactionList: []
  },
  {
    id: 'm7', conversation_id: 'conv-1', sender_id: CURRENT_USER_ID, content: 'Short one.',
    message_type: 'text', created_at: minutesAgo(20), isFromMe: true, senderName: 'You',
    reactionList: [], _status: 'sent'
  }
];

export const blockedUsers = [
  { id: 'blk-1', display_name: 'Spam Account', avatar_url: '' },
  { id: 'blk-2', display_name: 'Another Blocked Person With A Long Name', avatar_url: '' }
];

// Pending invitations for the contacts hub. Two entries so the accept/decline
// pair can be measured stacked, which is where it wraps on a narrow phone.
export const contactRequests = [
  {
    id: 'req-1',
    status: 'pending',
    requester: { id: 'req-user-1', display_name: 'Julian Vance', avatar_url: '', virtual_number: '8829104432' }
  },
  {
    id: 'req-2',
    status: 'pending',
    requester: { id: 'req-user-2', display_name: 'Elena Voss', avatar_url: '', virtual_number: '1022934459' }
  }
];

export const privacyDefaults = {
  last_seen: true, online: true, read_receipts: false,
  status: 'selected', status_members: [OTHER_ID]
};

export const noop = () => {};
export const asyncNoop = async () => {};

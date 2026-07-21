/**
 * Attachment helpers shared by the composer, the message bubbles and the
 * details sidebar so every surface labels a file the same way.
 */

const EXTENSION_KINDS = [
  [/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)(?:[?#]|$)/i, 'image'],
  [/\.(mp4|webm|mov|m4v|avi|mkv)(?:[?#]|$)/i, 'video'],
  [/\.(mp3|wav|ogg|m4a|aac|flac|opus)(?:[?#]|$)/i, 'audio'],
  [/\.pdf(?:[?#]|$)/i, 'file']
];

const FILE_TYPE_LABELS = {
  'application/pdf': 'PDF document',
  'application/zip': 'ZIP archive',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.ms-excel': 'Excel spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel spreadsheet',
  'application/vnd.ms-powerpoint': 'PowerPoint slides',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint slides',
  'text/plain': 'Text file',
  'text/csv': 'CSV file'
};

const EXPIRED_LABELS = {
  image: 'Image deleted after download',
  video: 'Video deleted after download',
  audio: 'Audio deleted after download',
  voice_note: 'Audio deleted after download',
  file: 'File deleted after download'
};

/** Human readable size, e.g. "1.4 MB". */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!value || Number.isNaN(value) || value < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Normalises a message/file into 'image' | 'video' | 'audio' | 'voice_note' | 'file'. */
export function resolveAttachmentKind({ messageType, mimeType, name, url } = {}) {
  if (messageType === 'voice_note') return 'voice_note';
  if (['image', 'video', 'audio', 'file'].includes(messageType)) return messageType;
  const mime = mimeType || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime) return 'file';
  const haystack = `${name || ''} ${url || ''}`;
  const match = EXTENSION_KINDS.find(([pattern]) => pattern.test(haystack));
  return match ? match[1] : 'file';
}

/** Short type caption shown under the file name, e.g. "JPG image". */
export function describeAttachmentType(mimeType, name, kind) {
  if (mimeType && FILE_TYPE_LABELS[mimeType]) return FILE_TYPE_LABELS[mimeType];
  const extension = (name || '').split('.').pop();
  const shortExtension = extension && extension.length <= 5 && !extension.includes(' ')
    ? extension.toUpperCase()
    : '';
  const resolvedKind = kind || resolveAttachmentKind({ mimeType, name });
  const noun = resolvedKind === 'voice_note' ? 'voice note'
    : resolvedKind === 'file' ? 'file'
      : resolvedKind;
  return shortExtension ? `${shortExtension} ${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1);
}

/** Status copy that replaces an attachment once the receiver has downloaded it. */
export function expiredAttachmentLabel(kind) {
  return EXPIRED_LABELS[kind] || EXPIRED_LABELS.file;
}

/** True when the message once carried media that has since been downloaded away. */
export function isExpiredAttachmentMessage(message) {
  return Boolean(message?.attachment_consumed_at && !message?.attachment_url);
}

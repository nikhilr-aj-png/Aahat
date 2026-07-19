import { supabase } from '../supabase';

export const R2_MEDIA_LIMITS = Object.freeze({
  image: 2 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  document: 20 * 1024 * 1024,
});

const signedUrlCache = new Map();

const categoryFor = mimeType => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'document';
};

const invokeR2 = async body => {
  const { data, error } = await supabase.functions.invoke('r2-media', { body });
  if (error) throw new Error(error.message || 'Private media service is unavailable.');
  if (data?.error) throw new Error(data.error);
  return data;
};

export async function uploadChatMediaToR2(file, conversationId) {
  if (!file || !conversationId) throw new Error('Select a conversation before uploading media.');
  const category = categoryFor(file.type);
  const limit = R2_MEDIA_LIMITS[category];
  if (!file.type || file.size <= 0 || file.size > limit) {
    throw new Error(`${category[0].toUpperCase()}${category.slice(1)} uploads must be ${Math.round(limit / 1024 / 1024)}MB or smaller.`);
  }

  const upload = await invokeR2({
    action: 'create-upload',
    conversationId,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status}).`);

  const finalized = await invokeR2({
    action: 'finalize-upload',
    conversationId,
    objectKey: upload.objectKey,
    contentType: file.type,
    size: file.size,
  });
  return {
    objectKey: finalized.objectKey,
    provider: 'r2',
    url: finalized.downloadUrl,
    verifiedAt: finalized.verifiedAt,
  };
}

export async function hydrateR2MediaUrls(rows) {
  const r2Rows = (rows || []).filter(row => row.attachment_provider === 'r2' && row.attachment_object_key && row.id);
  if (!r2Rows.length) return rows || [];
  try {
    const now = Date.now();
    const missing = r2Rows.filter(row => (signedUrlCache.get(row.id)?.expiresAt || 0) < now + 30_000);
    if (missing.length) {
      const data = await invokeR2({ action: 'sign-downloads', messageIds: missing.map(row => row.id) });
      const expiresAt = now + Math.max(60, Number(data.expiresIn || 300)) * 1000;
      Object.entries(data.urls || {}).forEach(([messageId, url]) => signedUrlCache.set(messageId, { url, expiresAt }));
    }
    return (rows || []).map(row => {
      const signed = signedUrlCache.get(row.id);
      return signed?.url
        ? { ...row, attachment_url: signed.url, attachment_url_expires_at: signed.expiresAt }
        : row;
    });
  } catch (error) {
    console.warn('Private media URLs could not be refreshed:', error.message);
    return rows || [];
  }
}

export const CHAT_MEDIA_LIMITS = Object.freeze({
  imageInputBytes: 5 * 1024 * 1024,
  imageOutputBytes: 1 * 1024 * 1024,
  videoInputBytes: 50 * 1024 * 1024,
  videoOutputBytes: 25 * 1024 * 1024,
  videoDurationSeconds: 180,
  pdfBytes: 10 * 1024 * 1024
});

const mb = bytes => `${Math.round(bytes / (1024 * 1024))}MB`;
const jpegName = name => `${(name || 'photo').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-') || 'photo'}.jpg`;

const canvasBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not compress this image.')), 'image/jpeg', quality);
});

export async function compressImageForChat(file) {
  if (file.size > CHAT_MEDIA_LIMITS.imageInputBytes) {
    throw new Error(`Photo is too large. Select a photo up to ${mb(CHAT_MEDIA_LIMITS.imageInputBytes)}.`);
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This photo could not be decoded. Choose a JPEG, PNG or WebP image.');
  }

  const maxDimension = 1600;
  let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));
  let quality = 0.78;
  let blob;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await canvasBlob(canvas, quality);
    if (blob.size <= CHAT_MEDIA_LIMITS.imageOutputBytes) break;
    quality = Math.max(0.42, quality - 0.08);
    if (quality <= 0.5) {
      width = Math.max(480, Math.round(width * 0.84));
      height = Math.max(480, Math.round(height * 0.84));
    }
  }
  bitmap.close?.();

  if (!blob || blob.size > CHAT_MEDIA_LIMITS.imageOutputBytes) {
    throw new Error(`Photo could not be compressed below ${mb(CHAT_MEDIA_LIMITS.imageOutputBytes)}. Choose a smaller photo.`);
  }
  return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
}

const supportedVideoMimeType = () => [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
].find(type => window.MediaRecorder?.isTypeSupported?.(type)) || '';

export async function compressVideoForChat(file, onProgress = () => {}) {
  if (file.size > CHAT_MEDIA_LIMITS.videoInputBytes) {
    throw new Error(`Video is too large. Select a video up to ${mb(CHAT_MEDIA_LIMITS.videoInputBytes)}.`);
  }

  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.preload = 'metadata';
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(video);

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('This video could not be opened.'));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This video has an invalid duration.');
    if (video.duration > CHAT_MEDIA_LIMITS.videoDurationSeconds) {
      throw new Error(`Video is too long. Maximum duration is ${CHAT_MEDIA_LIMITS.videoDurationSeconds / 60} minutes.`);
    }

    const capture = video.captureStream || video.mozCaptureStream;
    const mimeType = supportedVideoMimeType();
    if (!capture || !mimeType) {
      if (file.size <= CHAT_MEDIA_LIMITS.videoOutputBytes) return file;
      throw new Error(`This browser cannot compress video. Select a video under ${mb(CHAT_MEDIA_LIMITS.videoOutputBytes)} or use a supported browser.`);
    }

    const stream = capture.call(video);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 900_000,
      audioBitsPerSecond: 64_000
    });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    const completed = new Promise((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Video compression failed.'));
      recorder.onstop = resolve;
    });
    const progress = window.setInterval(() => {
      onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
    }, 300);
    recorder.start(1000);
    await video.play();
    await new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error('Video compression playback failed.'));
    });
    recorder.stop();
    await completed;
    window.clearInterval(progress);
    onProgress(100);

    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    if (!blob.size || blob.size >= file.size) return file;
    if (blob.size > CHAT_MEDIA_LIMITS.videoOutputBytes) {
      throw new Error(`Compressed video is still above ${mb(CHAT_MEDIA_LIMITS.videoOutputBytes)}. Choose a shorter video.`);
    }
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'video'}.webm`, {
      type: 'video/webm', lastModified: Date.now()
    });
  } finally {
    video.pause();
    video.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareChatMedia(file, onProgress) {
  if (!file) throw new Error('No file selected.');
  if (file.type.startsWith('image/')) return compressImageForChat(file);
  if (file.type.startsWith('video/')) return compressVideoForChat(file, onProgress);
  if (file.type === 'application/pdf') {
    if (file.size > CHAT_MEDIA_LIMITS.pdfBytes) throw new Error(`PDF is too large. Maximum size is ${mb(CHAT_MEDIA_LIMITS.pdfBytes)}.`);
    return file;
  }
  throw new Error('Only photos, videos and PDF files can be attached here.');
}

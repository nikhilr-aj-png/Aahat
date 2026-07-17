import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';

const PREVIEW_SIZE = 280;
const OUTPUT_SIZE = 512;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function AvatarCropModal({ file, busy, onCancel, onSave }) {
  const [imageSize, setImageSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  const geometry = useMemo(() => {
    if (!imageSize) return null;
    const baseScale = Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height);
    const scale = baseScale * zoom;
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    return {
      scale,
      width,
      height,
      maxX: Math.max(0, (width - PREVIEW_SIZE) / 2),
      maxY: Math.max(0, (height - PREVIEW_SIZE) / 2)
    };
  }, [imageSize, zoom]);

  const clampOffset = useCallback((next, currentGeometry = geometry) => {
    if (!currentGeometry) return { x: 0, y: 0 };
    return {
      x: clamp(next.x, -currentGeometry.maxX, currentGeometry.maxX),
      y: clamp(next.y, -currentGeometry.maxY, currentGeometry.maxY)
    };
  }, [geometry]);

  const changeZoom = nextZoom => {
    const value = clamp(Number(nextZoom), 1, 3);
    if (!imageSize) return setZoom(value);
    const baseScale = Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height);
    const nextGeometry = {
      maxX: Math.max(0, (imageSize.width * baseScale * value - PREVIEW_SIZE) / 2),
      maxY: Math.max(0, (imageSize.height * baseScale * value - PREVIEW_SIZE) / 2)
    };
    setZoom(value);
    setOffset(current => clampOffset(current, nextGeometry));
  };

  const onPointerDown = event => {
    if (!geometry) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
  };

  const onPointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(clampOffset({
      x: drag.offset.x + event.clientX - drag.x,
      y: drag.offset.y + event.clientY - drag.y
    }));
  };

  const stopDragging = event => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const saveCrop = async () => {
    if (!geometry || !imageRef.current || busy) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    const sourceSize = PREVIEW_SIZE / geometry.scale;
    const imageLeft = (PREVIEW_SIZE - geometry.width) / 2 + offset.x;
    const imageTop = (PREVIEW_SIZE - geometry.height) / 2 + offset.y;
    const sourceX = -imageLeft / geometry.scale;
    const sourceY = -imageTop / geometry.scale;
    context.drawImage(imageRef.current, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Could not prepare the cropped photo.');
    await onSave(blob);
  };

  return (
    <div className="crop-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <div className="crop-modal-container">
        <header className="crop-modal-header">
          <h4 id="avatar-crop-title">Adjust profile photo</h4>
          <button type="button" className="crop-modal-close" onClick={onCancel} disabled={busy} aria-label="Close"><X size={18}/></button>
        </header>
        <div className="crop-modal-body">
          <div className="crop-preview-area" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}>
            {objectUrl && (
              <img
                ref={imageRef}
                src={objectUrl}
                alt="Crop preview"
                draggable="false"
                className="crop-preview-image"
                onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={geometry ? {
                  width: geometry.width,
                  height: geometry.height,
                  opacity: 1,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
                } : undefined}
              />
            )}
            <div className="crop-circle-overlay"/>
          </div>
          <p className="crop-help">Drag the photo and zoom until the circle shows exactly what you want.</p>
          <div className="crop-zoom-container">
            <Minus size={16}/>
            <input className="crop-zoom-slider" type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => changeZoom(event.target.value)} aria-label="Photo zoom"/>
            <Plus size={16}/>
          </div>
        </div>
        <footer className="crop-modal-footer">
          <button type="button" className="crop-button secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="crop-button primary" onClick={saveCrop} disabled={!geometry || busy}>{busy ? 'Saving…' : 'Save photo'}</button>
        </footer>
      </div>
    </div>
  );
}

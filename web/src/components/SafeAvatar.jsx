import React, { useState } from 'react';

/**
 * SafeAvatar — An elegant avatar component that gracefully falls back to the
 * name's initials if the avatar URL is empty or fails to load (404/broken).
 */
export default function SafeAvatar({ src, name, size = 36, className = '', style = {} }) {
  const [hasError, setHasError] = useState(false);

  const initials = name ? name.replace(' (You)', '')[0]?.toUpperCase() : '?';

  // Handle source updates dynamically (e.g. when cropping a new avatar)
  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid rgba(134, 89, 241, 0.34)',
          ...style
        }}
        onError={() => setHasError(true)}
      />
    );
  }

  // Fallback to initials
  return (
    <div
      className={className || 'user-avatar'}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(11, size * 0.38)}px`,
        borderRadius: '50%',
        background: 'var(--accent-gradient)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        border: '2px solid rgba(134, 89, 241, 0.34)',
        textTransform: 'uppercase',
        userSelect: 'none',
        flexShrink: 0,
        ...style
      }}
    >
      {initials}
    </div>
  );
}

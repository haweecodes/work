import type { CSSProperties } from 'react';

interface Props {
  src?: string | null;
  name?: string | null;
  size?: number;
  statusEmoji?: string | null;
  statusText?: string | null;
  className?: string;
  style?: CSSProperties;
}

export default function UserAvatar({ src, name, size = 22, statusEmoji, statusText, className, style }: Props) {
  const badgeSize = Math.max(10, Math.round(size * 0.42));
  // Center the badge on the avatar circle's bottom-right arc (45° point).
  // Half inside, half outside — the classic status badge look.
  const badgeOffset = -Math.round(badgeSize * 0.28);
  const showBadge = !!statusEmoji && size >= 18;

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexShrink: 0,
        width: size,
        height: size,
        verticalAlign: 'middle',
        ...style,
      }}
      title={statusEmoji && statusText ? `${statusEmoji} ${statusText}` : statusText || undefined}
    >
      <img
        src={src ?? undefined}
        alt={name ?? ''}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
      {showBadge && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: badgeOffset,
            right: badgeOffset,
            width: badgeSize,
            height: badgeSize,
            borderRadius: '50%',
            background: 'var(--paper, #fff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(badgeSize * 0.8),
            lineHeight: 1,
            boxShadow: '0 0 0 1.5px var(--paper, #fff)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {statusEmoji}
        </span>
      )}
    </span>
  );
}

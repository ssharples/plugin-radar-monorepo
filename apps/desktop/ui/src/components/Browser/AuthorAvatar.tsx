import { useMemo } from 'react';

interface AuthorAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: number;
  onClick?: () => void;
}

export function AuthorAvatar({ name, avatarUrl, size = 24, onClick }: AuthorAvatarProps) {
  const initials = useMemo(() => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [name]);

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.4,
    fontWeight: 700,
    color: '#ffffff',
    flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
    overflow: 'hidden',
  };

  if (avatarUrl) {
    return (
      <div style={style} onClick={onClick} title={name}>
        <img
          src={avatarUrl}
          alt={name || 'Author'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...style,
        background: 'linear-gradient(135deg, #89572a, #c9944a)',
      }}
      onClick={onClick}
      title={name}
    >
      {initials}
    </div>
  );
}

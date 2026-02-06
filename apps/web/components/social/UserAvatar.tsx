"use client";

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: "sm" | "md" | "lg";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

const sizeMap = {
  sm: { px: 32, className: "w-8 h-8 text-xs" },
  md: { px: 40, className: "w-10 h-10 text-sm" },
  lg: { px: 56, className: "w-14 h-14 text-lg" },
};

export function UserAvatar({ name, avatarUrl, size = "md" }: UserAvatarProps) {
  const { px, className } = sizeMap[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "User avatar"}
        width={px}
        height={px}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  const initials = name ? getInitials(name) : "?";

  return (
    <div
      className={`rounded-full bg-amber-500/20 text-amber-400 font-semibold flex items-center justify-center shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}

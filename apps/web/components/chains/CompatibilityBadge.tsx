"use client";

export function CompatibilityBadge({ percentage }: { percentage: number }) {
  const size = 32;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage >= 80
      ? "text-emerald-400"
      : percentage >= 60
        ? "text-amber-400"
        : percentage >= 40
          ? "text-orange-400"
          : "text-red-400";

  const strokeColor =
    percentage >= 80
      ? "#34d399"
      : percentage >= 60
        ? "#c9944a"
        : percentage >= 40
          ? "#a06830"
          : "#f87171";

  return (
    <div className="flex items-center gap-1.5" title={`${percentage}% compatible`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-xs font-mono font-medium ${color}`}>
        {percentage}%
      </span>
    </div>
  );
}

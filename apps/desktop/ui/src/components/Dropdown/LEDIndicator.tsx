interface LEDIndicatorProps {
  color: 'green' | 'amber' | 'off';
  pulse?: boolean;
  className?: string;
}

export function LEDIndicator({ color, pulse = false, className = '' }: LEDIndicatorProps) {
  const colorClasses = {
    green: 'bg-plugin-success',
    amber: 'bg-plugin-warning',
    off: 'bg-plugin-dim opacity-30',
  };

  const glowClasses = {
    green: 'shadow-[0_0_6px_currentColor] text-plugin-success',
    amber: 'shadow-[0_0_6px_currentColor] text-plugin-warning',
    off: '',
  };

  return (
    <div
      className={`
        w-1.5 h-1.5 rounded-full
        ${colorClasses[color]}
        ${color !== 'off' ? glowClasses[color] : ''}
        ${pulse && color !== 'off' ? 'animate-pulse-soft' : ''}
        ${className}
      `}
    />
  );
}

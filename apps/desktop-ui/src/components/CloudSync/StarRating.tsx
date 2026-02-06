import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  count?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: 'sm' | 'md';
}

function StarIcon({ filled, half, className }: { filled: boolean; half?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {half ? (
        <>
          <defs>
            <linearGradient id="halfStar">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path
            d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 13.88 5.06 16.7l.94-5.49-4-3.9 5.53-.8L10 1.5z"
            fill="url(#halfStar)"
            stroke="currentColor"
            strokeWidth="1"
          />
        </>
      ) : (
        <path
          d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 13.88 5.06 16.7l.94-5.49-4-3.9 5.53-.8L10 1.5z"
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1"
        />
      )}
    </svg>
  );
}

export function StarRating({ rating, count, interactive = false, onRate, size = 'md' }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = hoverRating || rating;
  const starSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => interactive && setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= Math.floor(displayRating);
          const half = !filled && star === Math.ceil(displayRating) && displayRating % 1 >= 0.3;

          return (
            <button
              key={star}
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onRate?.(star)}
              onMouseEnter={() => interactive && setHoverRating(star)}
              className={`${
                interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'
              } transition-transform ${
                filled || half ? 'text-yellow-400' : 'text-plugin-dim'
              } ${starSize}`}
            >
              <StarIcon filled={filled} half={half} className="w-full h-full" />
            </button>
          );
        })}
      </div>
      {typeof count === 'number' && (
        <span className="text-plugin-muted text-xs">
          {rating > 0 ? rating.toFixed(1) : '--'} ({count})
        </span>
      )}
    </div>
  );
}

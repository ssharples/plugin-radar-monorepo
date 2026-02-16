import { Star } from 'lucide-react';

interface LeftToolbarProps {
  galaxyActive: boolean;
  onToggleGalaxy: () => void;
}

export function LeftToolbar({ galaxyActive, onToggleGalaxy }: LeftToolbarProps) {
  return (
    <div className="flex flex-col items-center justify-end w-10 py-2 flex-shrink-0"
         style={{ background: 'rgba(10,10,10,0.6)' }}>
      <button
        onClick={onToggleGalaxy}
        className={`p-1.5 rounded transition-colors ${
          galaxyActive
            ? 'text-[#deff0a] bg-white/10'
            : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
        }`}
        title="Galaxy Visualizer"
      >
        <Star size={18} fill={galaxyActive ? '#deff0a' : 'none'} />
      </button>
    </div>
  );
}

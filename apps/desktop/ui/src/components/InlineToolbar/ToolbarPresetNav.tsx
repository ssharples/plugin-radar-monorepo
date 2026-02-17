import { usePresetStore } from '../../stores/presetStore';

interface ToolbarPresetNavProps {
  onSave?: () => void;
}

export function ToolbarPresetNav({ onSave }: ToolbarPresetNavProps) {
  const currentPreset = usePresetStore(s => s.currentPreset);
  const presets = usePresetStore(s => s.presets);
  const { loadPreset, savePreset } = usePresetStore.getState();

  const currentIndex = currentPreset
    ? presets.findIndex(p => p.path === currentPreset.path)
    : -1;

  const handlePrev = () => {
    if (presets.length === 0) return;
    const idx = currentIndex <= 0 ? presets.length - 1 : currentIndex - 1;
    loadPreset(presets[idx].path);
  };

  const handleNext = () => {
    if (presets.length === 0) return;
    const idx = currentIndex >= presets.length - 1 ? 0 : currentIndex + 1;
    loadPreset(presets[idx].path);
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
    } else {
      savePreset(currentPreset?.name || 'Untitled');
    }
  };

  const presetName = currentPreset?.name || 'No Preset';

  return (
    <div className="flex items-center gap-0.5">
      {/* Prev */}
      <button
        onClick={handlePrev}
        className="w-5 h-5 flex items-center justify-center text-white hover:text-plugin-accent rounded hover:bg-white/5 transition-colors"
        title="Previous preset"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M5.5 1L2.5 4L5.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Preset name */}
      <span
        className="text-[9px] font-mono text-white truncate max-w-[80px] px-1"
        title={presetName}
      >
        {presetName}
      </span>

      {/* Next */}
      <button
        onClick={handleNext}
        className="w-5 h-5 flex items-center justify-center text-white hover:text-plugin-accent rounded hover:bg-white/5 transition-colors"
        title="Next preset"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2.5 1L5.5 4L2.5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-5 h-5 flex items-center justify-center text-white hover:text-plugin-accent rounded hover:bg-white/5 transition-colors ml-0.5"
        title="Save preset"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M7 3V7.5H2V1.5H5.5L7 3Z" stroke="currentColor" strokeWidth="0.8" fill="none" />
          <rect x="3" y="5" width="3" height="1.5" rx="0.3" fill="currentColor" opacity="0.5" />
        </svg>
      </button>
    </div>
  );
}

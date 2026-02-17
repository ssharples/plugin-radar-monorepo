import { create } from 'zustand';
import { juceBridge } from '../api/juce-bridge';

// ============================================
// Panel Types
// ============================================

export type PanelId = 'parameters' | 'presets' | 'routing' | 'chain-overview';

export type PanelPosition = 'right' | 'bottom';

export interface PanelConfig {
  id: PanelId;
  title: string;
  position: PanelPosition;
  /** Default width when opening from the right */
  defaultWidth: number;
  /** Default height when opening from the bottom */
  defaultHeight: number;
  /** Minimum width */
  minWidth: number;
  /** Minimum height */
  minHeight: number;
}

export const PANEL_CONFIGS: Record<PanelId, PanelConfig> = {
  parameters: {
    id: 'parameters',
    title: 'Parameters',
    position: 'right',
    defaultWidth: 280,
    defaultHeight: 300,
    minWidth: 220,
    minHeight: 200,
  },
  presets: {
    id: 'presets',
    title: 'Presets',
    position: 'right',
    defaultWidth: 260,
    defaultHeight: 300,
    minWidth: 200,
    minHeight: 200,
  },
  routing: {
    id: 'routing',
    title: 'Routing',
    position: 'bottom',
    defaultWidth: 400,
    defaultHeight: 180,
    minWidth: 300,
    minHeight: 120,
  },
  'chain-overview': {
    id: 'chain-overview',
    title: 'Chain',
    position: 'bottom',
    defaultWidth: 400,
    defaultHeight: 160,
    minWidth: 300,
    minHeight: 100,
  },
};

// ============================================
// Store State
// ============================================

interface PanelSize {
  width: number;
  height: number;
}

interface PanelStoreState {
  /** Currently open panel IDs (only one at a time) */
  openPanels: PanelId[];
  /** Custom sizes per panel (overrides defaults) */
  panelSizes: Record<string, PanelSize>;
  /** Panel currently playing its closing animation */
  closingPanel: PanelId | null;
  /** Extra toolbar height above the base 44px (when toolbar expands to Level 2/3) */
  toolbarExtraHeight: number;
}

interface PanelStoreActions {
  openPanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  setPanelSize: (id: PanelId, size: Partial<PanelSize>) => void;
  closeAllPanels: () => void;
  setToolbarExtraHeight: (height: number) => void;
  /** Mark closing animation as finished, actually remove the panel */
  finishClosing: () => void;
}

export const usePanelStore = create<PanelStoreState & PanelStoreActions>((set, get) => ({
  openPanels: [],
  panelSizes: {},
  closingPanel: null,
  toolbarExtraHeight: 0,

  openPanel: (id) => {
    const { openPanels } = get();
    // If already open, no-op
    if (openPanels.includes(id)) return;
    // Close all other panels, then open this one (single panel at a time)
    set({ openPanels: [id], closingPanel: null });
  },

  closePanel: (id) => {
    const { openPanels } = get();
    if (!openPanels.includes(id)) return;
    // Start closing animation
    set({ closingPanel: id });
  },

  togglePanel: (id) => {
    const { openPanels } = get();
    if (openPanels.includes(id)) {
      // Close it (with animation)
      get().closePanel(id);
    } else {
      // Open it
      get().openPanel(id);
    }
  },

  setPanelSize: (id, size) => {
    const { panelSizes } = get();
    const config = PANEL_CONFIGS[id];
    const current = panelSizes[id] ?? { width: config.defaultWidth, height: config.defaultHeight };
    set({
      panelSizes: {
        ...panelSizes,
        [id]: {
          width: size.width ?? current.width,
          height: size.height ?? current.height,
        },
      },
    });
  },

  setToolbarExtraHeight: (height) => {
    set({ toolbarExtraHeight: Math.max(0, height) });
  },

  closeAllPanels: () => {
    set({ openPanels: [], closingPanel: null });
  },

  finishClosing: () => {
    const { closingPanel, openPanels } = get();
    if (!closingPanel) return;
    set({
      openPanels: openPanels.filter(p => p !== closingPanel),
      closingPanel: null,
    });
  },
}));

// ============================================
// Sync panel dimensions to C++ for window resize
// ============================================

function syncPanelLayoutToNative() {
  const { openPanels, closingPanel, panelSizes, toolbarExtraHeight } = usePanelStore.getState();

  // Calculate total right panel width and bottom panel height
  let totalRightWidth = 0;
  let totalBottomHeight = 0;

  for (const id of openPanels) {
    // Skip panel that is closing — it's animating out
    if (id === closingPanel) continue;

    const config = PANEL_CONFIGS[id];
    const size = panelSizes[id] ?? { width: config.defaultWidth, height: config.defaultHeight };

    if (config.position === 'right') {
      totalRightWidth += size.width;
    } else if (config.position === 'bottom') {
      totalBottomHeight += size.height;
    }
  }

  // Include toolbar expansion height (extra height above the base 44px)
  totalBottomHeight += toolbarExtraHeight;

  // Tell C++ to resize the window
  juceBridge.setPanelLayout(totalRightWidth, totalBottomHeight).catch(() => {});
}

// Subscribe to all state changes and sync to C++
usePanelStore.subscribe(syncPanelLayoutToNative);

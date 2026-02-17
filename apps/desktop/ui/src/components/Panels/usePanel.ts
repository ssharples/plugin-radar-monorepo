import { useCallback } from 'react';
import { usePanelStore, type PanelId, PANEL_CONFIGS } from '../../stores/panelStore';

export function usePanel() {
  const openPanels = usePanelStore(s => s.openPanels);
  const panelSizes = usePanelStore(s => s.panelSizes);
  const closingPanel = usePanelStore(s => s.closingPanel);

  const openPanel = usePanelStore(s => s.openPanel);
  const closePanel = usePanelStore(s => s.closePanel);
  const togglePanel = usePanelStore(s => s.togglePanel);
  const setPanelSize = usePanelStore(s => s.setPanelSize);
  const closeAllPanels = usePanelStore(s => s.closeAllPanels);
  const finishClosing = usePanelStore(s => s.finishClosing);

  const isPanelOpen = useCallback(
    (id: PanelId) => openPanels.includes(id),
    [openPanels]
  );

  const getPanelSize = useCallback(
    (id: PanelId) => {
      const config = PANEL_CONFIGS[id];
      return panelSizes[id] ?? { width: config.defaultWidth, height: config.defaultHeight };
    },
    [panelSizes]
  );

  /** Get all visible panels for a given position */
  const getVisiblePanels = useCallback(
    (position: 'right' | 'bottom') =>
      openPanels
        .filter(id => PANEL_CONFIGS[id].position === position),
    [openPanels]
  );

  return {
    openPanel,
    closePanel,
    togglePanel,
    setPanelSize,
    closeAllPanels,
    isPanelOpen,
    getPanelSize,
    getVisiblePanels,
    openPanels,
    closingPanel,
    finishClosing,
  };
}

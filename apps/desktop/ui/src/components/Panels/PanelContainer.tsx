import { type ReactNode } from 'react';
import { usePanel } from './usePanel';
import { Panel } from './Panel';
import { ParameterPanel } from './ParameterPanel';
import { PresetBrowserPanel } from './PresetBrowserPanel';
import { RoutingPanel } from './RoutingPanel';
import { ChainOverviewPanel } from './ChainOverviewPanel';

const PANEL_COMPONENTS: Record<string, () => ReactNode> = {
  parameters: () => <ParameterPanel />,
  presets: () => <PresetBrowserPanel />,
  routing: () => <RoutingPanel />,
  'chain-overview': () => <ChainOverviewPanel />,
};

interface PanelContainerProps {
  /** The main content (plugin editor area) */
  children: ReactNode;
}

/**
 * PanelContainer wraps the main editor area and manages panel layout.
 * Right panels appear to the right of the main content.
 * Bottom panels appear below the main content.
 * Only one panel is open at a time.
 */
export function PanelContainer({ children }: PanelContainerProps) {
  const { getVisiblePanels, getPanelSize } = usePanel();

  const rightPanels = getVisiblePanels('right');
  const bottomPanels = getVisiblePanels('bottom');

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Main row: content + right panels */}
      <div className="flex flex-1 min-h-0">
        {/* Main content area */}
        <div className="flex-1 min-w-0 min-h-0">
          {children}
        </div>

        {/* Right-side panels */}
        {rightPanels.map(id => (
          <div
            key={id}
            className="shrink-0"
            style={{
              width: getPanelSize(id).width,
            }}
          >
            <Panel id={id}>
              {PANEL_COMPONENTS[id]?.()}
            </Panel>
          </div>
        ))}
      </div>

      {/* Bottom panels */}
      {bottomPanels.length > 0 && (
        <div className="flex shrink-0 border-t border-white/5">
          {bottomPanels.map(id => (
            <div key={id} className="flex-1 min-w-0">
              <Panel id={id}>
                {PANEL_COMPONENTS[id]?.()}
              </Panel>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

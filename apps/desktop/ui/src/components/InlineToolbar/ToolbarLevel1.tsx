import { useMemo } from 'react';
import { ArrowLeftRight, AudioLines } from 'lucide-react';
import { useChainStore, useChainActions } from '../../stores/chainStore';
import { usePanelStore, type PanelId } from '../../stores/panelStore';
import { ProPresetsIcon, ProRoutingIcon, ProOverviewIcon } from '../InlineEditorSidebarIcons';
import { isNodeInParallelGroup } from '../../utils/chainHelpers';
import type { PluginNodeUI } from '../../api/types';

interface ToolbarLevel1Props {
  node: PluginNodeUI;
}

const NEON = 'var(--color-accent-cyan)';

type ToolbarActionId = PanelId | 'browser';

const PANEL_BTNS: { id: ToolbarActionId; icon: React.FC<React.SVGProps<SVGSVGElement>>; title: string }[] = [
  { id: 'browser', icon: ProPresetsIcon, title: 'Chain & Plugin Browser' },
  { id: 'routing', icon: ProRoutingIcon, title: 'Routing' },
  { id: 'chain-overview', icon: ProOverviewIcon, title: 'Chain Overview' },
];

export function ToolbarLevel1({ node }: ToolbarLevel1Props) {
  const { toggleNodeBypass, showSearchOverlay, setNodeDucking } = useChainActions();
  const nodes = useChainStore(s => s.nodes);
  const openPanels = usePanelStore(s => s.openPanels);
  const togglePanel = usePanelStore(s => s.togglePanel);
  const closeAllPanels = usePanelStore(s => s.closeAllPanels);

  const inParallel = useMemo(() => isNodeInParallelGroup(nodes, node.id), [nodes, node.id]);

  return (
    <div className="flex items-center gap-1.5 h-full px-2">
      {/* Bypass toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleNodeBypass(node.id); }}
        className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors"
        style={{
          background: node.bypassed ? 'rgba(255,255,255,0.05)' : 'rgba(222, 255, 10, 0.15)',
          border: node.bypassed ? '1px solid rgba(255,255,255,0.08)' : `1px solid rgba(222, 255, 10, 0.3)`,
          color: node.bypassed ? '#555' : NEON,
        }}
        title={node.bypassed ? 'Enable plugin (B)' : 'Bypass plugin (B)'}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
          {!node.bypassed && <circle cx="5" cy="5" r="1.5" fill="currentColor" />}
        </svg>
      </button>

      {/* Duck toggle — only for plugins in parallel groups */}
      {inParallel && !node.isDryPath && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setNodeDucking(
              node.id,
              !node.duckEnabled,
              node.duckThresholdDb ?? -20,
              node.duckAttackMs ?? 5,
              node.duckReleaseMs ?? 200,
            );
          }}
          className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: node.duckEnabled ? 'rgba(0, 200, 255, 0.15)' : 'rgba(255,255,255,0.05)',
            border: node.duckEnabled ? '1px solid rgba(0, 200, 255, 0.3)' : '1px solid rgba(255,255,255,0.08)',
            color: node.duckEnabled ? NEON : '#555',
          }}
          title={node.duckEnabled ? 'Disable ducking' : 'Enable ducking'}
        >
          <AudioLines size={12} />
        </button>
      )}

      {/* Plugin name */}
      <span className="text-[11px] text-white truncate max-w-[120px] shrink-0" title={node.name}>
        {node.name}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Divider */}
      <div className="w-px h-5 bg-white/8 shrink-0" />

      {/* Replace plugin */}
      <button
        onClick={(e) => { e.stopPropagation(); showSearchOverlay('replace'); }}
        className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors text-gray-400 hover:text-white hover:bg-white/10"
        title="Replace plugin"
      >
        <ArrowLeftRight size={12} />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-white/8 shrink-0" />

      {/* Panel toggle buttons */}
      {PANEL_BTNS.map(({ id, icon: Icon, title }) => {
        const isOpen = id !== 'browser' && openPanels.includes(id);
        return (
          <button
            key={id}
            onClick={() => {
              if (id === 'browser') {
                closeAllPanels();
                window.dispatchEvent(new Event('openPluginBrowser'));
                return;
              }
              togglePanel(id);
            }}
            className="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors"
            style={{
              background: isOpen ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
              color: isOpen ? NEON : 'rgba(255,255,255,0.4)',
              border: isOpen ? '1px solid rgba(222, 255, 10, 0.3)' : '1px solid transparent',
            }}
            title={title}
          >
            <Icon width={13} height={13} />
          </button>
        );
      })}

    </div>
  );
}

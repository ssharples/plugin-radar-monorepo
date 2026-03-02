import { ChevronDown, ChevronRight, Layers, GitBranch, X, GripVertical, Save, Plus, AudioLines, Power } from 'lucide-react';
import { useState, useCallback, memo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useChainActions } from '../../stores/chainStore';
import type { GroupNodeUI, ChainNodeUI } from '../../api/types';
import { ChainNodeList } from './ChainNodeList';
import { Slider } from '../Slider/Slider';
import { SaveGroupTemplateModal } from './SaveGroupTemplateModal';
import { InlinePluginSearch } from './InlinePluginSearch';
import { ContextMenu, buildGroupMenu } from '../ContextMenu';

interface GroupContainerProps {
  node: GroupNodeUI;
  depth: number;
  parentId: number;
  onNodeSelect?: (e: React.MouseEvent, nodeId: number) => void;
  selectedIds?: Set<number>;
  isDragActive?: boolean;
  draggedNodeId?: number | null;
  groupSelectMode?: boolean;
  /** Set of node IDs whose drop targets should be disabled (self-drop prevention) */
  disabledDropIds?: Set<number>;
  /** Map of nodeId → 1-based DFS plugin slot number */
  slotNumbers?: Map<number, number>;
  /** Whether this group is the source of the current drag (detach visual) */
  isSourceGroup?: boolean;
  /** ID of the source group for forwarding to nested ChainNodeList */
  sourceGroupId?: number | null;
  /** Whether this group is currently animating its collapse before dissolve */
  isDissolvingGroup?: boolean;
  /** ID of a group currently dissolving, forwarded to nested ChainNodeList */
  dissolvingGroupId?: number | null;
}

export const GroupContainer = memo(function GroupContainer({
  node,
  depth,
  parentId: _parentId,
  onNodeSelect,
  selectedIds,
  isDragActive = false,
  draggedNodeId = null,
  groupSelectMode = false,
  disabledDropIds,
  slotNumbers,
  isSourceGroup = false,
  sourceGroupId = null,
  isDissolvingGroup = false,
  dissolvingGroupId = null,
}: GroupContainerProps) {
  const {
    setGroupMode,
    setGroupDryWet,
    setGroupWetGain,
    setGroupDucking,
    setActiveBranch,
    dissolveGroup,
    removeNode,
    toggleGroupCollapsed,
    toggleNodeBypass,
    addDryPath,
    showInlineSearchBelow,
    _endContinuousGesture,
  } = useChainActions();

  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [duckExpanded, setDuckExpanded] = useState(false);

  const handleGroupContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGroupContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Make the group draggable
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag:${node.id}`,
    data: {
      type: 'group',
      nodeId: node.id,
      node: node,
    },
  });

  // Make the group a drop target (drop onto group = append to end)
  const {
    isOver: isGroupDropOver,
    setNodeRef: setDropRef,
  } = useDroppable({
    id: `group:${node.id}`,
    data: {
      type: 'group-target',
      groupId: node.id,
    },
    disabled: disabledDropIds?.has(node.id),
  });

  const isSerial = node.mode === 'serial';
  const isParallel = node.mode === 'parallel';
  const isMidSide = node.mode === 'midside';
  const isFXSelector = node.mode === 'fxselector';
  const childCount = countNodes(node.children);

  const activeIdx = Math.max(0, Math.min(node.activeChildIndex ?? 0, node.children.length - 1));

  // Cyber color scheme: serial=amber, parallel=cyan, midside=purple, fxselector=orange
  const groupBorderColor = isGroupDropOver && isDragActive
    ? (isParallel ? 'rgba(222, 255, 10, 0.5)' : isMidSide ? 'rgba(180, 100, 255, 0.5)' : isFXSelector ? 'rgba(255, 100, 0, 0.5)' : 'rgba(255, 170, 0, 0.5)')
    : (isParallel ? 'rgba(222, 255, 10, 0.2)' : isMidSide ? 'rgba(180, 100, 255, 0.2)' : isFXSelector ? 'rgba(255, 100, 0, 0.2)' : 'rgba(255, 170, 0, 0.2)');
  const accentColor = isParallel ? 'var(--color-accent-cyan)' : isMidSide ? '#b464ff' : isFXSelector ? '#ff6400' : 'var(--color-status-warning)';

  // For "+ BRANCH" — insert after the last child
  const handleAddBranch = useCallback(() => {
    if (node.children.length > 0) {
      const lastChild = node.children[node.children.length - 1];
      showInlineSearchBelow(lastChild.id, node.id, node.children.length);
    }
  }, [node.children, node.id, showInlineSearchBelow]);

  // Combine refs for both draggable and droppable
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  // Duck control helpers
  const handleDuckToggle = useCallback(() => {
    const newEnabled = !node.duckEnabled;
    setGroupDucking(
      node.id,
      newEnabled,
      node.duckThresholdDb ?? -20,
      node.duckAttackMs ?? 5,
      node.duckReleaseMs ?? 200
    );
  }, [node.id, node.duckEnabled, node.duckThresholdDb, node.duckAttackMs, node.duckReleaseMs, setGroupDucking]);

  const handleDuckThreshold = useCallback((v: number) => {
    setGroupDucking(node.id, node.duckEnabled, v, node.duckAttackMs ?? 5, node.duckReleaseMs ?? 200);
  }, [node.id, node.duckEnabled, node.duckAttackMs, node.duckReleaseMs, setGroupDucking]);

  const handleDuckAttack = useCallback((v: number) => {
    setGroupDucking(node.id, node.duckEnabled, node.duckThresholdDb ?? -20, v, node.duckReleaseMs ?? 200);
  }, [node.id, node.duckEnabled, node.duckThresholdDb, node.duckReleaseMs, setGroupDucking]);

  const handleDuckRelease = useCallback((v: number) => {
    setGroupDucking(node.id, node.duckEnabled, node.duckThresholdDb ?? -20, node.duckAttackMs ?? 5, v);
  }, [node.id, node.duckEnabled, node.duckThresholdDb, node.duckAttackMs, setGroupDucking]);

  return (
    <>
    <div
      ref={setRef}
      className={`
        rounded-lg dim-during-drag overflow-hidden
        ${isDragging ? 'opacity-30 scale-[0.98]' : node.bypassed ? 'opacity-50' : ''}
        ${isDragActive && !isDragging && node.id !== draggedNodeId
          ? (isGroupDropOver ? 'drop-target-active' : 'drop-target-valid')
          : ''}
        ${isDissolvingGroup ? 'animate-group-collapse' : ''}
      `}
      style={{
        position: 'relative' as const,
        zIndex: 2,
        border: isSourceGroup
          ? `1px dashed ${isParallel ? 'rgba(222, 255, 10, 0.4)' : isMidSide ? 'rgba(180, 100, 255, 0.4)' : isFXSelector ? 'rgba(255, 100, 0, 0.4)' : 'rgba(255, 170, 0, 0.4)'}`
          : `1px solid ${groupBorderColor}`,
        background: `linear-gradient(135deg, ${
          isParallel
            ? 'rgba(222, 255, 10, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(222, 255, 10, 0.03) 100%'
            : isMidSide
            ? 'rgba(180, 100, 255, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(180, 100, 255, 0.03) 100%'
            : isFXSelector
            ? 'rgba(255, 100, 0, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(255, 100, 0, 0.03) 100%'
            : 'rgba(255, 170, 0, 0.04) 0%, rgba(255,255,255,0.02) 50%, rgba(255, 170, 0, 0.03) 100%'
        })`,
        boxShadow: isGroupDropOver && isDragActive
          ? `0 0 16px ${isParallel ? 'rgba(222, 255, 10, 0.15)' : isMidSide ? 'rgba(180, 100, 255, 0.15)' : isFXSelector ? 'rgba(255, 100, 0, 0.15)' : 'rgba(255, 170, 0, 0.15)'}, inset 0 1px 0 rgba(255,255,255,0.08)`
          : '0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
        transition: 'all var(--duration-fast) var(--ease-snap)',
      }}
    >
      {/* Group Header — entire row is draggable */}
      <div
        {...dragAttributes}
        {...dragListeners}
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-grab active:cursor-grabbing"
        onContextMenu={handleGroupContextMenu}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 p-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          <GripVertical className="w-3 h-3" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleGroupCollapsed(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded"
          style={{ color: 'var(--color-text-secondary)', transition: 'all var(--duration-fast) var(--ease-snap)' }}
        >
          {node.collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {/* Group icon */}
        {isSerial ? (
          <Layers className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />
        ) : isMidSide ? (
          <AudioLines className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />
        ) : isFXSelector ? (
          <Layers className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />
        ) : (
          <GitBranch className="w-3 h-3 flex-shrink-0" style={{ color: accentColor }} />
        )}

        {/* Group name */}
        <span
          className="text-xxs font-bold truncate min-w-0"
          style={{
            fontFamily: 'var(--font-extended)',
            textTransform: 'uppercase' as const,
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--color-text-primary)',
            maxWidth: '80px',
          }}
        >
          {node.name}
        </span>

        {/* Bypass toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleNodeBypass(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-1 rounded"
          style={{
            color: node.bypassed ? 'var(--color-text-tertiary)' : accentColor,
            background: node.bypassed ? 'rgba(255, 255, 255, 0.04)' : (isParallel ? 'rgba(222, 255, 10, 0.12)' : 'rgba(255, 170, 0, 0.12)'),
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          title={node.bypassed ? 'Enable group' : 'Bypass group'}
        >
          <Power className="w-3.5 h-3.5" />
        </button>

        {/* Inline controls — compact sliders */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* FX Selector: branch nav (◄ N/total ►) */}
          {isFXSelector && node.children.length > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setActiveBranch(node.id, activeIdx - 1)}
                disabled={activeIdx === 0}
                className="px-1 py-0.5 rounded text-xxs font-bold"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: activeIdx === 0 ? 'var(--color-text-tertiary)' : '#ff6400',
                  opacity: activeIdx === 0 ? 0.3 : 1,
                  transition: 'all var(--duration-fast) var(--ease-snap)',
                }}
                title="Previous branch"
              >
                ◄
              </button>
              <span
                className="text-xxs tabular-nums"
                style={{ fontFamily: 'var(--font-mono)', color: '#ff6400', fontSize: 'var(--text-micro, 9px)', minWidth: '24px', textAlign: 'center' }}
              >
                {activeIdx + 1}/{node.children.length}
              </span>
              <button
                onClick={() => setActiveBranch(node.id, activeIdx + 1)}
                disabled={activeIdx >= node.children.length - 1}
                className="px-1 py-0.5 rounded text-xxs font-bold"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: activeIdx >= node.children.length - 1 ? 'var(--color-text-tertiary)' : '#ff6400',
                  opacity: activeIdx >= node.children.length - 1 ? 0.3 : 1,
                  transition: 'all var(--duration-fast) var(--ease-snap)',
                }}
                title="Next branch"
              >
                ►
              </button>
            </div>
          )}
          {/* Serial: Dry/Wet slider */}
          {isSerial && (
            <>
              <span
                className="text-xxs font-bold flex-shrink-0"
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 'var(--tracking-wide)',
                  color: node.dryWet < 1.0 ? accentColor : 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-micro, 9px)',
                }}
              >
                D/W
              </span>
              <Slider
                value={node.dryWet}
                min={0}
                max={1}
                step={0.01}
                color="blue"
                width="w-16"
                onChange={(v) => setGroupDryWet(node.id, v)}
                onDragEnd={_endContinuousGesture}
              />
              <span
                className="text-xxs flex-shrink-0 tabular-nums"
                style={{ fontFamily: 'var(--font-mono)', color: accentColor, fontSize: 'var(--text-micro, 9px)', width: '28px', textAlign: 'right' }}
              >
                {Math.round(node.dryWet * 100)}%
              </span>
              {/* Wet Gain — only visible when dry/wet is not fully wet */}
              {node.dryWet < 1.0 && (
                <>
                  <span
                    className="text-xxs font-bold flex-shrink-0"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--tracking-wide)',
                      color: (node.wetGainDb ?? 0) !== 0 ? '#ffb400' : 'var(--color-text-tertiary)',
                      fontSize: 'var(--text-micro, 9px)',
                      marginLeft: '4px',
                    }}
                  >
                    W.G
                  </span>
                  <Slider
                    value={node.wetGainDb ?? 0}
                    min={-24}
                    max={12}
                    step={0.5}
                    color="accent"
                    width="w-14"
                    onChange={(v) => setGroupWetGain(node.id, v)}
                    onDragEnd={_endContinuousGesture}
                    title={`Wet gain: ${(node.wetGainDb ?? 0) >= 0 ? '+' : ''}${(node.wetGainDb ?? 0).toFixed(1)} dB`}
                  />
                  <span
                    className="text-xxs flex-shrink-0 tabular-nums"
                    style={{ fontFamily: 'var(--font-mono)', color: '#ffb400', fontSize: 'var(--text-micro, 9px)', width: '28px', textAlign: 'right' }}
                  >
                    {(node.wetGainDb ?? 0) >= 0 ? '+' : ''}{(node.wetGainDb ?? 0).toFixed(1)}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Mode toggle */}
        <div
          className="flex items-center rounded overflow-hidden flex-shrink-0"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setGroupMode(node.id, 'serial')}
            className="px-1.5 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isSerial ? 'rgba(255, 170, 0, 0.15)' : 'transparent',
              color: isSerial ? 'var(--color-status-warning)' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
              fontSize: 'var(--text-micro, 9px)',
            }}
          >
            SER
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'parallel')}
            className="px-1.5 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isParallel ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
              color: isParallel ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
              fontSize: 'var(--text-micro, 9px)',
            }}
          >
            PAR
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'midside')}
            className="px-1.5 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isMidSide ? 'rgba(180, 100, 255, 0.15)' : 'transparent',
              color: isMidSide ? '#b464ff' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
              fontSize: 'var(--text-micro, 9px)',
            }}
          >
            M/S
          </button>
          <button
            onClick={() => setGroupMode(node.id, 'fxselector')}
            className="px-1.5 py-0.5 text-xxs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-wide)',
              background: isFXSelector ? 'rgba(255, 100, 0, 0.15)' : 'transparent',
              color: isFXSelector ? '#ff6400' : 'var(--color-text-tertiary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
              fontSize: 'var(--text-micro, 9px)',
            }}
          >
            FX
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowSaveTemplateModal(true)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Save group as template"
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={() => dissolveGroup(node.id)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Dissolve group (ungroup)"
          >
            <Layers className="w-3 h-3" />
          </button>
          <button
            onClick={() => removeNode(node.id)}
            className="p-0.5 rounded"
            style={{
              color: 'var(--color-text-secondary)',
              transition: 'all var(--duration-fast) var(--ease-snap)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-status-error)'; e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            title="Remove group and all contents"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {!node.collapsed && (
        <div className="px-2 pb-2 pt-1">
          {node.children.length === 0 ? (
            <EmptyGroupDropZone
              groupId={node.id}
              isParallel={isParallel}
              isDragActive={isDragActive}
            />
          ) : (
            <ChainNodeList
              nodes={node.children}
              depth={depth + 1}
              parentId={node.id}
              isParallelParent={isParallel}
              onNodeSelect={onNodeSelect}
              selectedIds={selectedIds}
              isDragActive={isDragActive}
              draggedNodeId={draggedNodeId}
              groupSelectMode={groupSelectMode}
              disabledDropIds={disabledDropIds}
              slotNumbers={slotNumbers}
              sourceGroupId={sourceGroupId}
              dissolvingGroupId={dissolvingGroupId}
            />
          )}

          {/* FX Selector footer: branch tabs + add branch */}
          {isFXSelector && (
            <div
              className="mt-1.5 px-1"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 flex-wrap">
                {node.children.map((child, i) => (
                  <button
                    key={child.id}
                    onClick={() => setActiveBranch(node.id, i)}
                    className="px-2 py-0.5 rounded text-xxs font-bold"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--tracking-wide)',
                      background: i === activeIdx ? 'rgba(255, 100, 0, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      color: i === activeIdx ? '#ff6400' : 'var(--color-text-tertiary)',
                      border: i === activeIdx ? '1px solid rgba(255, 100, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                      transition: 'all var(--duration-fast) var(--ease-snap)',
                      fontSize: 'var(--text-micro, 9px)',
                    }}
                    title={`Activate branch ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={handleAddBranch}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xxs font-bold"
                  style={{
                    letterSpacing: 'var(--tracking-wide)',
                    color: 'var(--color-text-tertiary)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    transition: 'all var(--duration-fast) var(--ease-snap)',
                    fontSize: 'var(--text-micro, 9px)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ff6400';
                    e.currentTarget.style.borderColor = 'rgba(255, 100, 0, 0.3)';
                    e.currentTarget.style.background = 'rgba(255, 100, 0, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }}
                  title="Add a new FX branch"
                >
                  <Plus className="w-3 h-3" />
                  Branch
                </button>
              </div>
            </div>
          )}

          {/* Parallel group action buttons + duck footer */}
          {isParallel && (
            <div
              className="mt-1.5 px-1"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Action buttons row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddBranch}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xxs font-bold"
                  style={{
                    letterSpacing: 'var(--tracking-wide)',
                    color: 'var(--color-text-tertiary)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    transition: 'all var(--duration-fast) var(--ease-snap)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-accent-cyan)';
                    e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
                    e.currentTarget.style.background = 'rgba(222, 255, 10, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }}
                  title="Add a new plugin branch"
                >
                  <Plus className="w-3 h-3" />
                  Branch
                </button>

                {/* Only show "Add Dry Path" if none exists yet */}
                {!node.children.some(c => c.type === 'plugin' && c.isDryPath) && (
                  <button
                    onClick={() => addDryPath(node.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xxs font-bold"
                    style={{
                      letterSpacing: 'var(--tracking-wide)',
                      color: 'var(--color-text-tertiary)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px dashed rgba(255, 255, 255, 0.1)',
                      transition: 'all var(--duration-fast) var(--ease-snap)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#5a7842';
                      e.currentTarget.style.borderColor = 'rgba(90, 120, 66, 0.4)';
                      e.currentTarget.style.background = 'rgba(90, 120, 66, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }}
                    title="Add dry signal passthrough (for parallel compression, saturation, etc.)"
                  >
                    <AudioLines className="w-3 h-3" />
                    Dry Path
                  </button>
                )}
              </div>

              {/* Duck footer — expandable */}
              <div className="mt-1.5">
                {/* Duck header row — always visible */}
                <div
                  className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer select-none"
                  style={{
                    background: node.duckEnabled ? 'rgba(222, 255, 10, 0.05)' : 'transparent',
                    transition: 'all var(--duration-fast) var(--ease-snap)',
                  }}
                  onClick={() => setDuckExpanded(!duckExpanded)}
                >
                  {/* Chevron */}
                  <ChevronRight
                    className="w-3 h-3 flex-shrink-0"
                    style={{
                      color: node.duckEnabled ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
                      transform: duckExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform var(--duration-fast) var(--ease-snap)',
                    }}
                  />
                  <span
                    className="text-xxs font-bold"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: 'var(--tracking-wide)',
                      color: node.duckEnabled ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
                      fontSize: 'var(--text-micro, 9px)',
                    }}
                  >
                    DUCK
                  </span>

                  {/* Toggle pill */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuckToggle(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex-shrink-0 rounded-full"
                    style={{
                      width: '24px',
                      height: '12px',
                      background: node.duckEnabled ? 'var(--color-accent-cyan)' : 'rgba(255, 255, 255, 0.12)',
                      position: 'relative',
                      transition: 'background var(--duration-fast) var(--ease-snap)',
                      boxShadow: node.duckEnabled ? '0 0 6px rgba(222, 255, 10, 0.4)' : 'none',
                    }}
                    title={node.duckEnabled ? 'Disable ducking' : 'Enable ducking'}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: node.duckEnabled ? '#111' : 'rgba(255, 255, 255, 0.4)',
                        position: 'absolute',
                        top: '2px',
                        left: node.duckEnabled ? '14px' : '2px',
                        transition: 'left var(--duration-fast) var(--ease-snap)',
                      }}
                    />
                  </button>

                  {/* Inline summary when collapsed */}
                  {!duckExpanded && node.duckEnabled && (
                    <span
                      className="text-xxs tabular-nums"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: 'rgba(222, 255, 10, 0.5)',
                        fontSize: 'var(--text-micro, 9px)',
                      }}
                    >
                      {Math.round(node.duckThresholdDb ?? -20)}dB
                    </span>
                  )}
                </div>

                {/* Expandable duck controls panel */}
                <div
                  style={{
                    maxHeight: duckExpanded ? '44px' : '0px',
                    overflow: 'hidden',
                    transition: 'max-height var(--duration-fast) var(--ease-snap)',
                  }}
                >
                  <div
                    className="flex items-center gap-2 px-1 py-1"
                    style={{
                      opacity: node.duckEnabled ? 1 : 0.35,
                      transition: 'opacity var(--duration-fast) var(--ease-snap)',
                      pointerEvents: node.duckEnabled ? 'auto' : 'none',
                    }}
                  >
                    {/* Threshold */}
                    <span
                      className="text-xxs font-bold flex-shrink-0"
                      style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-accent-cyan)', fontSize: 'var(--text-micro, 9px)' }}
                    >
                      THR
                    </span>
                    <Slider
                      value={node.duckThresholdDb ?? -20}
                      min={-60}
                      max={0}
                      step={0.5}
                      color="accent"
                      width="w-14"
                      onChange={handleDuckThreshold}
                      onDragEnd={_endContinuousGesture}
                    />
                    <span
                      className="text-xxs flex-shrink-0 tabular-nums"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-cyan)', fontSize: 'var(--text-micro, 9px)', width: '32px', textAlign: 'right' }}
                    >
                      {Math.round(node.duckThresholdDb ?? -20)}dB
                    </span>

                    {/* Attack */}
                    <span
                      className="text-xxs font-bold flex-shrink-0"
                      style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-micro, 9px)' }}
                    >
                      ATK
                    </span>
                    <Slider
                      value={node.duckAttackMs ?? 5}
                      min={0.1}
                      max={500}
                      step={0.5}
                      color="accent"
                      width="w-12"
                      onChange={handleDuckAttack}
                      onDragEnd={_endContinuousGesture}
                    />
                    <span
                      className="text-xxs flex-shrink-0 tabular-nums"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-micro, 9px)', width: '28px', textAlign: 'right' }}
                    >
                      {Math.round(node.duckAttackMs ?? 5)}ms
                    </span>

                    {/* Release */}
                    <span
                      className="text-xxs font-bold flex-shrink-0"
                      style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-wide)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-micro, 9px)' }}
                    >
                      REL
                    </span>
                    <Slider
                      value={node.duckReleaseMs ?? 200}
                      min={50}
                      max={5000}
                      step={10}
                      color="accent"
                      width="w-12"
                      onChange={handleDuckRelease}
                      onDragEnd={_endContinuousGesture}
                    />
                    <span
                      className="text-xxs flex-shrink-0 tabular-nums"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-micro, 9px)', width: '32px', textAlign: 'right' }}
                    >
                      {node.duckReleaseMs ?? 200}ms
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed summary */}
      {node.collapsed && (
        <div
          className="px-3 pb-2 text-xxs"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          {childCount} plugin{childCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Drop target overlay when dragging over */}
      {isGroupDropOver && isDragActive && !isDragging && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none z-10 animate-fade-in"
          style={{
            boxShadow: isParallel
              ? '0 0 0 2px rgba(222, 255, 10, 0.4)'
              : '0 0 0 2px rgba(255, 170, 0, 0.4)',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-1 rounded-b-lg"
            style={{
              background: isParallel
                ? 'rgba(222, 255, 10, 0.1)'
                : 'rgba(255, 170, 0, 0.1)',
            }}
          >
            <span
              className="text-[10px] font-bold"
              style={{
                letterSpacing: 'var(--tracking-wide)',
                color: isParallel
                  ? 'rgba(222, 255, 10, 0.7)'
                  : 'rgba(255, 170, 0, 0.7)',
              }}
            >
              Drop to add to {node.name}
            </span>
          </div>
        </div>
      )}
    </div>

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <SaveGroupTemplateModal
          groupId={node.id}
          groupName={node.name}
          onClose={() => setShowSaveTemplateModal(false)}
        />
      )}

      {/* Group Context Menu */}
      {groupContextMenu && (
        <ContextMenu
          x={groupContextMenu.x}
          y={groupContextMenu.y}
          items={buildGroupMenu(
            {
              node,
              nodeId: node.id,
              isSerial: node.mode === 'serial',
              isCollapsed: !!node.collapsed,
            },
            {
              addPlugin: handleAddBranch,
              addDryPath: isParallel ? () => addDryPath(node.id) : undefined,
              toggleBypass: () => toggleNodeBypass(node.id),
              convertToSerial: () => setGroupMode(node.id, 'serial'),
              convertToParallel: () => setGroupMode(node.id, 'parallel'),
              dissolveGroup: () => dissolveGroup(node.id),
              setDryWet: () => {}, // Controls are always visible now
              toggleCollapsed: () => toggleGroupCollapsed(node.id),
              saveAsTemplate: () => setShowSaveTemplateModal(true),
              removeGroup: () => removeNode(node.id),
            },
          )}
          onClose={() => setGroupContextMenu(null)}
        />
      )}
    </>
  );
});

/**
 * Empty group placeholder with drop target + inline search.
 */
function EmptyGroupDropZone({
  groupId,
  isParallel,
  isDragActive,
}: {
  groupId: number;
  isParallel: boolean;
  isDragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop:${groupId}:0`,
  });

  const [showSearch, setShowSearch] = useState(false);
  const accentColor = isParallel ? 'var(--color-accent-cyan)' : 'var(--color-status-warning)';

  const handleClick = () => {
    setShowSearch(true);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        onClick={handleClick}
        className="mx-1 rounded-lg flex items-center justify-center gap-2 cursor-pointer"
        style={{
          border: isOver && isDragActive
            ? `2px dashed ${accentColor}`
            : `2px dashed var(--color-border-default)`,
          background: isOver && isDragActive
            ? (isParallel ? 'rgba(222, 255, 10, 0.08)' : 'rgba(255, 170, 0, 0.08)')
            : 'transparent',
          padding: isOver && isDragActive ? '16px 0' : '12px 0',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
      >
        <span
          className="text-xs"
          style={{
            letterSpacing: 'var(--tracking-wide)',
            color: isOver && isDragActive ? accentColor : 'var(--color-text-tertiary)',
          }}
        >
          {isOver && isDragActive
            ? 'Drop plugin here'
            : 'Drop a plugin here or click to browse'
          }
        </span>
      </div>
      {showSearch && (
        <div className="mt-2">
          <InlinePluginSearch
            parentId={groupId}
            insertIndex={0}
            onPluginAdded={() => setShowSearch(false)}
            onClose={() => setShowSearch(false)}
          />
        </div>
      )}
    </>
  );
}

function countNodes(nodes: ChainNodeUI[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'plugin') count++;
    else if (node.type === 'group') count += countNodes(node.children);
  }
  return count;
}

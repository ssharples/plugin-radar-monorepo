import { useMemo } from 'react';

// --- Tree data types (from cloud JSON) ---

interface TreePlugin {
  type: 'plugin';
  slotIndex: number;
}

interface TreeBranch {
  type: 'branch';
  branchIndex: number;
  gainDb?: number;
  mute?: boolean;
  solo?: boolean;
  children: TreeNode[];
}

interface TreeGroup {
  type: 'group';
  id?: number;
  mode: 'serial' | 'parallel' | 'midside' | 'fxselector';
  dryWet?: number;
  wetGainDb?: number;
  bypassed?: boolean;
  children: TreeNode[];
}

type TreeNode = TreePlugin | TreeBranch | TreeGroup;

// --- Layout types ---

interface LayoutNode {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'plugin' | 'group';
  mode?: string;
  children?: LayoutNode[];
  // For connecting lines
  inX: number;
  inY: number;
  outX: number;
  outY: number;
}

// --- Constants ---

const SERIAL_COLOR = '#c9944a';
const PARALLEL_COLOR = '#5a7842';

const COMPACT = {
  nodeW: 6,
  nodeH: 6,
  gapX: 8,
  gapY: 6,
  padX: 4,
  padY: 3,
};

const FULL = {
  nodeW: 8,
  nodeH: 8,
  gapX: 12,
  gapY: 8,
  padX: 6,
  padY: 4,
};

// --- Props ---

interface TopologyDiagramProps {
  treeData: string;
  compact?: boolean;
}

// --- Parsing ---

function parseTree(treeData: string): TreeGroup | null {
  try {
    const parsed = JSON.parse(treeData);
    if (parsed && parsed.type === 'group') return parsed as TreeGroup;
    return null;
  } catch {
    return null;
  }
}

// --- Measure pass: compute the width/height of each node ---

interface Size { w: number; h: number }

function measureNode(node: TreeNode, s: typeof COMPACT): Size {
  if (node.type === 'plugin') {
    return { w: s.nodeW, h: s.nodeH };
  }

  const children = getChildren(node);
  if (children.length === 0) {
    return { w: s.nodeW, h: s.nodeH };
  }

  const mode = getMode(node);
  const childSizes = children.map(c => measureNode(c, s));

  if (mode === 'parallel' || mode === 'midside') {
    // Parallel: branches stack vertically, width = max child width + padding
    const maxW = Math.max(...childSizes.map(c => c.w));
    const totalH = childSizes.reduce((sum, c) => sum + c.h, 0) + (children.length - 1) * s.gapY;
    return {
      w: maxW + s.padX * 2 + s.gapX * 2, // extra space for fork/join lines
      h: totalH + s.padY * 2,
    };
  }

  // Serial (default): children flow left-to-right
  const totalW = childSizes.reduce((sum, c) => sum + c.w, 0) + (children.length - 1) * s.gapX;
  const maxH = Math.max(...childSizes.map(c => c.h));
  return {
    w: totalW + s.padX * 2,
    h: maxH + s.padY * 2,
  };
}

function getChildren(node: TreeNode): TreeNode[] {
  if (node.type === 'plugin') return [];
  if ('children' in node && Array.isArray(node.children)) return node.children;
  return [];
}

function getMode(node: TreeNode): string {
  if (node.type === 'group' && node.mode) return node.mode;
  if (node.type === 'branch') return 'serial'; // branches are serial internally
  return 'serial';
}

// --- Render pass: produce SVG elements ---

interface RenderContext {
  elements: JSX.Element[];
  s: typeof COMPACT;
  compact: boolean;
  key: number;
}

function renderNode(
  node: TreeNode,
  x: number,
  y: number,
  size: Size,
  ctx: RenderContext,
): { inX: number; inY: number; outX: number; outY: number } {
  const { s } = ctx;

  if (node.type === 'plugin') {
    const cx = x + size.w / 2;
    const cy = y + size.h / 2;
    const r = s.nodeW / 2;
    ctx.elements.push(
      <circle
        key={ctx.key++}
        cx={cx}
        cy={cy}
        r={r}
        fill={SERIAL_COLOR}
        opacity={0.9}
      />
    );
    return { inX: x, inY: cy, outX: x + size.w, outY: cy };
  }

  const children = getChildren(node);
  if (children.length === 0) {
    // Empty group: render as a small rect
    ctx.elements.push(
      <rect
        key={ctx.key++}
        x={x}
        y={y}
        width={size.w}
        height={size.h}
        rx={2}
        ry={2}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={0.5}
        strokeDasharray="2,2"
      />
    );
    const cy = y + size.h / 2;
    return { inX: x, inY: cy, outX: x + size.w, outY: cy };
  }

  const mode = getMode(node);
  const childSizes = children.map(c => measureNode(c, s));
  const isParallel = mode === 'parallel' || mode === 'midside';
  const color = isParallel ? PARALLEL_COLOR : SERIAL_COLOR;

  // Draw group border (dotted) — skip for root
  if (node.type === 'group' && node.id !== 0) {
    ctx.elements.push(
      <rect
        key={ctx.key++}
        x={x + 0.5}
        y={y + 0.5}
        width={size.w - 1}
        height={size.h - 1}
        rx={2}
        ry={2}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        strokeDasharray="2,2"
        opacity={0.4}
      />
    );
  }

  if (isParallel) {
    // Parallel layout: branches stacked vertically, centered horizontally
    const forkX = x + s.padX + s.gapX / 2;
    const joinX = x + size.w - s.padX - s.gapX / 2;
    const innerX = x + s.padX + s.gapX;

    let cy = y + s.padY;
    const branchEndpoints: { inY: number; outY: number }[] = [];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const cSize = childSizes[i];
      const endpoints = renderNode(child, innerX, cy, cSize, ctx);
      branchEndpoints.push({ inY: endpoints.inY, outY: endpoints.outY });

      // Fork line: forkX → child input
      ctx.elements.push(
        <line
          key={ctx.key++}
          x1={forkX}
          y1={endpoints.inY}
          x2={endpoints.inX}
          y2={endpoints.inY}
          stroke={color}
          strokeWidth={0.75}
          opacity={0.6}
        />
      );

      // Join line: child output → joinX
      ctx.elements.push(
        <line
          key={ctx.key++}
          x1={endpoints.outX}
          y1={endpoints.outY}
          x2={joinX}
          y2={endpoints.outY}
          stroke={color}
          strokeWidth={0.75}
          opacity={0.6}
        />
      );

      cy += cSize.h + s.gapY;
    }

    // Vertical fork line
    if (branchEndpoints.length > 1) {
      const topY = branchEndpoints[0].inY;
      const botY = branchEndpoints[branchEndpoints.length - 1].inY;
      ctx.elements.push(
        <line
          key={ctx.key++}
          x1={forkX}
          y1={topY}
          x2={forkX}
          y2={botY}
          stroke={color}
          strokeWidth={0.75}
          opacity={0.6}
        />
      );

      // Vertical join line
      const topOutY = branchEndpoints[0].outY;
      const botOutY = branchEndpoints[branchEndpoints.length - 1].outY;
      ctx.elements.push(
        <line
          key={ctx.key++}
          x1={joinX}
          y1={topOutY}
          x2={joinX}
          y2={botOutY}
          stroke={color}
          strokeWidth={0.75}
          opacity={0.6}
        />
      );
    }

    const midY = y + size.h / 2;
    return { inX: forkX, inY: midY, outX: joinX, outY: midY };
  }

  // Serial layout: children flow left-to-right
  let cx = x + s.padX;
  const midY = y + size.h / 2;
  let prevOutX: number | null = null;
  let prevOutY: number | null = null;
  let firstInX = cx;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const cSize = childSizes[i];
    // Center child vertically within group
    const childY = midY - cSize.h / 2;
    const endpoints = renderNode(child, cx, childY, cSize, ctx);

    if (i === 0) firstInX = endpoints.inX;

    // Connecting line from previous node
    if (prevOutX !== null && prevOutY !== null) {
      ctx.elements.push(
        <line
          key={ctx.key++}
          x1={prevOutX}
          y1={prevOutY}
          x2={endpoints.inX}
          y2={endpoints.inY}
          stroke={color}
          strokeWidth={0.75}
          opacity={0.6}
        />
      );
    }

    prevOutX = endpoints.outX;
    prevOutY = endpoints.outY;
    cx += cSize.w + s.gapX;
  }

  return {
    inX: firstInX,
    inY: midY,
    outX: prevOutX ?? (x + size.w),
    outY: prevOutY ?? midY,
  };
}

// --- Component ---

export function TopologyDiagram({ treeData, compact = false }: TopologyDiagramProps) {
  const diagram = useMemo(() => {
    const tree = parseTree(treeData);
    if (!tree) return null;

    const children = getChildren(tree);
    if (children.length === 0) return null;

    const s = compact ? COMPACT : FULL;
    const size = measureNode(tree, s);

    const ctx: RenderContext = {
      elements: [],
      s,
      compact,
      key: 0,
    };

    renderNode(tree, 0, 0, size, ctx);

    return { elements: ctx.elements, width: size.w, height: size.h };
  }, [treeData, compact]);

  if (!diagram) return null;

  return (
    <svg
      width={diagram.width}
      height={diagram.height}
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {diagram.elements}
    </svg>
  );
}

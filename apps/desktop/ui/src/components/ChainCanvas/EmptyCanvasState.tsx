/**
 * Centered overlay shown on the ReactFlow canvas when the chain has no plugins.
 * Provides a hint to get started — the actual "+" node is still rendered on the canvas beneath.
 */
export function EmptyCanvasState() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <div
        style={{
          padding: '20px 32px',
          border: '1px dashed rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          background: 'rgba(10, 10, 10, 0.6)',
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            color: 'rgba(255, 255, 255, 0.25)',
            letterSpacing: '0.05em',
          }}
        >
          Drop a plugin to start
        </p>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 'var(--text-xs)',
            color: 'rgba(255, 255, 255, 0.15)',
          }}
        >
          or click <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>+</span> to add your first plugin
        </p>
      </div>
    </div>
  );
}

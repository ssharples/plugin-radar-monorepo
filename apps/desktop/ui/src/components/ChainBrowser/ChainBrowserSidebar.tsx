import { UseCaseCategoryTree } from './UseCaseCategoryTree';

interface ChainBrowserSidebarProps {
  selectedGroup: string | null;
  selectedUseCase: string | null;
  onSelectGroup: (group: string | null) => void;
  onSelectUseCase: (useCase: string | null) => void;
}

export function ChainBrowserSidebar({
  selectedGroup,
  selectedUseCase,
  onSelectGroup,
  onSelectUseCase,
}: ChainBrowserSidebarProps) {
  return (
    <div className="flex-shrink-0 flex flex-col min-h-0" style={{ width: '200px', borderRight: '1px solid var(--color-border-subtle)' }}>
      {/* Category tree — scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber" style={{ padding: 'var(--space-2)' }}>
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            marginBottom: '6px',
          }}
        >
          Category
        </div>
        <UseCaseCategoryTree
          selectedGroup={selectedGroup}
          selectedUseCase={selectedUseCase}
          onSelectGroup={onSelectGroup}
          onSelectUseCase={onSelectUseCase}
        />
      </div>
    </div>
  );
}

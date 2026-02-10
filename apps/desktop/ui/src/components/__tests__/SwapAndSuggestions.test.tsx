import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ============================================
// Mock dependencies
// ============================================
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
  useDroppable: () => ({
    isOver: false,
    setNodeRef: vi.fn(),
  }),
}));

vi.mock('../../stores/chainStore', () => ({
  useChainStore: (selector: any) => {
    const state = {
      nodeMeterData: {},
      duplicateNode: vi.fn(),
    };
    return selector(state);
  },
}));

vi.mock('../../stores/cloudChainStore', () => ({
  useCloudChainStore: () => mockCloudChainStore,
}));

vi.mock('../../stores/syncStore', () => ({
  useSyncStore: () => ({
    isLoggedIn: true,
    userId: 'test-user-id',
  }),
}));

vi.mock('../ChainEditor/PluginSwapMenu', () => ({
  PluginSwapMenu: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="swap-menu">
      <button onClick={onClose}>Close Swap</button>
    </div>
  ),
}));

vi.mock('../../api/juce-bridge', () => ({
  juceBridge: {
    importChain: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../api/convex-client', () => ({
  default: {},
  findCompatibleSwaps: vi.fn().mockResolvedValue([]),
  translateParameters: vi.fn().mockResolvedValue({ targetParams: [], confidence: 0, unmappedParams: [] }),
  swapPluginInChain: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../assets/rackmount-strip.png', () => ({ default: '' }));
vi.mock('../../assets/plugin-container.png', () => ({ default: '' }));
vi.mock('../../assets/plugin-instance-interface.png', () => ({ default: '' }));
vi.mock('../../assets/bypass-icon.svg', () => ({ default: '' }));
vi.mock('../../assets/duplicate-icon.svg', () => ({ default: '' }));

// Mock store data
let mockCloudChainStore: any = {};

// ============================================
// ChainSlot Swap Button Tests
// ============================================
describe('ChainSlot — swap button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders swap button when matchedPluginId is provided', async () => {
    // Dynamic import to allow mocks to be set up first
    const { ChainSlot } = await import('../ChainEditor/ChainSlot');

    render(
      <ChainSlot
        node={{ id: 1, name: 'ProQ3', manufacturer: 'FabFilter', bypassed: false }}
        slotNumber={1}
        isEditorOpen={false}
        matchedPluginId="plugin-123"
        onRemove={vi.fn()}
        onToggleBypass={vi.fn()}
        onToggleEditor={vi.fn()}
      />
    );

    const swapBtn = screen.getByTitle('Swap plugin');
    expect(swapBtn).toBeDefined();
  });

  it('hides swap button when no matchedPluginId', async () => {
    const { ChainSlot } = await import('../ChainEditor/ChainSlot');

    render(
      <ChainSlot
        node={{ id: 1, name: 'Unknown Plugin', manufacturer: '', bypassed: false }}
        slotNumber={1}
        isEditorOpen={false}
        onRemove={vi.fn()}
        onToggleBypass={vi.fn()}
        onToggleEditor={vi.fn()}
      />
    );

    expect(screen.queryByTitle('Swap plugin')).toBeNull();
  });

  it('opens swap menu when swap button is clicked', async () => {
    const { ChainSlot } = await import('../ChainEditor/ChainSlot');

    render(
      <ChainSlot
        node={{ id: 1, name: 'ProQ3', manufacturer: 'FabFilter', bypassed: false }}
        slotNumber={1}
        isEditorOpen={false}
        matchedPluginId="plugin-123"
        onRemove={vi.fn()}
        onToggleBypass={vi.fn()}
        onToggleEditor={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Swap plugin'));
    expect(screen.getByTestId('swap-menu')).toBeDefined();
  });
});

// ============================================
// ChainDetailModal — "Use Instead" Button Tests
// ============================================
describe('ChainDetailModal — Use Instead buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloudChainStore = {
      currentChain: {
        _id: 'chain-1',
        name: 'Test Chain',
        slug: 'test-chain',
        description: 'A test chain',
        category: 'mixing',
        tags: ['vocal'],
        pluginCount: 2,
        downloads: 10,
        likes: 5,
        isPublic: true,
        slots: [
          { position: 0, pluginName: 'ProQ3', manufacturer: 'FabFilter' },
          { position: 1, pluginName: 'OxfordEQ', manufacturer: 'Sonnox' },
        ],
      },
      compatibility: {
        canFullyLoad: false,
        ownedCount: 1,
        missingCount: 1,
        percentage: 50,
      },
      detailedCompatibility: {
        percentage: 50,
        ownedCount: 1,
        missingCount: 1,
        missing: [
          { pluginName: 'OxfordEQ', manufacturer: 'Sonnox', suggestion: null },
        ],
        slots: [
          { position: 0, pluginName: 'ProQ3', manufacturer: 'FabFilter', status: 'owned' as const, alternatives: [] },
          {
            position: 1,
            pluginName: 'OxfordEQ',
            manufacturer: 'Sonnox',
            status: 'missing' as const,
            alternatives: [
              { id: 'alt-1', name: 'TDR Nova', manufacturer: 'Tokyo Dawn Labs' },
              { id: 'alt-2', name: 'EQ Eight', manufacturer: 'Ableton' },
            ],
          },
        ],
      },
      toggleLike: vi.fn(),
      downloadChain: vi.fn(),
      fetchDetailedCompatibility: vi.fn(),
      getChainRating: vi.fn().mockResolvedValue({ average: 4, count: 10, userRating: null }),
      getComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn(),
      deleteComment: vi.fn(),
      rateChain: vi.fn(),
      forkChain: vi.fn(),
      isFollowingAuthor: vi.fn().mockResolvedValue(false),
      followAuthor: vi.fn(),
      unfollowAuthor: vi.fn(),
    };
  });

  it('renders "Use X" buttons when alternatives exist', async () => {
    const { ChainDetailModal } = await import('../CloudSync/ChainDetailModal');

    render(
      <ChainDetailModal
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Should show "Use TDR Nova" and "Use EQ Eight" buttons
    expect(screen.getByText('Use TDR Nova')).toBeDefined();
    expect(screen.getByText('Use EQ Eight')).toBeDefined();
  });

  it('shows "Using X" badge after clicking substitute button', async () => {
    const { ChainDetailModal } = await import('../CloudSync/ChainDetailModal');

    render(
      <ChainDetailModal
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Click "Use TDR Nova"
    fireEvent.click(screen.getByText('Use TDR Nova'));

    // Should now show "Using TDR Nova" badge
    expect(screen.getByText('Using TDR Nova')).toBeDefined();
    // Should show undo link
    expect(screen.getByText('undo')).toBeDefined();
  });

  it('updates load button text with substitution count', async () => {
    const { ChainDetailModal } = await import('../CloudSync/ChainDetailModal');

    render(
      <ChainDetailModal
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Click substitute
    fireEvent.click(screen.getByText('Use TDR Nova'));

    // Load button should reflect the swap
    expect(screen.getByText('Load with 1 swap')).toBeDefined();
  });
});

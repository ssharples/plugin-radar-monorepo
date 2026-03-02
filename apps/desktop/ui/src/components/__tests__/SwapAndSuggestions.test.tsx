import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BrowseChainResult } from '../../api/types';

// ============================================
// Mock dependencies
// ============================================
vi.mock('../../stores/chainStore', () => ({
  useChainStore: (selector: any) => {
    const state = {
      duplicateNode: vi.fn(),
      setChainName: vi.fn(),
      setTargetInputPeakRange: vi.fn(),
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

vi.mock('../../utils/loadChainWithSubstitutions', () => ({
  loadChainWithSubstitutions: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock store data
let mockCloudChainStore: any = {};

// Shared test chain fixture
const testChain: BrowseChainResult = {
  _id: 'chain-1' as any,
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
    { position: 0, pluginName: 'ProQ3', manufacturer: 'FabFilter', parameters: [] },
    { position: 1, pluginName: 'OxfordEQ', manufacturer: 'Sonnox', parameters: [] },
  ],
} as any;

// ============================================
// ChainBrowserDetail — Substitution Tests
// ============================================
describe('ChainBrowserDetail — substitution cycle flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloudChainStore = {
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
          {
            position: 0,
            pluginName: 'ProQ3',
            manufacturer: 'FabFilter',
            status: 'owned' as const,
            alternatives: [],
          },
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
      substitutionPlan: null,
      downloadChain: vi.fn(),
      forkChain: vi.fn(),
    };
  });

  it('renders cycle navigation buttons when alternatives exist for a missing slot', async () => {
    const { ChainBrowserDetail } = await import('../ChainBrowser/ChainBrowserDetail');

    render(
      <ChainBrowserDetail
        chain={testChain}
        onBack={vi.fn()}
        onClose={vi.fn()}
        isInCollection={false}
        onToggleCollection={vi.fn()}
      />
    );

    // Missing slot should show the prev/next cycle buttons
    // The buttons render as ◀ and ▶ unicode triangles
    const prevButtons = screen.getAllByText('◀');
    const nextButtons = screen.getAllByText('▶');
    expect(prevButtons.length).toBeGreaterThan(0);
    expect(nextButtons.length).toBeGreaterThan(0);
  });

  it('shows "Swap" badge and load button reflects swap count after cycling to an alternative', async () => {
    const { ChainBrowserDetail } = await import('../ChainBrowser/ChainBrowserDetail');

    render(
      <ChainBrowserDetail
        chain={testChain}
        onBack={vi.fn()}
        onClose={vi.fn()}
        isInCollection={false}
        onToggleCollection={vi.fn()}
      />
    );

    // Advance forward once to select the first alternative (TDR Nova)
    fireEvent.click(screen.getAllByText('▶')[0]);

    // "Swap" badge should now be visible
    expect(screen.getByText('Swap')).toBeDefined();

    // Load button text should reflect 1 swap
    expect(screen.getByText('Load · 1 swap')).toBeDefined();
  });

  it('clears substitution when X button is clicked after a swap is applied', async () => {
    const { ChainBrowserDetail } = await import('../ChainBrowser/ChainBrowserDetail');

    render(
      <ChainBrowserDetail
        chain={testChain}
        onBack={vi.fn()}
        onClose={vi.fn()}
        isInCollection={false}
        onToggleCollection={vi.fn()}
      />
    );

    // Apply a substitution first
    fireEvent.click(screen.getAllByText('▶')[0]);
    expect(screen.getByText('Swap')).toBeDefined();

    // Clear it via the X button rendered next to "Swap"
    // The X button is a lucide <X> icon — find by its parent context.
    // The clear button is rendered inside the substituted slot row.
    // Vitest/jsdom renders the SVG; we look for the clear button by title or aria-label fallback.
    // ChainBrowserDetail renders the X icon inside a <button> with no text.
    // We can query all buttons and find the one that clears the substitution.
    const allButtons = screen.getAllByRole('button');
    // The clear button sits after the "Swap" badge; click the X-icon button
    const clearButton = allButtons.find(
      (btn) => btn.getAttribute('style')?.includes('none') && btn.querySelector('svg')
    );
    if (clearButton) fireEvent.click(clearButton);

    // After clearing, "Swap" badge should be gone and load button reverts
    expect(screen.queryByText('Swap')).toBeNull();
    expect(screen.getByText('Load Chain')).toBeDefined();
  });

  it('shows "Load Chain" when no substitutions are active', async () => {
    const { ChainBrowserDetail } = await import('../ChainBrowser/ChainBrowserDetail');

    render(
      <ChainBrowserDetail
        chain={testChain}
        onBack={vi.fn()}
        onClose={vi.fn()}
        isInCollection={false}
        onToggleCollection={vi.fn()}
      />
    );

    // No substitutions applied → default load button text
    expect(screen.getByText('Load Chain')).toBeDefined();
  });
});

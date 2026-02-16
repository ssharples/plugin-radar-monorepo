import { useState, useCallback } from 'react';
import { 
  Guitar, 
  Music2, 
  Mic, 
  Disc3,
  Sparkles, 
  Clock,
  Grid3x3,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { juceBridge } from '../../api/juce-bridge';

interface EmptyStateKitProps {
  onOpenFullBrowser?: () => void;
}

interface ChainTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
}

const CHAIN_TEMPLATES: ChainTemplate[] = [
  {
    id: 'guitar',
    name: 'Guitar',
    description: 'Record & process electric or acoustic guitar',
    icon: Guitar,
    color: '#ffaa00',
    bgColor: 'rgba(255, 170, 0, 0.06)',
    borderColor: 'rgba(255, 170, 0, 0.25)',
    glowColor: '0 0 20px rgba(255, 170, 0, 0.3)',
  },
  {
    id: 'synth',
    name: 'Synth',
    description: 'Shape & polish synthesizer sounds',
    icon: Music2,
    color: '#b800ff',
    bgColor: 'rgba(184, 0, 255, 0.06)',
    borderColor: 'rgba(184, 0, 255, 0.25)',
    glowColor: '0 0 20px rgba(184, 0, 255, 0.3)',
  },
  {
    id: 'vocal',
    name: 'Vocal',
    description: 'Polish vocals with compression & EQ',
    icon: Mic,
    color: '#deff0a',
    bgColor: 'rgba(222, 255, 10, 0.06)',
    borderColor: 'rgba(222, 255, 10, 0.25)',
    glowColor: '0 0 20px rgba(222, 255, 10, 0.3)',
  },
  {
    id: 'mastering',
    name: 'Mastering',
    description: 'Finalize your mix for distribution',
    icon: Disc3,
    color: '#ccff00',
    bgColor: 'rgba(204, 255, 0, 0.06)',
    borderColor: 'rgba(204, 255, 0, 0.25)',
    glowColor: '0 0 20px rgba(204, 255, 0, 0.3)',
  },
];

/**
 * Empty state component shown when chain has no plugins.
 * Features:
 * - Quick start templates (Guitar, Synth, Vocal, Mastering)
 * - Recent chains from cloud (if available)
 * - Full browser access
 */
export function EmptyStateKit({ onOpenFullBrowser }: EmptyStateKitProps) {
  const { myChains } = useCloudChainStore();
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  // Handle template selection - opens plugin browser filtered by use case
  const handleTemplateClick = useCallback(async (templateId: string) => {
    setLoadingTemplate(templateId);
    
    try {
      // Open the plugin browser with a search hint for the template
      // The browser will open with appropriate filters
      onOpenFullBrowser?.();
      
      // Store the selected template intent for the browser to pick up
      sessionStorage.setItem('chainTemplate', templateId);
    } finally {
      setLoadingTemplate(null);
    }
  }, [onOpenFullBrowser]);

  // Handle recent chain click
  const handleRecentChainClick = useCallback(async (chainId: string) => {
    try {
      // This would load the chain from cloud
      // For now, just open the browser - full implementation would use cloudChainStore
      onOpenFullBrowser?.();
    } catch (_error) {
      // Silently ignored — fallback opens full browser
    }
  }, [onOpenFullBrowser]);

  // Show up to 3 most recent user chains (sorted by createdAt)
  const recentChains = myChains
    .filter(chain => chain.createdAt)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 3);

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-3xl">
        {/* Hero section */}
        <div className="text-center mb-10">
          {/* Animated icon */}
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full blur-2xl animate-pulse-soft"
                style={{ background: 'rgba(222, 255, 10, 0.15)' }}
              />
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(222, 255, 10, 0.2), rgba(222, 255, 10, 0.05))',
                  border: '2px solid rgba(222, 255, 10, 0.3)',
                  boxShadow: '0 0 32px rgba(222, 255, 10, 0.2)',
                }}
              >
                <Sparkles className="w-10 h-10" style={{ color: 'var(--color-accent-cyan)' }} strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <h1
            className="text-2xl font-bold mb-2"
            style={{
              fontFamily: 'var(--font-extended)',
              letterSpacing: 'var(--tracking-wider)',
              textTransform: 'uppercase' as const,
              color: 'var(--color-text-primary)',
            }}
          >
            Build Your Chain
          </h1>
          <p
            className="text-sm max-w-md mx-auto"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Choose a workflow template below, or browse all plugins to build from scratch
          </p>
        </div>

        {/* Template cards */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {CHAIN_TEMPLATES.map((template) => {
            const Icon = template.icon;
            const isLoading = loadingTemplate === template.id;

            return (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template.id)}
                disabled={isLoading}
                className="group relative p-5 rounded-xl text-left"
                style={{
                  background: template.bgColor,
                  border: `2px solid ${template.borderColor}`,
                  transition: 'all var(--duration-fast) var(--ease-snap)',
                  opacity: isLoading ? 0.5 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.boxShadow = template.glowColor; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* Icon */}
                <div className="mb-3" style={{ color: template.color }}>
                  <Icon className="w-8 h-8" strokeWidth={1.5} />
                </div>

                {/* Content */}
                <h3
                  className="text-base font-bold mb-1"
                  style={{
                    fontFamily: 'var(--font-extended)',
                    letterSpacing: 'var(--tracking-wider)',
                    textTransform: 'uppercase' as const,
                    color: template.color,
                  }}
                >
                  {template.name}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {template.description}
                </p>

                {/* Hover arrow */}
                <div
                  className="absolute top-5 right-5 opacity-0 group-hover:opacity-100"
                  style={{
                    color: template.color,
                    transition: 'opacity var(--duration-fast) var(--ease-snap)',
                  }}
                >
                  <ChevronRight className="w-5 h-5" />
                </div>

                {/* Loading spinner */}
                {isLoading && (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-xl"
                    style={{ background: 'rgba(10, 10, 10, 0.8)' }}
                  >
                    <div
                      className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: template.borderColor, borderTopColor: 'transparent' }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Recent chains section (if available) */}
        {recentChains.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4 px-1">
              <Clock className="w-4 h-4" style={{ color: 'var(--color-text-tertiary)' }} />
              <h2
                className="text-xs"
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 'var(--tracking-widest)',
                  textTransform: 'uppercase' as const,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Recently Viewed
              </h2>
            </div>

            <div className="space-y-2">
              {recentChains.map((chain) => (
                <button
                  key={chain._id}
                  onClick={() => handleRecentChainClick(chain._id)}
                  className="w-full p-3 rounded-lg text-left group"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-default)',
                    transition: 'all var(--duration-fast) var(--ease-snap)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)'; e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-sm font-bold truncate"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {chain.name || 'Untitled Chain'}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-xs"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}
                        >
                          {chain.pluginCount || 0} plugins
                        </span>
                        {chain.category && (
                          <>
                            <span style={{ color: 'var(--color-text-disabled)' }}>•</span>
                            <span
                              className="text-xs capitalize"
                              style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
                            >
                              {chain.category}
                            </span>
                          </>
                        )}
                        {chain.downloads > 0 && (
                          <>
                            <span style={{ color: 'var(--color-text-disabled)' }}>•</span>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" style={{ color: 'var(--color-accent-cyan)' }} />
                              <span
                                className="text-xs"
                                style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}
                              >
                                {chain.downloads}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: 'var(--color-text-disabled)', transition: 'color var(--duration-fast) var(--ease-snap)' }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 my-8">
          <div className="flex-1 h-px" style={{ background: 'var(--color-border-default)' }} />
          <span
            className="text-xs"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: 'var(--tracking-widest)',
              textTransform: 'uppercase' as const,
              color: 'var(--color-text-disabled)',
            }}
          >
            Or
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--color-border-default)' }} />
        </div>

        {/* Browse all plugins button */}
        <button
          onClick={onOpenFullBrowser}
          className="w-full p-4 rounded-xl group"
          style={{
            border: '2px dashed var(--color-border-strong)',
            background: 'transparent',
            transition: 'all var(--duration-fast) var(--ease-snap)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.4)'; e.currentTarget.style.background = 'rgba(222, 255, 10, 0.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <div className="flex items-center justify-center gap-3">
            <Grid3x3
              className="w-5 h-5"
              style={{ color: 'var(--color-text-secondary)', transition: 'color var(--duration-fast) var(--ease-snap)' }}
            />
            <span
              className="text-sm font-bold"
              style={{
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase' as const,
                color: 'var(--color-text-secondary)',
                transition: 'color var(--duration-fast) var(--ease-snap)',
              }}
            >
              Browse All Plugins
            </span>
            <ChevronRight
              className="w-4 h-4"
              style={{ color: 'var(--color-text-disabled)', transition: 'color var(--duration-fast) var(--ease-snap)' }}
            />
          </div>
        </button>

        {/* Keyboard shortcuts hint */}
        <div className="mt-6 flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <kbd
              className="px-2 py-1 rounded text-[10px]"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-tertiary)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
              }}
            >
              ⌘K
            </kbd>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Quick search</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd
              className="px-2 py-1 rounded text-[10px]"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-tertiary)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
              }}
            >
              ⌘B
            </kbd>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Browse plugins</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** @type {import('tailwindcss').Config} */
// ProChain design tokens — "graphite + signal violet".
// Neutral graphite surfaces, one violet accent for focus/selection,
// brass for serial routing and teal for parallel routing.
// Category badge colours, meter gradients and status colours keep their
// usual meaning and are NOT driven by the accent.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces (darkest → lightest)
        'plugin-bg': '#0c0d10',
        'plugin-surface': '#14161a',
        'plugin-surface-alt': '#1b1e23',
        'plugin-raised': '#22262c',
        'plugin-border': '#2a2e35',
        'plugin-border-bright': '#3a3f48',
        // Accent (selection, focus, primary actions)
        'plugin-accent': '#8b7cff',
        'plugin-accent-bright': '#a598ff',
        'plugin-accent-dim': '#6a5ce0',
        'plugin-on-accent': '#0d0b1f',
        // Text
        'plugin-text': '#eceef2',
        'plugin-muted': '#9aa0ab',
        'plugin-dim': '#5d636e',
        // Status (keep meaning: green ok, yellow warning, red error)
        'plugin-success': '#22c55e',
        'plugin-warning': '#eab308',
        'plugin-danger': '#ef4444',
        // Routing
        'plugin-serial': '#d6a85a',
        'plugin-parallel': '#3fbfae',
        // Utility tints
        'plugin-card': 'rgba(139,124,255,0.08)',
        'plugin-rail': 'rgba(0,0,0,0.25)',
        'plugin-glow': 'rgba(139,124,255,0.22)',
        'plugin-brand': 'rgba(236,238,242,0.4)',
        'plugin-screw': 'rgba(255,255,255,0.06)',
      },
      fontFamily: {
        sans: ['"Barlow Semi Condensed"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-accent': '0 0 0 1px rgba(139,124,255,0.35), 0 0 12px rgba(139,124,255,0.18)',
        'glow-accent-strong': '0 0 0 1px rgba(139,124,255,0.6), 0 0 18px rgba(139,124,255,0.3)',
        'inset-dark': 'inset 0 1px 2px rgba(0, 0, 0, 0.5)',
        'meter': 'inset 0 0 4px rgba(0, 0, 0, 0.6)',
        'panel': '0 12px 32px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        'card': '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-in-up': 'fadeInUp 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms cubic-bezier(0.22,1,0.36,1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'scale-in': 'scaleIn 150ms ease-out',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(139,124,255,0.25)' },
          '50%': { boxShadow: '0 0 0 1px rgba(139,124,255,0.6), 0 0 10px rgba(139,124,255,0.3)' },
        },
      },
      fontSize: {
        'xxs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

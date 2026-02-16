/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Digital Underground cyber palette
        'plugin-bg': '#0a0a0a',
        'plugin-surface': '#0f0f0f',
        'plugin-surface-alt': '#151515',
        'plugin-border': '#252525',
        'plugin-border-bright': '#404040',
        'plugin-accent': '#deff0a',
        'plugin-accent-bright': '#deff0a',
        'plugin-accent-dim': 'rgba(222, 255, 10, 0.4)',
        'plugin-text': '#ffffff',
        'plugin-muted': 'rgba(255,255,255,0.5)',
        'plugin-dim': 'rgba(255,255,255,0.25)',
        'plugin-success': '#00ff88',
        'plugin-warning': '#ffaa00',
        'plugin-danger': '#ff0033',
        'plugin-serial': '#c9944a',
        'plugin-parallel': '#deff0a',
        'plugin-card': 'rgba(255,255,255,0.05)',
        'plugin-rail': 'rgba(0,0,0,0.2)',
        'plugin-glow': 'rgba(222, 255, 10, 0.15)',
        'plugin-brand': 'rgba(222, 255, 10, 0.38)',
        'plugin-screw': 'rgba(255,255,255,0.08)',
        // Neon accents
        'neon-cyan': '#deff0a',
        'neon-magenta': '#ff006e',
        'neon-lime': '#ccff00',
        'neon-purple': '#b800ff',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cutive Mono', 'SF Mono', 'Consolas', 'monospace'],
        brand: ['Nosifer', 'cursive'],
        extended: ['Extended Bold', 'Arial Black', 'Impact', 'sans-serif'],
      },
      borderRadius: {
        'propane': '4px',
        'propane-lg': '8px',
      },
      boxShadow: {
        'glow-accent': '0 0 12px rgba(222, 255, 10, 0.3)',
        'glow-accent-strong': '0 0 20px rgba(222, 255, 10, 0.5)',
        'glow-magenta': '0 0 12px rgba(255, 0, 110, 0.3)',
        'inset-dark': 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
        'meter': 'inset 0 0 6px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-in-up': 'fadeInUp 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'scale-in': 'scaleIn 150ms ease-out',
        'glow-pulse': 'glowPulse 1.5s ease-in-out infinite',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
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
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(222, 255, 10, 0.15)' },
          '50%': { boxShadow: '0 0 12px rgba(222, 255, 10, 0.4)' },
        },
        neonPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(222, 255, 10, 0.3), 0 0 16px rgba(222, 255, 10, 0.2)' },
          '50%': { boxShadow: '0 0 16px rgba(222, 255, 10, 0.6), 0 0 32px rgba(222, 255, 10, 0.4)' },
        },
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'plugin-bg': '#000000',
        'plugin-surface': '#0a0a0a',
        'plugin-surface-alt': '#121212',
        'plugin-border': '#323232',
        'plugin-border-bright': '#89572a',
        'plugin-accent': '#89572a',
        'plugin-accent-bright': '#a06830',
        'plugin-accent-dim': '#6b4520',
        'plugin-text': '#ffffff',
        'plugin-muted': 'rgba(255,255,255,0.5)',
        'plugin-dim': 'rgba(255,255,255,0.25)',
        'plugin-success': '#22c55e',
        'plugin-warning': '#eab308',
        'plugin-danger': '#ef4444',
        'plugin-serial': '#c9944a',
        'plugin-parallel': '#5a7842',
        'plugin-card': 'rgba(131,76,28,0.2)',
        'plugin-rail': 'rgba(0,0,0,0.2)',
        'plugin-glow': 'rgba(137,87,42,0.24)',
        'plugin-brand': 'rgba(255,255,255,0.38)',
        'plugin-screw': 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        mono: ['Cutive Mono', 'monospace'],
        brand: ['Nosifer', 'cursive'],
      },
      borderRadius: {
        'propane': '6px',
        'propane-lg': '13px',
      },
      boxShadow: {
        'glow-accent': '0 0 12px rgba(137, 87, 42, 0.15)',
        'glow-accent-strong': '0 0 20px rgba(137, 87, 42, 0.3)',
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
          '0%': { opacity: '0', transform: 'scale(0.9) rotate(-1deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(137, 87, 42, 0.15)' },
          '50%': { boxShadow: '0 0 10px rgba(137, 87, 42, 0.35)' },
        },
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

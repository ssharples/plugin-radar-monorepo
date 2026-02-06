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
        'plugin-surface': '#0d0d0d',
        'plugin-surface-alt': '#111111',
        'plugin-border': '#1e1e1e',
        'plugin-border-bright': '#2a2a2a',
        'plugin-accent': '#ff6b00',
        'plugin-accent-bright': '#ff8c33',
        'plugin-accent-dim': '#cc5500',
        'plugin-text': '#e8e8e8',
        'plugin-muted': '#6b6b6b',
        'plugin-dim': '#3a3a3a',
      },
      boxShadow: {
        'glow-accent': '0 0 12px rgba(255, 107, 0, 0.15)',
        'glow-accent-strong': '0 0 20px rgba(255, 107, 0, 0.3)',
        'inset-dark': 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
        'meter': 'inset 0 0 6px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

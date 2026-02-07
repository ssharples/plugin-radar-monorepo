/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'plugin-bg': '#0a0a0f',
        'plugin-surface': '#131318',
        'plugin-surface-alt': '#18181f',
        'plugin-border': '#22222a',
        'plugin-border-bright': '#2e2e38',
        'plugin-accent': '#6366f1',
        'plugin-accent-bright': '#818cf8',
        'plugin-accent-dim': '#4f46e5',
        'plugin-text': '#e4e4eb',
        'plugin-muted': '#6b6b78',
        'plugin-dim': '#3a3a45',
        'plugin-success': '#22c55e',
        'plugin-warning': '#eab308',
        'plugin-danger': '#ef4444',
        'plugin-serial': '#3b82f6',
        'plugin-parallel': '#f97316',
      },
      boxShadow: {
        'glow-accent': '0 0 12px rgba(99, 102, 241, 0.15)',
        'glow-accent-strong': '0 0 20px rgba(99, 102, 241, 0.3)',
        'inset-dark': 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
        'meter': 'inset 0 0 6px rgba(0, 0, 0, 0.6)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'fade-in-up': 'fadeInUp 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
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
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}

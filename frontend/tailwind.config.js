/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // WorkComm Minimal tokens (map CSS vars for Tailwind usage)
        paper:   '#F8F7F3',
        'paper-2': '#F2F1EC',
        ink:     '#17171B',
        'ink-2': '#2F2F33',
        muted:   '#6E6E72',
        faint:   '#A0A09C',
        rule:    '#E5E3DD',
        'rule-2':'#EFEEE9',
        danger:  '#A8332A',
        // Keep surface mapped to paper for backward compat
        surface: '#F8F7F3',
        // Neutral primary (ink-based, no color accent)
        primary: {
          50:  '#f9f8f6',
          100: '#f2f1ec',
          200: '#e5e3dd',
          300: '#ccc9bf',
          400: '#a0a09c',
          500: '#6e6e72',
          600: '#2f2f33',
          700: '#17171b',
          800: '#0f0f12',
          900: '#080809',
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card:     'none',
        panel:    'none',
        dropdown: '0 4px 16px rgba(0,0,0,0.10)',
      },
      animation: {
        'slide-in': 'slideIn 0.18s ease-out forwards',
        'fade-in':  'fadeIn 0.12s ease-out forwards',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateX(12px)', opacity: 0 },
          '100%': { transform: 'translateX(0)',    opacity: 1 },
        },
        fadeIn: {
          '0%':   { opacity: 0, transform: 'translateY(-3px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

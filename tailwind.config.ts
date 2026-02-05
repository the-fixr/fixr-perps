import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        // Terminal Theme
        terminal: {
          bg: '#0D1117',
          secondary: '#161B22',
          tertiary: '#1C2128',
          border: '#30363D',
          text: '#E6EDF3',
        },
        // Trading Colors
        long: '#00FF88',
        'long-dim': '#00CC6A',
        short: '#FF3366',
        'short-dim': '#CC2952',
        // Accent Colors
        'accent-blue': '#58A6FF',
        'accent-purple': '#A371F7',
        'accent-orange': '#F0883E',
        'accent-cyan': '#39D9F0',
        // Brand Colors
        'gmx-blue': '#2D42FC',
        'arbitrum-blue': '#12AAFF',
        'fixr-purple': '#8B5CF6',
        'fixr-purple-dim': '#7C3AED',
      },
      textColor: {
        'terminal-secondary': '#8B949E',
        'terminal-muted': '#484F58',
      },
      backgroundColor: {
        'terminal-bg': '#0D1117',
        'terminal-secondary': '#161B22',
        'terminal-tertiary': '#1C2128',
      },
      borderColor: {
        'terminal-border': '#30363D',
      },
      boxShadow: {
        'glow-long': '0 0 20px rgba(0, 255, 136, 0.3)',
        'glow-short': '0 0 20px rgba(255, 51, 102, 0.3)',
        'glow-blue': '0 0 20px rgba(88, 166, 255, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'ticker': 'ticker 30s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

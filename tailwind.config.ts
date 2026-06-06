import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dc1: {
          void: '#050a14',
          'surface-l1': '#0b1221',
          'surface-l2': '#131c2f',
          'surface-l3': '#1e293b',
          // v2 palette remap (2026-06-06): the pre-redesign cyan accent + cool
          // slate text were THE "old design" tells. Remap the dc1-* tokens to the
          // locked v2 design language (teal accent, warm-cream text) so every
          // legacy v1 page inherits the v2 look in one change. The /v2/* pages use
          // their own CSS variables and are unaffected. `amber` keeps its name for
          // back-compat with existing `*-dc1-amber` classes; only the value moved.
          amber: '#2dd4b6',
          'amber-hover': '#25b39c',
          'amber-light': '#5fe3cd',
          'text-primary': '#f5f3ee',
          'text-secondary': '#c9c5bd',
          'text-muted': '#7b8da5',
          'section-blue': '#0a1628',
          'border': '#1e293b',
          'border-light': '#334155',
        },
        status: {
          success: '#10b981',
          'success-bg': 'rgba(16, 185, 129, 0.1)',
          error: '#ef4444',
          'error-bg': 'rgba(239, 68, 68, 0.1)',
          warning: '#f59e0b',
          'warning-bg': 'rgba(245, 158, 11, 0.1)',
          info: '#38bdf8',
          'info-bg': 'rgba(56, 189, 248, 0.1)',
        },
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        plex: ['IBM Plex Sans Arabic', 'sans-serif'],
        tajawal: ['Tajawal', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        'xs': '0.25rem',
        'sm-space': '0.5rem',
        'md-space': '1rem',
        'lg-space': '1.5rem',
        'xl-space': '2rem',
        '2xl-space': '3rem',
        '3xl-space': '4rem',
      },
      borderRadius: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0,0,0,0.05)',
        'md': '0 4px 6px rgba(0,0,0,0.1)',
        'lg': '0 10px 15px rgba(0,0,0,0.1)',
        'xl': '0 20px 25px rgba(0,0,0,0.15)',
        'amber': '0 0 20px rgba(0, 240, 255, 0.15)',
        'amber-lg': '0 0 40px rgba(0, 240, 255, 0.2)',
      },
      screens: {
        'xs': '0px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 200ms cubic-bezier(0.45, 0, 0.55, 1) forwards',
        'slide-up': 'slideUp 300ms cubic-bezier(0.65, 0, 0.35, 1) forwards',
        'slide-in-right': 'slideInRight 300ms cubic-bezier(0.65, 0, 0.35, 1) forwards',
        'marquee': 'marquee 30s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
export default config

import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssTypography from '@tailwindcss/typography';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
    '../frontend/src/**/*.{js,ts,jsx,tsx}',
    './node_modules/streamdown/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"Monaspace Neon"', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        workflow: ['0.8125rem', { lineHeight: '1.1rem' }],
        'workflow-label': ['0.75rem', { lineHeight: '1rem' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          bg: 'hsl(var(--accent-bg) / <alpha-value>)',
          'bg-hover': 'hsl(var(--accent-bg-hover) / <alpha-value>)',
          'bg-active': 'hsl(var(--accent-bg-active) / <alpha-value>)',
          border: 'hsl(var(--accent-border) / <alpha-value>)',
          ring: 'hsl(var(--accent-ring) / <alpha-value>)',
          fill: 'hsl(var(--accent-fill) / <alpha-value>)',
          'fill-hover': 'hsl(var(--accent-fill-hover) / <alpha-value>)',
          'fill-active': 'hsl(var(--accent-fill-active) / <alpha-value>)',
          text: 'hsl(var(--accent-text) / <alpha-value>)',
          'text-strong': 'hsl(var(--accent-text-strong) / <alpha-value>)',
          'on-fill': 'hsl(var(--accent-on-fill) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        metric: {
          positive: 'hsl(var(--metric-positive) / <alpha-value>)',
          negative: 'hsl(var(--metric-negative) / <alpha-value>)',
        },
        // Landing marketing shell tokens
        bg: 'var(--bg)',
        'surface-0': 'var(--surface-0)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
        'border-strong': 'var(--border-strong)',
      },
      borderRadius: {
        none: '0',
        sm: '8px',
        DEFAULT: '8px',
        md: '8px',
        lg: '8px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
        full: '9999px',
      },
      scale: {
        '98': '.98',
      },
      zIndex: {
        below: '-1',
        sticky: '20',
        nav: '30',
        overlay: '50',
        tooltip: '9999',
        toast: '10000',
      },
      transitionTimingFunction: {
        'expo-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
        'quart-out': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-quart': 'var(--ease-out-quart)',
        'out-expo': 'var(--ease-out-expo)',
        'in-out-quint': 'var(--ease-in-out-quint)',
        'in-out-expo': 'var(--ease-in-out-expo)',
        'linear-default': 'var(--ease-linear-default)',
      },
      transitionDuration: {
        fast: '160ms',
        med: '350ms',
        slow: '600ms',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        spotlight: {
          '0%': {
            opacity: '0',
            transform: 'translate(-72%, -62%) scale(0.5)',
          },
          '100%': {
            opacity: '1',
            transform: 'translate(-50%, -40%) scale(1)',
          },
        },
        'slide-in-right': {
          '0%': {
            opacity: '0',
            transform: 'translateX(-8px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
        'mention-in': {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'mention-out': {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
        },
        'waveform-dance': {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.5)' },
        },
        'timeline-step-in': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'timeline-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 currentColor', opacity: '1' },
          '50%': { boxShadow: '0 0 0 4px transparent', opacity: '0.7' },
        },
        'timeline-skeleton-sweep': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        spotlight: 'spotlight 2s ease 0.75s 1 forwards',
        'slide-in-right': 'slide-in-right 0.2s ease-out',
        'mention-in': 'mention-in 150ms ease-out',
        'mention-out': 'mention-out 100ms ease-in',
        'waveform-dance': 'waveform-dance 0.8s ease-in-out infinite',
        'timeline-step-in': 'timeline-step-in 220ms ease-out both',
        'timeline-pulse': 'timeline-pulse 2s ease-in-out infinite',
        'timeline-skeleton-sweep': 'timeline-skeleton-sweep 1.5s ease-in-out infinite',
        'skeleton-shimmer': 'timeline-skeleton-sweep 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
} satisfies Config;

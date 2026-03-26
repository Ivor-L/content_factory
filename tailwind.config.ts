import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem',
        xs: '1rem',
        tablet: '2rem'
      }
    },
    extend: {
      screens: {
        xs: '375px',
        tablet: '768px',
        laptop: '1200px'
      },
      colors: {
        brand: {
          black: '#000000',
          blue: '#1DA1F2',
          yellow: '#1F2937',
          yellowStrong: '#111827',
          gray: {
            50: '#F7F7F7',
            100: '#F0F0F0',
            800: '#202022',
            900: '#18181b',
          }
        },
        gray: {
          800: '#202022',
          900: '#18181b',
          950: '#0d0d10',
        },
        primary: {
          DEFAULT: 'var(--tenant-primary)',
          hover: 'var(--tenant-primary-hover)',
          active: 'var(--tenant-primary-active)',
          foreground: 'var(--tenant-primary-foreground)',
          soft: 'var(--tenant-primary-soft)',
          muted: 'var(--tenant-primary-muted)',
          border: 'var(--tenant-primary-border)',
          ring: 'var(--tenant-primary-ring)',
          glow: 'var(--tenant-primary-glow)',
        },
        'surface-dark': '#1f2026',
        'surface-dark-border': '#2b2d33',
      },
      ringColor: {
        primary: 'var(--tenant-primary-ring)',
      },
      boxShadow: {
        'theme-glow': '0 24px 65px var(--tenant-primary-glow)',
      }
    }
  },
  plugins: []
};

export default config;

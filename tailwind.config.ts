import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#000000',
          blue: '#1DA1F2',
          yellow: '#FCD34D',
          yellowStrong: '#F59E0B',
          gray: {
            50: '#F9FAFB',
            100: '#F3F4F6',
            800: '#1F2937',
            900: '#111827',
          }
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
        }
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

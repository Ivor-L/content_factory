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
          yellow: '#FFD700', // Adjust to match the reference yellow
          gray: {
            50: '#F9FAFB',
            100: '#F3F4F6',
            800: '#1F2937',
            900: '#111827',
          }
        }
      }
    }
  },
  plugins: []
};

export default config;

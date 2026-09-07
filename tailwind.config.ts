import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        surface: '#ffffff',
        canvas: '#f6f7f9',
      },
    },
  },
  plugins: [],
} satisfies Config;

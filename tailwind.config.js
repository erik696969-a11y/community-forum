/** @type {import('tailwindcss').Config} */
// The three DEFAULT brand colors below are env-configurable so a new
// white-label community can re-theme without editing code - set
// NEXT_PUBLIC_BRAND_COLOR_PRIMARY/BACKGROUND/ACCENT in that deployment's
// Vercel env vars. The light/dark variants stay fixed for now (a full
// programmatic palette from one hex is a good future improvement, not
// needed for the first few communities).
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        harbor: {
          DEFAULT: process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY || '#143B4D',
          light: '#1F5468',
          dark: '#0D2833',
        },
        sand: {
          DEFAULT: process.env.NEXT_PUBLIC_BRAND_COLOR_BACKGROUND || '#F4EFE6',
          dark: '#E8E0D0',
        },
        ochre: {
          DEFAULT: process.env.NEXT_PUBLIC_BRAND_COLOR_ACCENT || '#C98A2E',
          light: '#D9A24C',
        },
        sea: {
          DEFAULT: '#5F8F82',
          light: '#8FB8AC',
        },
        ink: '#1F2A2E',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Public Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

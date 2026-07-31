/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        harbor: {
          DEFAULT: '#143B4D',
          light: '#1F5468',
          dark: '#0D2833',
        },
        sand: {
          DEFAULT: '#F4EFE6',
          dark: '#E8E0D0',
        },
        ochre: {
          DEFAULT: '#C98A2E',
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

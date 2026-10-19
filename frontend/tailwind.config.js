/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        comic: {
          50: 'rgb(var(--comic-50-rgb) / <alpha-value>)',
          100: 'rgb(var(--comic-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--comic-200-rgb) / <alpha-value>)',
          700: 'rgb(var(--comic-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--comic-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--comic-900-rgb) / <alpha-value>)',
          950: 'rgb(var(--comic-950-rgb) / <alpha-value>)',
          accent: '#6366f1',
          accentHover: '#4f46e5',
        }
      }
    },
  },
  plugins: [],
}

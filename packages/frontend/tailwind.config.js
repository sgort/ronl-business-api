/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dutch-blue': '#01689b',
        'dutch-orange': '#e17000',
      },
    },
  },
  plugins: [],
}

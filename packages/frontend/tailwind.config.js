/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': 'var(--color-primary, #01689b)',
        'primary-dark': 'var(--color-primary-dark, #014d73)',
        'primary-light': 'var(--color-primary-light, #4da6e0)',
        'secondary': 'var(--color-secondary, #e17000)',
        'accent': 'var(--color-accent, #ff6b00)',
        // Keep these for backwards compatibility
        'dutch-blue': 'var(--color-primary, #01689b)',
        'dutch-orange': 'var(--color-secondary, #e17000)',
      },
    },
  },
  plugins: [],
}
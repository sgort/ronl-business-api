import colors from 'tailwindcss/colors';

const TENANT_SCALES = ['gray', 'slate', 'red', 'green', 'blue', 'amber', 'orange', 'yellow'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const scaleVars = (scale) =>
  Object.fromEntries(SHADES.map((shade) => [shade, `var(--twc-${scale}-${shade})`]));

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
        // Tailwind's scales through CSS variables, so they follow the tenant
        // (#374): defaults and the Flevoland mapping in src/styles/tailwind-palette.css.
        ...Object.fromEntries(TENANT_SCALES.map((scale) => [scale, scaleVars(scale)])),
      },
      // Tailwind derives the default ring colour from blue-500 at 50% alpha,
      // which it cannot do with a var(); without this it falls back to blue-300.
      ringColor: { DEFAULT: colors.blue[500] },
    },
  },
// eslint-disable-next-line no-undef
plugins: [require('@tailwindcss/typography')],
}
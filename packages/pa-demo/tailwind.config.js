/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/*.{js,ts,jsx,tsx}',
    './src/demo/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #01689b)',
        'primary-dark': 'var(--color-primary-dark, #014d73)',
        'primary-light': 'var(--color-primary-light, #4da6e0)',
        secondary: 'var(--color-secondary, #e17000)',
        accent: 'var(--color-accent, #ff6b00)',
        // Keep these for backwards compatibility
        'dutch-blue': 'var(--color-primary, #01689b)',
        'dutch-orange': 'var(--color-secondary, #e17000)',
      },
    },
  },
  // No plugins: packages/frontend's config pulls in @tailwindcss/typography
  // for the `prose` classes McpChatSection.tsx and IouZakenSection.tsx use.
  // Neither file is reachable from here — both are caseworker components that
  // stayed in packages/frontend — and @ronl/pa-cockpit is Tailwind-free by
  // construction (see its src/no-tailwind.test.ts), so nothing this build
  // renders uses `prose`. Adding the plugin dependency for zero consumers
  // isn't worth it on a public, size-conscious bundle.
  plugins: [],
};

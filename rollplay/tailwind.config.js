/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './app/styles/constants.js', // Explicitly include constants file
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          panel: 'var(--surface-panel)',
          elevated: 'var(--surface-elevated)',
        },
        content: {
          primary: 'var(--content-primary)',
          secondary: 'var(--content-secondary)',
          'on-dark': 'var(--content-on-dark)',
          bold: 'var(--content-bold)',
          accent: 'var(--content-accent)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          active: 'var(--border-active)',
          subtle: 'var(--border-subtle)',
        },
        interactive: {
          hover: 'var(--interactive-hover)',
          focus: 'var(--interactive-focus)',
        },
        overlay: {
          dark: 'var(--overlay-dark)',
          light: 'var(--overlay-light)',
        },
        feedback: {
          success: 'var(--feedback-success)',
          error: 'var(--feedback-error)',
          warning: 'var(--feedback-warning)',
          info: 'var(--feedback-info)',
        },
      },
    },
  },
  plugins: [],
}

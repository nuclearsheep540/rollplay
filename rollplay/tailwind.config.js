/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Seat color borders for PlayerCard and AdventureLog
    'border-l-blue-500',
    'border-l-red-500', 
    'border-l-green-500',
    'border-l-orange-500',
    'border-l-purple-500',
    'border-l-cyan-500',
    'border-l-pink-500',
    'border-l-lime-500',
    // Seat color text for AdventureLog
    'text-blue-400',
    'text-red-400',
    'text-green-400', 
    'text-orange-400',
    'text-purple-400',
    'text-cyan-400',
    'text-pink-400',
    'text-lime-400',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}

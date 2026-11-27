/** Palette taken from the TrustShare mockups: royal blue on cool white, navy for the admin panel. */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef4ff', 100: '#dce8ff', 200: '#bfd4ff', 500: '#2f7bff', 600: '#0b63f3', 700: '#0a4fc4' },
        navy: { 700: '#12306b', 800: '#0d2253', 900: '#0a1a42' },
        ink: { DEFAULT: '#0f1b3d', soft: '#4b5878', faint: '#8a95b0' },
        surface: '#f4f7fd',
      },
      boxShadow: { card: '0 1px 2px rgba(15,27,61,.04), 0 4px 16px rgba(15,27,61,.05)' },
    },
  },
  plugins: [],
};

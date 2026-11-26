/** Design tokens for the Office Hours product. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        md: ['15px', '24px'],
        lg: ['17px', '26px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '36px'],
        '4xl': ['40px', '44px'],
        '5xl': ['52px', '56px'],
      },
      colors: {
        ink: {
          50: '#f7f7f6', 100: '#f0f0ee', 150: '#e8e8e5', 200: '#dededa', 300: '#c6c6c0',
          400: '#9c9c95', 500: '#75756f', 600: '#5a5a55', 700: '#41413d', 800: '#2b2b28', 900: '#1c1c1a', 950: '#121211',
        },
        paper: '#fbfaf7',
        pine: {
          50: '#eef6f2', 100: '#d7ebe2', 200: '#b0d7c6', 300: '#7fbca3', 400: '#4f9c80', 500: '#2f8066',
          600: '#226752', 700: '#1c5343', 800: '#184337', 900: '#13362d',
        },
        marigold: { 50: '#fdf6e8', 100: '#faeac5', 200: '#f4d38a', 300: '#eab94f', 400: '#d99d2b', 500: '#b97d1c', 600: '#925f17' },
        cobalt: { 50: '#eff3fd', 100: '#dce5fb', 200: '#bccdf6', 500: '#3d63d4', 600: '#2f4fb3', 700: '#273f8c' },
        brick: { 50: '#fcf0ee', 100: '#f8dcd7', 200: '#efb8ae', 500: '#c2473a', 600: '#a33a2f', 700: '#83302a' },
      },
      borderRadius: { sm: '5px', DEFAULT: '6px', md: '8px', lg: '10px', xl: '14px' },
      boxShadow: {
        xs: '0 1px 0 rgba(18,18,17,0.04)',
        sm: '0 1px 2px rgba(18,18,17,0.06), 0 0 0 1px rgba(18,18,17,0.04)',
        pop: '0 8px 24px -6px rgba(18,18,17,0.18), 0 0 0 1px rgba(18,18,17,0.06)',
        modal: '0 24px 64px -12px rgba(18,18,17,0.30), 0 0 0 1px rgba(18,18,17,0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'rise-in': { from: { opacity: 0, transform: 'translateY(6px) scale(0.99)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'rise-in': 'rise-in 160ms cubic-bezier(0.2,0.8,0.2,1)',
        'slide-in': 'slide-in 180ms cubic-bezier(0.2,0.8,0.2,1)',
      },
    },
  },
  plugins: [],
};

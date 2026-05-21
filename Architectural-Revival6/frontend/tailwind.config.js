/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#F5C518",
        "accent-hover": "#E0B000",
      },
    },
  },
  plugins: [],
};

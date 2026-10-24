import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBFCFD",
        ink: "#1A1D23",
        muted: "#5B6472",
        rule: "#D9DDE3",
        navy: { DEFAULT: "#16294A", soft: "#E8EDF5" },
        burgundy: "#8C2F39",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

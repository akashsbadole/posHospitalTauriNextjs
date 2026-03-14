import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        display: ["Syne", "sans-serif"],
      },
      colors: {
        bg: "#0a0e14",
        surface: "#111620",
        surface2: "#161d2a",
        surface3: "#1c2638",
        border: "#1f2d42",
        border2: "#243348",
        accent: {
          DEFAULT: "#00d4ff",
          dark: "#0099cc",
        },
        success: "#00ff9d",
        warning: "#ffd93d",
        danger: "#ff6b6b",
        purple: "#c77dff",
        muted: "#8899bb",
        subtle: "#4a607a",
      },
      borderRadius: {
        DEFAULT: "12px",
        sm: "8px",
        lg: "16px",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.4)",
        glow: "0 0 20px rgba(0,212,255,0.15)",
      },
    },
  },
  plugins: [],
};

export default config;

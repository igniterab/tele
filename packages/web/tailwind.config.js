import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Softer, less-saturated periwinkle-indigo — calmer than the old punchy blue.
        brand: {
          50: "#f5f6fe",
          100: "#e9ebfb",
          200: "#d6dbf8",
          300: "#b7bff1",
          400: "#949ee8",
          500: "#7b85e0",
          600: "#5f6ad0",
          700: "#4c56b4",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      // Gentler corner rounding across the app (existing rounded-md/lg/xl all soften).
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.125rem",
        "2xl": "1.5rem",
      },
      // Diffuse, low-contrast shadows instead of hard edges.
      boxShadow: {
        sm: "0 1px 2px rgba(30, 41, 59, 0.04), 0 1px 3px rgba(30, 41, 59, 0.05)",
        soft: "0 2px 8px -2px rgba(30, 41, 59, 0.06), 0 6px 20px -6px rgba(30, 41, 59, 0.08)",
        card: "0 1px 3px rgba(30, 41, 59, 0.05), 0 12px 32px -12px rgba(30, 41, 59, 0.12)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out both",
      },
    },
  },
  plugins: [typography],
};

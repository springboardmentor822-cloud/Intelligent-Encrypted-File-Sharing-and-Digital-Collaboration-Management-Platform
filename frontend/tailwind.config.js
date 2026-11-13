export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#060f26", 900: "#0a1a3f", 800: "#102552", 700: "#183268" },
        brand: { 50: "#eef4ff", 100: "#dbe8ff", 200: "#c3d8ff", 400: "#5b9bff", 500: "#2f7bff", 600: "#1666f0", 700: "#0f52c7", 800: "#0d3f9e" },
        lavender: { 50: "#f6f4ff", 100: "#ece7ff", 200: "#ddd4ff", 300: "#c8b8ff", 400: "#a98cff", 500: "#8b6bf5", 600: "#7451e0", 700: "#5f3fc4" },
        violet: { 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed" },
        // Dark-red chart palette — used for every graph/chart in the app.
        chart: { 900: "#450a0a", 800: "#5c0f0f", 700: "#7f1d1d", 600: "#991b1b", 500: "#b91c1c", 400: "#dc2626", 300: "#ef4444", 200: "#f87171" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"] },
      backgroundImage: {
        "grad-hero": "linear-gradient(135deg,#0a1a3f 0%,#102552 32%,#3b2f8f 68%,#8b6bf5 100%)",
        "grad-brand": "linear-gradient(135deg,#1666f0 0%,#7451e0 55%,#a98cff 100%)",
        "grad-soft": "linear-gradient(135deg,#eef4ff 0%,#f6f4ff 50%,#ece7ff 100%)",
        "grad-lav": "linear-gradient(135deg,#c8b8ff 0%,#a98cff 45%,#5b9bff 100%)",
        "grad-mesh": "radial-gradient(at 18% 12%,rgba(139,107,245,.35) 0,transparent 55%),radial-gradient(at 82% 8%,rgba(47,123,255,.30) 0,transparent 50%),radial-gradient(at 60% 92%,rgba(169,140,255,.28) 0,transparent 55%)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,37,82,.04), 0 4px 16px rgba(16,37,82,.06)",
        soft: "0 1px 3px rgba(16,37,82,.05), 0 10px 30px -12px rgba(116,81,224,.18)",
        glow: "0 10px 40px -12px rgba(116,81,224,.45)",
      },
      borderRadius: { "2xl": "1rem", "3xl": "1.5rem" },
      keyframes: {
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        fadein: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: { floaty: "floaty 7s ease-in-out infinite", fadein: "fadein .35s ease-out both" },
    },
  },
};

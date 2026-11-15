export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Every colour is a CSS variable (see src/lib/theme.js), so the theme switcher recolours the whole app.
        brand: { 50: "rgb(var(--brand-50) / <alpha-value>)", 100: "rgb(var(--brand-100) / <alpha-value>)", 200: "rgb(var(--brand-200) / <alpha-value>)", 300: "rgb(var(--brand-300) / <alpha-value>)", 400: "rgb(var(--brand-400) / <alpha-value>)", 500: "rgb(var(--brand-500) / <alpha-value>)", 600: "rgb(var(--brand-600) / <alpha-value>)", 700: "rgb(var(--brand-700) / <alpha-value>)", 800: "rgb(var(--brand-800) / <alpha-value>)", 900: "rgb(var(--brand-900) / <alpha-value>)" },
        ink: { 950: "rgb(var(--ink-950) / <alpha-value>)", 900: "rgb(var(--ink-900) / <alpha-value>)", 800: "rgb(var(--ink-800) / <alpha-value>)", 700: "rgb(var(--ink-700) / <alpha-value>)", 600: "rgb(var(--ink-600) / <alpha-value>)" },
        paper: { 50: "rgb(var(--paper-50) / <alpha-value>)", 100: "rgb(var(--paper-100) / <alpha-value>)", 200: "rgb(var(--paper-200) / <alpha-value>)", 300: "rgb(var(--paper-300) / <alpha-value>)" },
        wax: { 400: "rgb(var(--wax-400) / <alpha-value>)", 500: "rgb(var(--wax-500) / <alpha-value>)", 600: "rgb(var(--wax-600) / <alpha-value>)" },
        amber2: "#f5b544",
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(18px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        blink: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.2 } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(400%)" } },
        pulse2: { "0%": { boxShadow: "0 0 0 0 rgba(47,109,246,.55)" }, "100%": { boxShadow: "0 0 0 10px rgba(47,109,246,0)" } },
        sweep: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
        sweepRev: { "0%": { transform: "rotate(360deg)" }, "100%": { transform: "rotate(0deg)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        drift: { "0%,100%": { transform: "translate(0,0) scale(1)" }, "50%": { transform: "translate(30px,-20px) scale(1.15)" } },
      },
      animation: {
        "fade-up": "fade-up .7s ease-out both",
        float: "float 6s ease-in-out infinite",
        blink: "blink 1.6s ease-in-out infinite",
        scan: "scan 3.5s linear infinite",
        pulse2: "pulse2 1.8s ease-out infinite",
        sweep: "sweep 6s linear infinite",
        "sweep-slow": "sweep 22s linear infinite",
        "sweep-rev": "sweepRev 30s linear infinite",
        floaty: "floaty 5s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        drift: "drift 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

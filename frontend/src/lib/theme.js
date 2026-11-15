// Colour themes. Every colour in the app comes from CSS variables, so switching a theme changes the whole UI at once.
// `C` holds the current theme's main chart colours (charts need real colour values, not CSS classes).
import { create } from "zustand";

export const THEMES = {
 "aurora": {
  "name": "Aurora",
  "sub": "Violet + coral",
  "swatch": [
   "#7c3aed",
   "#ff4d6d",
   "#130a31"
  ],
  "vars": {
   "brand-50": "245 240 255",
   "brand-100": "235 224 255",
   "brand-200": "214 192 255",
   "brand-300": "185 150 255",
   "brand-400": "154 105 251",
   "brand-500": "124 58 237",
   "brand-600": "107 43 217",
   "brand-700": "88 34 181",
   "brand-800": "71 29 146",
   "brand-900": "57 26 115",
   "ink-950": "12 7 32",
   "ink-900": "19 10 49",
   "ink-800": "28 16 70",
   "ink-700": "42 26 100",
   "ink-600": "59 42 133",
   "paper-50": "253 251 255",
   "paper-100": "246 242 253",
   "paper-200": "235 228 247",
   "paper-300": "217 205 239",
   "wax-400": "255 122 147",
   "wax-500": "255 77 109",
   "wax-600": "224 45 79"
  },
  "colors": {
   "primary": "#7c3aed",
   "primaryRgb": "124,58,237",
   "primarySoft": "#a78bfa",
   "accent": "#ff4d6d"
  }
 },
 "ocean": {
  "name": "Ocean",
  "sub": "Blue + red",
  "swatch": [
   "#1d5cea",
   "#e5484d",
   "#0a1f4a"
  ],
  "vars": {
   "brand-50": "238 244 255",
   "brand-100": "220 232 255",
   "brand-200": "188 211 255",
   "brand-300": "141 180 255",
   "brand-400": "91 144 251",
   "brand-500": "47 109 246",
   "brand-600": "29 92 234",
   "brand-700": "23 73 192",
   "brand-800": "23 60 151",
   "brand-900": "24 50 122",
   "ink-950": "6 20 47",
   "ink-900": "10 31 74",
   "ink-800": "16 42 96",
   "ink-700": "25 56 115",
   "ink-600": "36 74 141",
   "paper-50": "248 250 253",
   "paper-100": "241 245 251",
   "paper-200": "226 233 244",
   "paper-300": "205 215 232",
   "wax-400": "242 104 109",
   "wax-500": "229 72 77",
   "wax-600": "201 50 56"
  },
  "colors": {
   "primary": "#1d5cea",
   "primaryRgb": "29,92,234",
   "primarySoft": "#5b90fb",
   "accent": "#e5484d"
  }
 },
 "emerald": {
  "name": "Emerald",
  "sub": "Green + amber",
  "swatch": [
   "#059669",
   "#f59e0b",
   "#062219"
  ],
  "vars": {
   "brand-50": "236 253 245",
   "brand-100": "209 250 229",
   "brand-200": "167 243 208",
   "brand-300": "110 231 183",
   "brand-400": "52 211 153",
   "brand-500": "16 185 129",
   "brand-600": "5 150 105",
   "brand-700": "4 120 87",
   "brand-800": "6 95 70",
   "brand-900": "6 78 59",
   "ink-950": "3 18 13",
   "ink-900": "6 34 25",
   "ink-800": "10 50 38",
   "ink-700": "16 70 58",
   "ink-600": "26 95 80",
   "paper-50": "250 253 251",
   "paper-100": "241 248 244",
   "paper-200": "224 238 230",
   "paper-300": "200 222 209",
   "wax-400": "251 191 36",
   "wax-500": "245 158 11",
   "wax-600": "217 119 6"
  },
  "colors": {
   "primary": "#059669",
   "primaryRgb": "5,150,105",
   "primarySoft": "#34d399",
   "accent": "#f59e0b"
  }
 },
 "sunset": {
  "name": "Sunset",
  "sub": "Orange + pink",
  "swatch": [
   "#e44210",
   "#ec4899",
   "#2a0f1c"
  ],
  "vars": {
   "brand-50": "255 244 237",
   "brand-100": "255 230 213",
   "brand-200": "255 202 168",
   "brand-300": "255 165 112",
   "brand-400": "255 125 61",
   "brand-500": "249 89 26",
   "brand-600": "228 66 16",
   "brand-700": "188 49 16",
   "brand-800": "150 43 20",
   "brand-900": "122 40 20",
   "ink-950": "26 10 16",
   "ink-900": "42 15 28",
   "ink-800": "61 20 40",
   "ink-700": "86 28 53",
   "ink-600": "115 40 70",
   "paper-50": "255 252 250",
   "paper-100": "251 245 241",
   "paper-200": "242 230 223",
   "paper-300": "229 211 200",
   "wax-400": "244 114 182",
   "wax-500": "236 72 153",
   "wax-600": "219 39 119"
  },
  "colors": {
   "primary": "#e44210",
   "primaryRgb": "228,66,16",
   "primarySoft": "#ff7d3d",
   "accent": "#ec4899"
  }
 }
};

export const C = { ...THEMES.aurora.colors };

function apply(id) {
  const t = THEMES[id] || THEMES.aurora;
  const root = document.documentElement;
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  root.dataset.theme = id;
  Object.assign(C, t.colors);
}

const saved = (() => { try { return localStorage.getItem("trustshare-theme") || "aurora"; } catch { return "aurora"; } })();
apply(THEMES[saved] ? saved : "aurora");

export const useTheme = create((set) => ({
  theme: THEMES[saved] ? saved : "aurora",
  setTheme: (id) => {
    apply(id);
    try { localStorage.setItem("trustshare-theme", id); } catch { /* private mode: just do not remember it */ }
    set({ theme: id });
  },
}));

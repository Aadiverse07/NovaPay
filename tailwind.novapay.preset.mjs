/* Tailwind v3.4.1+ preset (ESM). Use: import novapayPreset from './tailwind.novapay.preset.mjs'; presets: [novapayPreset]
   CommonJS projects can use tailwind.novapay.preset.cjs instead.
   Tailwind v4: skip this file; add to your CSS:  @custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
   and map tokens with @theme inline. Colors reference CSS variables, so light/dark switch automatically. */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", surface: "var(--surface)", border: "var(--border)",
        ink: "var(--text)", muted: "var(--text-muted)", subtle: "var(--text-subtle)",
        brand: { blue: "var(--brand-blue)", violet: "var(--brand-violet)" },
        ok: { DEFAULT: "var(--ok)", text: "var(--ok-text)", soft: "var(--ok-soft)" },
        danger: { DEFAULT: "var(--danger)", text: "var(--danger-text)", soft: "var(--danger-soft)" },
        warn: { DEFAULT: "var(--warn)", text: "var(--warn-text)", soft: "var(--warn-soft)" },
        info: { DEFAULT: "var(--info)", text: "var(--info-text)", soft: "var(--info-soft)" },
      },
      borderRadius: { sm: "12px", md: "16px", lg: "20px" },
      boxShadow: { card: "var(--shadow-md)", float: "var(--shadow-lg)" },
      fontFamily: { sans: ["Montserrat", "Segoe UI", "Helvetica Neue", "Arial", "system-ui", "sans-serif"], display: ["Montserrat", "Segoe UI", "Helvetica Neue", "Arial", "system-ui", "sans-serif"] },
      backgroundImage: { brand: "var(--brand-gradient)" },
    },
  },
};

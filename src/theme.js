/* NovaPay theme controller (ES module, framework-agnostic).
   - Resolves saved choice -> OS preference, ALWAYS writes data-theme on <html>
     (so Tailwind/CSS selectors work the same either way).
   - Persists only an explicit user choice; follows live OS changes until then.
   - Inline THEME_BOOTSTRAP in <head> (before CSS) to avoid a flash on first paint. */
export const THEME_KEY = "novapay-theme";

export const THEME_BOOTSTRAP =
  `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}` +
  `if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";` +
  `d.setAttribute("data-theme",t);})();`;

const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const saved = () => { try { const t = localStorage.getItem(THEME_KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

export function getTheme() { return saved() ?? (media().matches ? "dark" : "light"); }

function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
  m.content = theme === "dark" ? "#0b0818" : "#f6f8ff";
  document.dispatchEvent(new CustomEvent("novapay:theme", { detail: theme }));
}

export function setTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  apply(theme);
}

export function initThemeToggle(button) {
  const sync = () => {
    const dark = getTheme() === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  };
  apply(getTheme());
  button.addEventListener("click", () => { setTheme(getTheme() === "dark" ? "light" : "dark"); sync(); });
  media().addEventListener("change", () => { if (!saved()) { apply(getTheme()); sync(); } });
  sync();
}

/* NovaPay shared chart theme helper — framework-agnostic. */
(function () {
  "use strict";

  var THEMES = {
    light: {
      background: "#ffffff",
      axisText: "#52667d",
      grid: "#d8e2ee",
      series: { in: "#138c62", out: "#d84354", net: "#2563eb" },
      tooltip: { background: "#ffffff", text: "#14263d", border: "#d8e2ee", shadow: "rgba(21,57,99,.14)" },
      area: { in: "#31b887", net: "#5c8df0" },
      cursor: "rgba(37,99,235,.42)"
    },
    dark: {
      background: "#0d1d30",
      axisText: "#afc1d5",
      grid: "rgba(160,190,220,.16)",
      series: { in: "#35c98a", out: "#f06472", net: "#79aaff" },
      tooltip: { background: "#0b1a2b", text: "#eef5fc", border: "#29415a", shadow: "rgba(0,0,0,.35)" },
      area: { in: "#35c98a", net: "#79aaff" },
      cursor: "rgba(121,170,255,.6)"
    }
  };

  function getChartTheme() {
    var active = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    return THEMES[active];
  }

  function onChange(callback) {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === "data-theme") {
          callback(getChartTheme());
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return function () { observer.disconnect(); };
  }

  window.NovaPayChartTheme = { get: getChartTheme, onChange: onChange };
})();

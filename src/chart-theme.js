/* NovaPay shared chart theme helper — framework-agnostic. */
(function () {
  "use strict";

  var THEMES = {
    light: {
      background: "#ffffff",
      axisText: "#53627f",
      grid: "#dfe5f2",
      series: { in: "#149b73", out: "#d94a63", net: "#416bd8" },
      tooltip: { background: "#ffffff", text: "#0b1b4b", border: "#d8e0ef", shadow: "rgba(20,36,72,.14)" },
      area: { in: "#18b68a", net: "#4e76e9" },
      cursor: "rgba(65,107,216,.42)"
    },
    dark: {
      background: "#120d2a",
      axisText: "#c4b9ea",
      grid: "rgba(210,170,255,.16)",
      series: { in: "#5dffb4", out: "#ff6fa8", net: "#8fdcff" },
      tooltip: { background: "#0e0922", text: "#fbf7ff", border: "#5a4296", shadow: "rgba(190,130,255,.35)" },
      area: { in: "#5dffb4", net: "#8fdcff" },
      cursor: "rgba(240,198,255,.6)"
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

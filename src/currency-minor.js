(function (root) {
  "use strict";
  root.NovaPayCurrency = root.NovaPayCurrency || {};
  root.NovaPayCurrency.majorToMinor = function (major, currency) {
    var value = Number(major), code = String(currency || "").toUpperCase();
    if (!Number.isFinite(value) || value <= 0 || !/^[A-Z]{3}$/.test(code)) throw new Error("Enter a valid positive amount and currency.");
    var digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
    var minor = Math.round(value * Math.pow(10, digits));
    if (!Number.isSafeInteger(minor) || minor < 1) throw new Error("Amount is outside the supported range.");
    return minor;
  };
}(globalThis));

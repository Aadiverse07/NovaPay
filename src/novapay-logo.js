/* NovaPay brand mark component using the supplied NovaPay logo artwork. */
(function () {
  if (customElements.get('novapay-logo')) return;
  class NovaPayLogo extends HTMLElement {
    static get observedAttributes() { return ['size', 'variant']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      var size = Number(this.getAttribute('size')) || 32;
      var variant = this.getAttribute('variant') || 'default';
      this.setAttribute('role', 'img');
      this.setAttribute('aria-label', variant === 'mark' ? 'NovaPay' : 'NovaPay logo');
      this.innerHTML = '<img class="novapay-logo-svg novapay-logo-svg--' + variant + '" src="assets/novapay-mark.png" width="' + size + '" height="' + Math.round(size * 1.05) + '" alt="" aria-hidden="true" style="display:block;object-fit:contain;max-width:100%;">';
    }
  }
  customElements.define('novapay-logo', NovaPayLogo);
  window.NovaPayLogo = function (size, variant) {
    var el = document.createElement('novapay-logo');
    el.setAttribute('size', String(size || 32));
    if (variant) el.setAttribute('variant', variant);
    return el;
  };
}());

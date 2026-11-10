import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const data = require('../../src/dashboard-data.js');
const liveSource = await readFile(new URL('../../src/dashboard-live-data.js', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
const heroCss = await readFile(new URL('../../src/hero-scene.css', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.children = [];
    this.attributes = Object.create(null);
    this.style = { removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } };
    this.parentElement = { hidden: false };
    this.hidden = false;
    this.dataset = {};
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}

test('live cash chart resets demo animation, draws axes, and shows one monthly point', async () => {
  const elements = Object.create(null);
  const byId = (id) => elements[id] || (elements[id] = new Element());
  for (const id of ['cash-in-line', 'cash-out-line', 'cash-net-line']) {
    byId(id).style.strokeDasharray = '420';
    byId(id).style.strokeDashoffset = '420';
    byId(id).style.transition = 'stroke-dashoffset 900ms';
    byId(id).setAttribute('d', 'M14 50 L886 100');
  }
  byId('cf-grid').appendChild(new Element());
  byId('cf-y').appendChild(new Element());

  const recent = new Element(), subtitle = new Element(), health = new Element();
  health.querySelector = (selector) => selector === '[data-health-value]' ? byId('health-value') : selector === '.health-segment-main' ? byId('health-segment') : selector === '.health-callout' ? byId('health-caption') : null;
  const document = {
    getElementById: byId,
    querySelector(selector) {
      if (selector === '#cashflow-tabs button.active') return { dataset: { range: 'month' } };
      if (selector === '.recent-card tbody') return recent;
      if (selector === '.recent-card .card-heading p') return subtitle;
      if (selector === '.financial-health-card') return health;
      return null;
    },
    querySelectorAll() { return []; },
    createElement() { return new Element(); },
    createElementNS() { return new Element(); },
    createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
    addEventListener() {},
    dispatchEvent() {}
  };
  const requests = [];
  const responses = {
    'profit-and-loss': { rows: [] }, fees: { rows: [] }, refunds: { rows: [] },
    'cash-flow-series': { rows: [{ period: '2026-11', currency: 'USD', money_in_minor: '15000', money_out_minor: '2500', net_minor: '12500' }] },
    failures: { failures: [] },
    transactions: { transactions: [] }, failures: { failures: [] }
  };
  const window = {
    NovaPayAuth: { mode: 'supabase', ready: Promise.resolve(), isAuthenticated: () => true },
    NovaPayDashboardData: data,
    NovaPayApi: { request(path) { requests.push(path); return Promise.resolve(responses[Object.keys(responses).find((name) => path.includes(name))]); } },
    addEventListener() {}
  };
  vm.runInNewContext(liveSource, { window, document, location: { hash: '#dashboard' }, console, Date, Intl, Math, Number, Promise });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const path = byId('cash-net-line').attributes.d;
  assert.match(path, /^M450\.0 [\d.]+$/);
  for (const id of ['cash-in-line', 'cash-out-line', 'cash-net-line']) {
    assert.equal(byId(id).style.strokeDasharray, undefined);
    assert.equal(byId(id).style.strokeDashoffset, undefined);
    assert.equal(byId(id).style.transition, undefined);
  }
  assert.equal(byId('cf-grid').children.length, 5);
  assert.equal(byId('cf-y').children.length, 5);
  assert.match(byId('cf-y').children[0].textContent, /\$/);
  assert.ok(requests.some((path) => path.includes('/api/reports/cash-flow-series')));
});

test('cashflow sample renderer is gated at call time and Sandbox sizing follows the container', () => {
  assert.match(dashboardSource, /function renderCashflow\(range, animate\)\{\s*if\(window\.NovaPayAuth&&window\.NovaPayAuth\.mode==="supabase"\)return/);
  assert.match(heroCss, /\.hs-paypal \.hs-recv strong\{font-size:1em;max-width:calc\(100% - 2\.4em\);white-space:normal;overflow-wrap:normal\}/);
  assert.doesNotMatch(heroCss, /\.hs-paypal \.hs-recv strong\{[^}]*\b\d+(?:\.\d+)?vw/);
});

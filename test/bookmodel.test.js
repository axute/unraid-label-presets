// Run: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/bookmodel.js');
const traefik = require('../catalog/traefik.json');

const container = {
  name: 'zipboom', webui: 'http://[IP]:[PORT:80]/', icon: '', overview: '', network: 'bridge', driver: 'bridge',
  ip: '', extraParams: '', ports: [{ target: '80', value: '8088' }]
};
const zipboomLabels = [
  { num: 2, key: 'traefik.enable', value: 'true' },
  { num: 4, key: 'traefik.http.routers.zipboom.priority', value: '1' },
  { num: 6, key: 'traefik.http.routers.zipboom.rule', value: 'PathPrefix(`/`)' },
  { num: 8, key: 'traefik.http.services.zipboom.loadbalancer.server.port', value: '80' }
];
const settings = { globals: { DOMAIN: 'example.de', TRAEFIK_ENTRYPOINT: 'websecure' }, defaultDisplay: 'advanced' };

function state(labels, extra, s) {
  return M.createState(traefik, { formLabels: labels, extraLabels: extra || [], container, env: { serverHost: 'tower' }, settings: s || settings });
}
function find(st, key) {
  for (const g of M.rows(st)) for (const r of g.rows) if (r.key === key) return r;
  return null;
}

test('serviceStats counts prefix labels and found namespaces', () => {
  assert.deepEqual(M.serviceStats(traefik, zipboomLabels, 'zipboom'), { labels: 4, namespaces: 1 });
  assert.deepEqual(M.serviceStats(traefik, [], 'zipboom'), { labels: 0, namespaces: 0 });
});

test('existing labels: status and preselection', () => {
  const st = state(zipboomLabels);
  const rule = find(st, 'traefik.http.routers.zipboom.rule');
  assert.equal(rule.status, 'abweichend');
  assert.equal(rule.value, 'PathPrefix(`/`)');
  assert.equal(rule.proposed, 'Host(`zipboom.example.de`)');
  assert.equal(rule.checked, true);
  const port = find(st, 'traefik.http.services.zipboom.loadbalancer.server.port');
  assert.equal(port.status, 'vorhanden');
  assert.match(port.source, /aus WebUI: 80/);
  const ep = find(st, 'traefik.http.routers.zipboom.entrypoints');
  assert.equal(ep.status, 'neu');
  assert.equal(ep.checked, true);
  assert.equal(ep.value, 'websecure');
  const mw = find(st, 'traefik.http.routers.zipboom.middlewares');
  assert.equal(mw.checked, false);
});

test('plan without changes by user: adds recommended, keeps existing values', () => {
  const p = M.plan(state(zipboomLabels));
  assert.deepEqual(p.add.map((a) => a.key).sort(), [
    'traefik.http.routers.zipboom.entrypoints', 'traefik.http.routers.zipboom.service'
  ]);
  assert.equal(p.add.find((a) => a.key.endsWith('.service')).value, 'zipboom');
  assert.equal(p.add[0].display, 'advanced');
  assert.match(p.add[0].name, /^Traefik: /);
  assert.deepEqual(p.update, []);
  assert.deepEqual(p.remove, []);
  assert.deepEqual(p.errors, []);
});

test('unknown catalog label (priority) is kept: not in plan', () => {
  // priority is in the catalog; existing -> checked -> untouched
  const p = M.plan(state(zipboomLabels));
  assert.ok(!p.remove.some((r) => r.key.endsWith('.priority')));
});

test('unchecking an existing label removes it', () => {
  const st = state(zipboomLabels);
  const rule = find(st, 'traefik.http.routers.zipboom.rule');
  M.setChecked(st, rule.id, false);
  const p = M.plan(st);
  assert.deepEqual(p.remove, [{ num: 6, key: 'traefik.http.routers.zipboom.rule', value: 'PathPrefix(`/`)' }]);
});

test('taking over the proposal updates the row', () => {
  const st = state(zipboomLabels);
  const rule = find(st, 'traefik.http.routers.zipboom.rule');
  M.setValue(st, rule.id, rule.proposed);
  const p = M.plan(st);
  assert.deepEqual(p.update, [{ num: 6, key: 'traefik.http.routers.zipboom.rule', value: 'Host(`zipboom.example.de`)', old: 'PathPrefix(`/`)' }]);
});

test('missing global blocks only rows that need it', () => {
  const st = state([], [], { globals: {}, defaultDisplay: 'advanced' });
  const p = M.plan(st);
  const keys = p.errors.map((e) => e.key).sort();
  assert.deepEqual(keys, ['traefik.http.routers.zipboom.entrypoints', 'traefik.http.routers.zipboom.rule']);
  assert.match(p.errors[0].error, /Variable fehlt/);
  st.globalsOverride.DOMAIN = 'lan';
  st.globalsOverride.TRAEFIK_ENTRYPOINT = 'web';
  assert.deepEqual(M.plan(st).errors, []);
});

test('asked variable per namespace, live proposal', () => {
  const st = state([]);
  const ns = M.activeNs(st);
  M.setAsked(st, ns, 'SUBDOMAIN', 'files');
  assert.equal(find(st, 'traefik.http.routers.zipboom.rule').value, 'Host(`files.example.de`)');
  const av = M.askedVars(st, ns);
  assert.deepEqual(av.map((v) => [v.id, v.value, v.touched]), [['SUBDOMAIN', 'files', true]]);
});

test('second namespace: added, own rows, all applied together', () => {
  const st = state(zipboomLabels);
  assert.equal(M.addNamespace(st, 'Zipboom.API').ok, true);
  assert.equal(M.activeNs(st).key, 'zipboom-api');
  assert.equal(M.addNamespace(st, 'zipboom-api').ok, false);
  const p = M.plan(st);
  const apiKeys = p.add.filter((a) => a.key.includes('.zipboom-api.')).map((a) => a.key).sort();
  assert.deepEqual(apiKeys, [
    'traefik.http.routers.zipboom-api.entrypoints', 'traefik.http.routers.zipboom-api.rule',
    'traefik.http.routers.zipboom-api.service', 'traefik.http.services.zipboom-api.loadbalancer.server.port'
  ]);
  assert.equal(p.add.find((a) => a.key.endsWith('zipboom-api.rule')).value, 'Host(`zipboom-api.example.de`)');
  assert.match(p.add.find((a) => a.key.endsWith('zipboom-api.rule')).name, /\(zipboom-api\)$/);
  // traefik.enable is container scope: present once, not duplicated
  assert.equal(p.add.filter((a) => a.key === 'traefik.enable').length, 0);
});

test('validation: port and number', () => {
  const st = state([]);
  const port = find(st, 'traefik.http.services.zipboom.loadbalancer.server.port');
  M.setValue(st, port.id, '70000');
  assert.equal(find(st, port.key).error, 'Port 1–65535 erwartet');
  const prio = find(st, 'traefik.http.routers.zipboom.priority');
  M.setChecked(st, prio.id, true);
  M.setValue(st, prio.id, 'x');
  assert.equal(find(st, prio.key).error, 'ganze Zahl erwartet');
  assert.equal(M.plan(st).add.some((a) => a.key === port.key), false);
});

test('extra params label: not preselected, warning when checked', () => {
  const st = state([], [{ key: 'traefik.enable', value: 'true' }]);
  const en = find(st, 'traefik.enable');
  assert.equal(en.status, 'extra');
  assert.equal(en.checked, false);
  M.setChecked(st, en.id, true);
  assert.ok(M.plan(st).warnings.some((w) => w.key === 'traefik.enable' && /Extra Parameters/.test(w.text)));
});

test('xss warning', () => {
  const st = state([]);
  const mw = find(st, 'traefik.http.routers.zipboom.middlewares');
  M.setChecked(st, mw.id, true);
  M.setValue(st, mw.id, 'a<b');
  assert.ok(M.plan(st).warnings.some((w) => /kommt an als „ab“/.test(w.text)));
});

test('display toggle overrides', () => {
  const st = state([]);
  M.setDisplay(st, 'always');
  assert.ok(M.plan(st).add.every((a) => a.display === 'always'));
});

test('unknownLabels lists prefix labels outside the catalog', () => {
  const st = state([...zipboomLabels, { num: 10, key: 'traefik.http.routers.zipboom.tls.options', value: 'x' }, { num: 12, key: 'other', value: '1' }]);
  assert.deepEqual(M.unknownLabels(st).map((l) => l.key), ['traefik.http.routers.zipboom.tls.options']);
});

test('empty container name: no namespace, name kind', () => {
  const st = M.createState(traefik, { formLabels: [], extraLabels: [], container: { ...container, name: '' }, env: {}, settings });
  assert.equal(st.namespaces[0].key, '');
});

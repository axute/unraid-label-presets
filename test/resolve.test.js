// Run: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../js/resolve.js');

// ------------------------------------------------------------ catalogs used in tests

const traefik = {
  id: 'traefik', namespace: 'name',
  groups: [
    { name: 'Basis', scope: 'container', labels: [{ key: 'traefik.enable', value: 'true' }] },
    { name: 'Routing', scope: 'namespace', labels: [
      { key: 'traefik.http.routers.${NS_KEY}.rule', value: 'Host(`${SUBDOMAIN}.${DOMAIN}`)' },
      { key: 'traefik.http.services.${NS_KEY}.loadbalancer.server.port', value: '${WEBUI_PORT}' }
    ] }
  ]
};

const docktail = {
  id: 'docktail', namespace: 'index', nameKey: 'docktail.service.${NS_KEY}name',
  groups: [
    { name: 'Basis', scope: 'container', labels: [{ key: 'docktail.service.enable', value: 'true' }] },
    { name: 'Dienst', scope: 'namespace', labels: [
      { key: 'docktail.service.${NS_KEY}name', value: '${NS}' },
      { key: 'docktail.service.${NS_KEY}port', value: '${WEBUI_PORT}' }
    ] }
  ]
};

const splitCat = {
  id: 'test', namespace: 'split', separator: ';', nameKey: 'test.name',
  groups: [
    { name: 'Basis', scope: 'container', labels: [{ key: 'test.type', value: 'app' }] },
    { name: 'App', scope: 'split', labels: [
      { key: 'test.name', value: '${NS}' }, { key: 'test.url', value: '${WEBUI_URL}' }
    ] }
  ]
};

const L = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));

// ------------------------------------------------------------ names

test('sanitizeNs', () => {
  assert.equal(r.sanitizeNs('Immich.Server_2'), 'immich-server-2');
  assert.equal(r.sanitizeNs('lp-test.dev'), 'lp-test-dev');
  assert.equal(r.sanitizeNs('..A..b..'), 'a-b');
  assert.equal(r.sanitizeNs(''), '');
  assert.equal(r.sanitizeNs('a  b--c'), 'a-b-c');
});

// ------------------------------------------------------------ WebUI and auto vars

test('parseWebUI', () => {
  assert.deepEqual(r.parseWebUI('http://[IP]:[PORT:8080]/admin'),
    { scheme: 'http', port: '8080', path: '/admin', raw: 'http://[IP]:[PORT:8080]/admin' });
  assert.equal(r.parseWebUI('https://[IP]:[PORT:443]').path, '');
  assert.equal(r.parseWebUI('').port, '');
});

const base = {
  name: 'Immich.Server', webui: 'http://[IP]:[PORT:2283]/', icon: 'https://x/icon.png',
  overview: '<b>Photos</b> app<br>second line', network: 'bridge', driver: 'bridge', ip: '',
  extraParams: '', ports: [{ target: '2283', value: '8283', mode: 'tcp' }, { target: '9000', value: '9000' }]
};

test('autoVars on bridge maps host port', () => {
  const { vars, sources } = r.autoVars(base, { serverHost: 'tower.local' });
  assert.equal(vars.CONTAINER_NAME, 'Immich.Server');
  assert.equal(vars.CONTAINER_NAME_LOWER, 'immich.server');
  assert.equal(vars.NS, 'immich-server');
  assert.equal(vars.WEBUI_PORT, '2283');
  assert.equal(sources.WEBUI_PORT, 'aus WebUI');
  assert.equal(vars.WEBUI_HOST_PORT, '8283');
  assert.equal(vars.WEBUI_URL, 'http://tower.local:8283/');
  assert.equal(vars.OVERVIEW, 'Photos app');
  assert.equal(vars.SERVER_IP, 'tower.local');
  assert.equal(vars.IP, undefined);
});

test('autoVars on ipvlan with fixed IP uses container IP and port', () => {
  const { vars } = r.autoVars({ ...base, network: 'br0', driver: 'ipvlan', ip: '192.168.1.50' }, { serverHost: 'tower' });
  assert.equal(vars.WEBUI_HOST_PORT, '2283');
  assert.equal(vars.WEBUI_URL, 'http://192.168.1.50:2283/');
});

test('autoVars on host network: no mapping', () => {
  const { vars, sources } = r.autoVars({ ...base, network: 'host', driver: 'host' }, { serverHost: 'tower' });
  assert.equal(vars.WEBUI_HOST_PORT, '2283');
  assert.match(sources.WEBUI_HOST_PORT, /ohne Mapping/);
});

test('autoVars without WebUI falls back to first port row', () => {
  const { vars, sources } = r.autoVars({ ...base, webui: '' }, {});
  assert.equal(vars.WEBUI_PORT, '2283');
  assert.equal(sources.WEBUI_PORT, 'erste Port-Zeile');
  assert.equal(vars.WEBUI_URL, undefined);
});

test('autoVars without ports or WebUI leaves WEBUI_PORT unset', () => {
  const { vars } = r.autoVars({ name: 'x', ports: [] }, {});
  assert.equal(vars.WEBUI_PORT, undefined);
  assert.equal(vars.WEBUI_HOST_PORT, undefined);
});

test('autoVars with unmapped WebUI port leaves host port unset', () => {
  const { vars } = r.autoVars({ ...base, webui: 'http://[IP]:[PORT:1234]/' }, { serverHost: 't' });
  assert.equal(vars.WEBUI_PORT, '1234');
  assert.equal(vars.WEBUI_HOST_PORT, undefined);
  assert.equal(vars.WEBUI_URL, undefined);
});

test('autoVars with empty name', () => {
  const { vars } = r.autoVars({ name: '' }, {});
  assert.equal(vars.NS, undefined);
});

// ------------------------------------------------------------ resolve

test('resolve nested and missing', () => {
  const vars = r.merge({ DOMAIN: 'example.de' }, { NS: 'immich' }, { SUBDOMAIN: '${NS}' });
  assert.deepEqual(r.resolve('Host(`${SUBDOMAIN}.${DOMAIN}`)', vars), { value: 'Host(`immich.example.de`)', missing: [], cycles: [] });
  const m = r.resolve('${WEBUI_PORT}', vars);
  assert.equal(m.value, '${WEBUI_PORT}');
  assert.deepEqual(m.missing, ['WEBUI_PORT']);
});

test('resolve detects cycles', () => {
  const res = r.resolve('${A}', { A: '${B}', B: '${A}' });
  assert.deepEqual(res.cycles, ['A']);
});

test('resolve keeps $ and backticks and other text', () => {
  assert.equal(r.resolve('$x ${} {0} `a`', {}).value, '$x ${} {0} `a`');
});

test('merge: later layer wins, null ignored', () => {
  assert.deepEqual(r.merge({ A: '1', B: '1' }, { B: '2', C: null }), { A: '1', B: '2' });
});

test('varsIn', () => {
  assert.deepEqual(r.varsIn('${A}-${B}-${A}'), ['A', 'B']);
});

// ------------------------------------------------------------ name namespaces

test('keyFor name kind', () => {
  assert.equal(r.keyFor('traefik.http.routers.${NS_KEY}.rule', 'name', { key: 'immich' }), 'traefik.http.routers.immich.rule');
});

test('detectNamespaces name: primary first, others found', () => {
  const labels = L({
    'traefik.enable': 'true',
    'traefik.http.routers.immich-api.rule': 'x',
    'traefik.http.routers.immich-server.rule': 'y',
    'traefik.http.routers.zeta.rule': 'z',
    'traefik.http.routers.zeta.priority': '1', // not in catalog: ignored for detection
    'other.label': 'x'
  });
  const ns = r.detectNamespaces(traefik, labels, 'Immich.Server');
  assert.deepEqual(ns.map((n) => [n.key, n.primary, n.found]),
    [['immich-server', true, true], ['immich-api', false, true], ['zeta', false, true]]);
});

test('detectNamespaces name: primary present even without labels', () => {
  const ns = r.detectNamespaces(traefik, [], 'zipboom');
  assert.deepEqual(ns, [{ key: 'zipboom', index: null, name: 'zipboom', primary: true, found: false }]);
});

test('detectNamespaces name: real zipboom labels', () => {
  const labels = L({
    'traefik.enable': 'true', 'traefik.http.routers.zipboom.priority': '1',
    'traefik.http.routers.zipboom.rule': 'PathPrefix(`/`)',
    'traefik.http.services.zipboom.loadbalancer.server.port': '80'
  });
  const ns = r.detectNamespaces(traefik, labels, 'zipboom');
  assert.equal(ns.length, 1);
  assert.equal(ns[0].found, true);
});

test('newNamespace sanitizes and rejects duplicates', () => {
  const existing = [{ key: 'immich' }];
  assert.deepEqual(r.newNamespace('Immich.API', existing), { ok: true, key: 'immich-api' });
  assert.equal(r.newNamespace('IMMICH', existing).ok, false);
  assert.equal(r.newNamespace('...', existing).error, 'leer');
});

// ------------------------------------------------------------ index namespaces

test('keyFor index kind', () => {
  assert.equal(r.keyFor('docktail.service.${NS_KEY}port', 'index', { index: '' }), 'docktail.service.port');
  assert.equal(r.keyFor('docktail.service.${NS_KEY}port', 'index', { index: '2' }), 'docktail.service.2.port');
});

test('detectNamespaces index: names from name label, gaps kept', () => {
  const labels = L({
    'docktail.service.enable': 'true',
    'docktail.service.name': 'qbittorrent', 'docktail.service.port': '8000',
    'docktail.service.2.name': 'bitmagnet', 'docktail.service.2.port': '8001',
    'docktail.service.10.port': '9000'
  });
  const ns = r.detectNamespaces(docktail, labels, 'qbit');
  assert.deepEqual(ns.map((n) => [n.index, n.name, n.found]),
    [['', 'qbittorrent', true], ['2', 'bitmagnet', true], ['10', '#10', true]]);
  assert.equal(r.nextIndex(ns), '11');
});

test('detectNamespaces index: empty -> primary from container name', () => {
  const ns = r.detectNamespaces(docktail, [], 'qbit');
  assert.deepEqual(ns.map((n) => [n.index, n.name, n.found]), [['', 'qbit', false]]);
  assert.equal(r.nextIndex(ns), '1');
});

test('index pattern does not match container-scope keys', () => {
  const re = r.patternRegex('docktail.service.${NS_KEY}port', 'index');
  assert.ok(re.test('docktail.service.port'));
  assert.ok(re.test('docktail.service.3.port'));
  assert.ok(!re.test('docktail.service.x.port'));
  assert.ok(!re.test('docktail.service.enable'));
});

// ------------------------------------------------------------ split namespaces

test('detectNamespaces split', () => {
  const labels = L({ 'test.type': 'app', 'test.name': 'A;B;C', 'test.url': 'u1;u2' });
  const ns = r.detectNamespaces(splitCat, labels, 'box');
  assert.deepEqual(ns.map((n) => [n.index, n.name, n.primary]), [[0, 'A', true], [1, 'B', false], [2, 'C', false]]);
});

test('detectNamespaces split empty -> one primary', () => {
  const ns = r.detectNamespaces(splitCat, [], 'box');
  assert.deepEqual(ns.map((n) => [n.index, n.name, n.found]), [[0, 'box', false]]);
});

test('split/join parts with padding', () => {
  assert.deepEqual(r.splitValue('a;b', ';'), ['a', 'b']);
  assert.deepEqual(r.splitValue('', ';'), []);
  assert.equal(r.joinParts(['x', '', 'z'], 3, ';', 'docker'), 'x;docker;z');
  assert.equal(r.joinParts(['x'], 2, ';', 'docker'), 'x;docker');
});

test('none kind has no namespaces', () => {
  assert.deepEqual(r.detectNamespaces({ namespace: 'none', groups: [] }, [], 'x'), []);
  assert.deepEqual(r.detectNamespaces({ groups: [] }, [], 'x'), []);
});

// ------------------------------------------------------------ repeat groups

const widget = { single: 'homepage.widget.', multi: 'homepage.widgets[${I}].' };

test('detectRepeat forms', () => {
  assert.equal(r.detectRepeat(widget, L({ 'homepage.name': 'x' })).form, 'none');
  assert.deepEqual(r.detectRepeat(widget, L({ 'homepage.widget.type': 'emby' })),
    { form: 'single', blocks: [{ index: null, prefix: 'homepage.widget.' }] });
  const m = r.detectRepeat(widget, L({ 'homepage.widgets[1].type': 'b', 'homepage.widgets[0].type': 'a', 'homepage.widgets[0].url': 'u' }));
  assert.equal(m.form, 'multi');
  assert.deepEqual(m.blocks.map((b) => b.prefix), ['homepage.widgets[0].', 'homepage.widgets[1].']);
  assert.equal(r.detectRepeat(widget, L({ 'homepage.widget.type': 'a', 'homepage.widgets[0].type': 'b' })).form, 'mixed');
});

test('detectRepeat: "widgets" is not mistaken for "widget."', () => {
  assert.equal(r.detectRepeat(widget, L({ 'homepage.widgets[0].type': 'a' })).form, 'multi');
});

test('repeatPrefixes switches form by count', () => {
  assert.deepEqual(r.repeatPrefixes(widget, 1), ['homepage.widget.']);
  assert.deepEqual(r.repeatPrefixes(widget, 2), ['homepage.widgets[0].', 'homepage.widgets[1].']);
  assert.deepEqual(r.repeatPrefixes(widget, 0), []);
});

// ------------------------------------------------------------ Extra Parameters

test('parseExtraLabels variants', () => {
  const got = r.parseExtraLabels(
    '--restart=unless-stopped --label docktail.service.enable=true -l a=1 --label=b=2 ' +
    '--label "c=two words" -l \'d=x y\' -le=3 --label "f=Host(`x`)" --log-opt max-size=10m -lg'
  );
  assert.deepEqual(got, [
    { key: 'docktail.service.enable', value: 'true' },
    { key: 'a', value: '1' }, { key: 'b', value: '2' },
    { key: 'c', value: 'two words' }, { key: 'd', value: 'x y' },
    { key: 'e', value: '3' }, { key: 'f', value: 'Host(`x`)' },
    { key: 'g', value: '' }
  ]);
});

test('parseExtraLabels empty', () => {
  assert.deepEqual(r.parseExtraLabels(''), []);
  assert.deepEqual(r.parseExtraLabels('--cpus=2'), []);
});

// ------------------------------------------------------------ XSS filter (compared with real PHP)

test('xssFilter matches Unraid xmlSecurity() for recorded cases', () => {
  const cases = require('./xss-php.json');
  for (const c of cases) assert.equal(r.xssFilter(c.in).value, c.out, JSON.stringify(c.in));
});

test('xssFilter flags', () => {
  assert.equal(r.xssFilter('Host(`a`)').changed, false);
  assert.equal(r.xssFilter('<t>').changed, true);
  assert.equal(r.xssFilter('a < b').changed, false);
});

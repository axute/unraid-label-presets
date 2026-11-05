// Run: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/bookmodel.js');
const R = require('../js/resolve.js');
const homepage = require('../catalog/homepage.json');
const docktail = require('../catalog/docktail.json');
const controlarr = require('../catalog/controlarr.json');
const dockhand = require('../catalog/dockhand.json');

const container = {
  name: 'Sonarr', webui: 'http://[IP]:[PORT:8989]/', icon: '', overview: 'TV series manager', network: 'bridge', driver: 'bridge',
  ip: '', extraParams: '', ports: [{ target: '8989', value: '8989' }]
};
const settings = { globals: { HOMEPAGE_DEFAULT_GROUP: 'Media' }, defaultDisplay: 'advanced' };
const mk = (svc, labels) => M.createState(svc, { formLabels: labels || [], extraLabels: [], container, env: { serverHost: 'tower' }, settings });
const L = (o, start = 2) => Object.entries(o).map(([key, value], i) => ({ num: start + 2 * i, key, value }));
const repeatGroup = (st) => M.rows(st).find((g) => g.scope === 'repeat');

// ------------------------------------------------------------ homepage

test('homepage: tile defaults', () => {
  const st = mk(homepage);
  const p = M.plan(st);
  const add = Object.fromEntries(p.add.map((a) => [a.key, a.value]));
  assert.equal(add['homepage.group'], 'Media');
  assert.equal(add['homepage.name'], 'Sonarr');
  assert.equal(add['homepage.icon'], 'sonarr.png');
  assert.equal(add['homepage.href'], 'http://tower:8989/');
  assert.equal(add['homepage.description'], undefined); // not recommended
  assert.equal(repeatGroup(st).blocks.length, 0);
});

test('homepage: first widget uses single form', () => {
  const st = mk(homepage);
  M.addBlock(st, 'Widget');
  const b = repeatGroup(st).blocks[0];
  assert.equal(b.prefix, 'homepage.widget.');
  M.setValue(st, b.rows.find((r) => r.key === 'homepage.widget.type').id, 'sonarr');
  const keys = M.plan(st).add.map((a) => a.key);
  assert.ok(keys.includes('homepage.widget.type'));
  assert.ok(keys.includes('homepage.widget.url'));
  assert.ok(!keys.includes('homepage.widget.key'));
});

test('homepage: empty widget type blocks apply', () => {
  const st = mk(homepage);
  M.addBlock(st, 'Widget');
  assert.ok(M.plan(st).errors.some((e) => e.key === 'homepage.widget.type'));
});

test('homepage: second widget renumbers existing single widget, keeps unknown fields', () => {
  const st = mk(homepage, L({ 'homepage.name': 'Sonarr', 'homepage.widget.type': 'sonarr', 'homepage.widget.url': 'http://x', 'homepage.widget.slug': 'abc' }));
  assert.equal(repeatGroup(st).form, 'single');
  M.addBlock(st, 'Widget');
  const g = repeatGroup(st);
  assert.deepEqual(g.blocks.map((b) => b.prefix), ['homepage.widgets[0].', 'homepage.widgets[1].']);
  M.setValue(st, g.blocks[1].rows.find((r) => r.def.key === '${R}type').id, 'uptimekuma');
  const p = M.plan(st);
  const moved = p.remove.filter((r) => r.moved).map((r) => [r.key, r.moved]).sort();
  assert.deepEqual(moved, [
    ['homepage.widget.slug', 'homepage.widgets[0].slug'],
    ['homepage.widget.type', 'homepage.widgets[0].type'],
    ['homepage.widget.url', 'homepage.widgets[0].url']
  ]);
  const add = Object.fromEntries(p.add.map((a) => [a.key, a.value]));
  assert.equal(add['homepage.widgets[0].type'], 'sonarr');
  assert.equal(add['homepage.widgets[0].slug'], 'abc');
  assert.equal(add['homepage.widgets[1].type'], 'uptimekuma');
  assert.deepEqual(p.errors, []);
});

test('homepage: removing a widget of two goes back to single form', () => {
  const st = mk(homepage, L({ 'homepage.widgets[0].type': 'a', 'homepage.widgets[1].type': 'b', 'homepage.widgets[1].url': 'u' }));
  const g = repeatGroup(st);
  assert.equal(g.form, 'multi');
  M.removeBlock(st, 'Widget', g.blocks[0].block.id);
  const p = M.plan(st);
  assert.ok(p.remove.some((r) => r.key === 'homepage.widgets[0].type' && !r.moved));
  const add = Object.fromEntries(p.add.map((a) => [a.key, a.value]));
  assert.equal(add['homepage.widget.type'], 'b');
  assert.equal(add['homepage.widget.url'], 'u');
});

test('homepage: mixed forms block apply', () => {
  const st = mk(homepage, L({ 'homepage.widget.type': 'a', 'homepage.widgets[0].type': 'b' }));
  assert.match(M.plan(st).errors[0].error, /beide Schreibweisen/);
});

test('homepage: widget labels are not "unknown"', () => {
  const st = mk(homepage, L({ 'homepage.widgets[0].type': 'a', 'homepage.foo': 'x' }));
  assert.deepEqual(M.unknownLabels(st).map((l) => l.key), ['homepage.foo']);
});

// ------------------------------------------------------------ docktail

test('docktail: primary without index, second service gets .1.', () => {
  const st = mk(docktail);
  assert.equal(M.addNamespace(st, 'sonarr-api').ok, true);
  const add = Object.fromEntries(M.plan(st).add.map((a) => [a.key, a.value]));
  assert.equal(add['docktail.service.enable'], 'true');
  assert.equal(add['docktail.service.name'], 'sonarr');
  assert.equal(add['docktail.service.port'], '8989');
  assert.equal(add['docktail.service.1.name'], 'sonarr-api');
  assert.equal(add['docktail.service.1.port'], '8989');
  assert.equal(add['docktail.funnel.enable'], undefined);
});

test('docktail: existing services detected with names', () => {
  const st = mk(docktail, L({ 'docktail.service.enable': 'true', 'docktail.service.name': 'web', 'docktail.service.port': '80', 'docktail.service.2.name': 'api', 'docktail.service.2.port': '81' }));
  assert.deepEqual(st.namespaces.map((n) => [n.index, n.name]), [['', 'web'], ['2', 'api']]);
  assert.equal(M.addNamespace(st, 'x').ns.index, '3');
});

test('docktail: path pattern', () => {
  const st = mk(docktail);
  const r = M.rows(st).flatMap((g) => g.rows || []).find((x) => x.key === 'docktail.service.path');
  M.setChecked(st, r.id, true);
  M.setValue(st, r.id, 'api');
  assert.ok(M.plan(st).errors.some((e) => e.key === 'docktail.service.path'));
});

// ------------------------------------------------------------ controlarr

test('controlarr: nothing preselected, schedule validated', () => {
  const st = mk(controlarr);
  assert.deepEqual(M.plan(st).add, []);
  const stop = M.rows(st).flatMap((g) => g.rows || []).find((r) => r.key === 'controlarr.stop');
  M.setChecked(st, stop.id, true);
  M.setValue(st, stop.id, 'mon-fri 23:00, sat-sun 01:00');
  assert.deepEqual(M.plan(st).add.map((a) => [a.key, a.value]), [['controlarr.stop', 'mon-fri 23:00, sat-sun 01:00']]);
  M.setValue(st, stop.id, 'mon-fri 25:00');
  assert.ok(M.plan(st).errors.length);
});

test('schedule format roundtrip', () => {
  const p = R.parseSchedule('weekdays 07:00, 18:30');
  assert.equal(R.formatSchedule(p.entries), 'weekdays 07:00, 18:30');
});

// ------------------------------------------------------------ dockhand

test('dockhand: cron or time pattern', () => {
  const st = mk(dockhand);
  const r = M.rows(st).flatMap((g) => g.rows || []).find((x) => x.key === 'dockhand.start.at');
  M.setChecked(st, r.id, true);
  for (const ok of ['07:00', '0 7 * * 1-5']) { M.setValue(st, r.id, ok); assert.deepEqual(M.plan(st).errors, [], ok); }
  M.setValue(st, r.id, '7 Uhr');
  assert.ok(M.plan(st).errors.length);
});

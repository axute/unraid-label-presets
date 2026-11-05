/* Label Presets – resolver.
 *
 * Pure logic, no DOM: variables, namespaces, key patterns, repeat groups,
 * Extra Parameters parsing and Unraid's XSS filter. Runs in the browser
 * (window.LabelPresets.resolve) and in Node (module.exports) for tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LabelPresets = root.LabelPresets || {}; root.LabelPresets.resolve = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VAR_RE = /\$\{([A-Z0-9_]+)\}/g;
  var OWN_IP_DRIVERS = { macvlan: true, ipvlan: true };
  var NO_MAPPING_DRIVERS = { host: true, macvlan: true, ipvlan: true };

  function str(v) { return v == null ? '' : String(v); }
  function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------------------------------------------------------------- names

  /** Container name -> namespace usable inside a label key. */
  function sanitizeNs(name) {
    return str(name).toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ---------------------------------------------------------------- WebUI

  /** "http://[IP]:[PORT:8080]/admin" -> { scheme, port, path, raw } (container port). */
  function parseWebUI(webui) {
    var s = str(webui).trim();
    var out = { scheme: '', port: '', path: '', raw: s };
    if (!s) return out;
    var m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
    if (m) out.scheme = m[1].toLowerCase();
    var p = /\[PORT:(\d{1,5})\]/i.exec(s);
    if (p) out.port = p[1];
    var rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    var slash = rest.indexOf('/');
    out.path = slash >= 0 ? rest.slice(slash) : '';
    return out;
  }

  function firstLine(text) {
    var t = str(text).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
    var line = t.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)[0] || '';
    return line;
  }

  /**
   * Values derived from the form. `c` is formbridge.readContainer(); `env`
   * may carry { serverHost } (browser hostname). Returns
   * { vars: {NAME: value}, sources: {NAME: 'text'} } – only known values are set.
   */
  function autoVars(c, env) {
    c = c || {}; env = env || {};
    var vars = {}, sources = {};
    function set(k, v, src) { if (str(v) !== '') { vars[k] = str(v); sources[k] = src; } }

    set('CONTAINER_NAME', c.name, 'Containername');
    set('CONTAINER_NAME_LOWER', str(c.name).toLowerCase(), 'Containername');
    var ns = sanitizeNs(c.name);
    set('NS', ns, 'Containername');
    set('NS_KEY', ns, 'Containername');

    var w = parseWebUI(c.webui);
    var ports = c.ports || [];
    var containerPort = w.port, portSrc = 'aus WebUI';
    if (!containerPort && ports.length && ports[0].target) { containerPort = ports[0].target; portSrc = 'erste Port-Zeile'; }
    set('WEBUI_PORT', containerPort, portSrc);

    var driver = str(c.driver).toLowerCase();
    var hostPort = '';
    if (containerPort) {
      if (NO_MAPPING_DRIVERS[driver]) { hostPort = containerPort; set('WEBUI_HOST_PORT', hostPort, 'Netzwerk ' + driver + ': ohne Mapping'); }
      else {
        for (var i = 0; i < ports.length; i++) {
          if (str(ports[i].target) === containerPort && str(ports[i].value) !== '') { hostPort = str(ports[i].value); break; }
        }
        set('WEBUI_HOST_PORT', hostPort, 'Port-Mapping ' + containerPort);
      }
    }
    set('WEBUI_SCHEME', w.scheme, 'aus WebUI');
    set('WEBUI_PATH', w.path, 'aus WebUI');

    var ip = str(c.ip).trim();
    set('IP', ip, 'feste IP');
    set('SERVER_IP', env.serverHost, 'Adresse im Browser');
    if (w.raw) {
      var host = (OWN_IP_DRIVERS[driver] && ip) ? ip : str(env.serverHost);
      var port = (OWN_IP_DRIVERS[driver] && ip) ? containerPort : hostPort;
      if (host && (port || !/\[PORT:/i.test(w.raw))) {
        set('WEBUI_URL', w.raw.replace(/\[IP\]/gi, host).replace(/\[PORT:\d{1,5}\]/gi, port), 'aus WebUI');
      }
    }
    set('ICON', c.icon, 'Unraid-Icon');
    set('OVERVIEW', firstLine(c.overview), 'Beschreibung');
    set('NETWORK', c.network, 'Netzwerk');
    return { vars: vars, sources: sources };
  }

  // ---------------------------------------------------------------- variables

  /** Merge variable layers, later wins: merge(globals, auto, asked). */
  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i] || {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) out[k] = str(o[k]);
    }
    return out;
  }

  /**
   * Replace ${NAME} recursively. Unknown names stay as written and are
   * reported in `missing`; cycles are reported in `cycles`.
   */
  function resolve(template, vars) {
    var missing = {}, cycles = {};
    function run(s, stack) {
      return str(s).replace(VAR_RE, function (all, name) {
        if (stack.indexOf(name) >= 0) { cycles[name] = true; return all; }
        if (!Object.prototype.hasOwnProperty.call(vars, name)) { missing[name] = true; return all; }
        return run(vars[name], stack.concat(name));
      });
    }
    var value = run(template, []);
    return { value: value, missing: Object.keys(missing), cycles: Object.keys(cycles) };
  }

  /** Names used in a template (not recursive). */
  function varsIn(template) {
    var out = [], m;
    VAR_RE.lastIndex = 0;
    while ((m = VAR_RE.exec(str(template)))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  }

  // ---------------------------------------------------------------- namespaces

  /** NS_KEY for a namespace: name -> name, index -> '' | 'n.', split/none -> ''. */
  function nsKey(kind, ns) {
    if (kind === 'index') return ns.index ? ns.index + '.' : '';
    if (kind === 'name') return ns.key;
    return '';
  }

  /** Build the concrete key for a namespace. */
  function keyFor(pattern, kind, ns) {
    return str(pattern).split('${NS_KEY}').join(ns ? nsKey(kind, ns) : '');
  }

  /** Regex for a key pattern; the namespace part becomes a capture group. */
  function patternRegex(pattern, kind) {
    var parts = str(pattern).split('${NS_KEY}');
    if (parts.length === 1) return new RegExp('^' + reEscape(parts[0]) + '$');
    var cap = kind === 'index' ? '(?:(\\d+)\\.)?' : '([a-z0-9-]+)';
    return new RegExp('^' + parts.map(reEscape).join(cap) + '$');
  }

  function nsLabels(service) {
    var out = [];
    (service.groups || []).forEach(function (g) {
      if (g.scope !== 'namespace' && g.scope !== 'split') return;
      if (g.repeat) return;
      (g.labels || []).forEach(function (l) { out.push(l); });
    });
    return out;
  }

  /**
   * Namespaces present in `labels` ([{key, value}]) for a catalog service.
   * The primary namespace (from the container name) is always first.
   * Returns [{ key, index, name, primary, found }].
   */
  function detectNamespaces(service, labels, primaryName) {
    var kind = service.namespace || 'none';
    var primaryKey = sanitizeNs(primaryName);
    if (kind === 'none') return [];
    var byKey = {};
    (labels || []).forEach(function (l) { byKey[l.key] = l.value; });

    if (kind === 'split') {
      var sep = service.separator || ';';
      var n = 0;
      nsLabels(service).forEach(function (l) {
        if (Object.prototype.hasOwnProperty.call(byKey, l.key)) n = Math.max(n, str(byKey[l.key]).split(sep).length);
      });
      var names = service.nameKey && byKey[service.nameKey] != null ? str(byKey[service.nameKey]).split(sep) : [];
      var out = [];
      for (var i = 0; i < Math.max(n, 1); i++) {
        out.push({ key: '', index: i, name: (names[i] || (i === 0 ? primaryName : '')).trim(), primary: i === 0, found: i < n });
      }
      return out;
    }

    var res = [], seen = {};
    var regs = nsLabels(service).map(function (l) { return patternRegex(l.key, kind); });
    (labels || []).forEach(function (l) {
      for (var i = 0; i < regs.length; i++) {
        var m = regs[i].exec(l.key);
        if (!m) continue;
        var id = kind === 'index' ? (m[1] || '') : m[1];
        if (seen[id] == null) seen[id] = true;
        return;
      }
    });

    if (kind === 'name') {
      res.push({ key: primaryKey, index: null, name: primaryKey, primary: true, found: !!seen[primaryKey] });
      Object.keys(seen).sort().forEach(function (k) {
        if (k !== primaryKey) res.push({ key: k, index: null, name: k, primary: false, found: true });
      });
      return res;
    }

    // index
    function nameOf(idx) {
      if (!service.nameKey) return '';
      var k = keyFor(service.nameKey, 'index', { index: idx });
      return byKey[k] != null ? str(byKey[k]) : '';
    }
    res.push({ key: '', index: '', name: nameOf('') || primaryKey, primary: true, found: !!seen[''] });
    Object.keys(seen).filter(function (k) { return k !== ''; })
      .sort(function (a, b) { return a - b; })
      .forEach(function (k) { res.push({ key: k + '.', index: k, name: nameOf(k) || ('#' + k), primary: false, found: true }); });
    return res;
  }

  /** Next free number for an index namespace. */
  function nextIndex(namespaces) {
    var max = 0;
    (namespaces || []).forEach(function (ns) { var i = parseInt(ns.index, 10); if (i > max) max = i; });
    return String(max + 1);
  }

  /** Validate a new name-namespace: sanitized and not taken. */
  function newNamespace(name, existing) {
    var key = sanitizeNs(name);
    if (!key) return { ok: false, error: 'leer' };
    var taken = (existing || []).some(function (ns) { return ns.key === key; });
    return taken ? { ok: false, error: 'vorhanden', key: key } : { ok: true, key: key };
  }

  // ---------------------------------------------------------------- split values

  function splitValue(value, sep) { return str(value) === '' ? [] : str(value).split(sep || ';'); }

  /** Join per-namespace parts, padding missing ones with `fill`. */
  function joinParts(parts, count, sep, fill) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(parts[i] != null && parts[i] !== '' ? parts[i] : str(fill));
    return out.join(sep || ';');
  }

  // ---------------------------------------------------------------- repeat groups

  /**
   * Blocks of a repeat group present in labels.
   * repeat: { single: 'homepage.widget.', multi: 'homepage.widgets[${I}].' }
   * Returns { form: 'none'|'single'|'multi'|'mixed', blocks: [{ index, prefix }] }.
   */
  function detectRepeat(repeat, labels) {
    var single = str(repeat.single);
    var parts = str(repeat.multi).split('${I}');
    var multiRe = new RegExp('^' + reEscape(parts[0]) + '(\\d+)' + reEscape(parts[1] || ''));
    var hasSingle = false, idx = {};
    (labels || []).forEach(function (l) {
      var m = multiRe.exec(l.key);
      if (m) { idx[m[1]] = true; return; }
      if (single && l.key.indexOf(single) === 0) hasSingle = true;
    });
    var nums = Object.keys(idx).sort(function (a, b) { return a - b; });
    var form = hasSingle && nums.length ? 'mixed' : hasSingle ? 'single' : nums.length ? 'multi' : 'none';
    var blocks = [];
    if (hasSingle) blocks.push({ index: null, prefix: single });
    nums.forEach(function (n) { blocks.push({ index: n, prefix: parts[0] + n + (parts[1] || '') }); });
    return { form: form, blocks: blocks };
  }

  /** Prefixes to write for `count` blocks (single form for one, renumbered multi form otherwise). */
  function repeatPrefixes(repeat, count) {
    if (count === 1) return [str(repeat.single)];
    var out = [];
    for (var i = 0; i < count; i++) out.push(str(repeat.multi).split('${I}').join(String(i)));
    return out;
  }

  // ---------------------------------------------------------------- Extra Parameters

  function tokenize(s) {
    var out = [], cur = '', q = null, has = false;
    s = str(s);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) {
        if (ch === q) { q = null; continue; }
        if (ch === '\\' && q === '"' && i + 1 < s.length) { cur += s[++i]; continue; }
        cur += ch; continue;
      }
      if (ch === '"' || ch === "'") { q = ch; has = true; continue; }
      if (ch === '\\' && i + 1 < s.length) { cur += s[++i]; has = true; continue; }
      if (/\s/.test(ch)) { if (has || cur) out.push(cur); cur = ''; has = false; continue; }
      cur += ch; has = true;
    }
    if (has || cur) out.push(cur);
    return out;
  }

  /** Labels set via --label/-l in the Extra Parameters field. */
  function parseExtraLabels(extra) {
    var t = tokenize(extra), out = [];
    function push(kv) {
      var eq = kv.indexOf('=');
      if (eq < 0) out.push({ key: kv, value: '' });
      else out.push({ key: kv.slice(0, eq), value: kv.slice(eq + 1) });
    }
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if ((a === '--label' || a === '-l') && i + 1 < t.length) { push(t[++i]); continue; }
      if (a.indexOf('--label=') === 0) { push(a.slice(8)); continue; }
      if (a.length > 2 && a.indexOf('-l') === 0) { push(a.slice(2).replace(/^=/, '')); continue; }
    }
    return out;
  }

  // ---------------------------------------------------------------- Unraid XSS filter

  /**
   * Emulates Unraid's xmlSecurity(): if strip_tags() would change the value,
   * all < and > are removed when the container is created.
   * Tag start as in PHP strip_tags: '<' followed by a non-space character.
   */
  function xssFilter(value) {
    var s = str(value);
    var tagLike = /<(?:\S|$)/.test(s);
    return { changed: tagLike, value: tagLike ? s.replace(/[<>]/g, '') : s };
  }

  // ---------------------------------------------------------------- schedules (Controlarr)

  var DAY = '(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?';
  var DAYS_RE = new RegExp('^(?:daily|weekdays|weekends|' + DAY + '(?:-' + DAY + ')?(?:,' + DAY + '(?:-' + DAY + ')?)*)$', 'i');
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /**
   * "mon-fri 23:00, sat-sun 01:00" -> { entries: [{ days, time }], error }.
   * Day lists like "sat,sun" contain commas too, so a piece without a time
   * is joined to the next one.
   */
  function parseSchedule(value) {
    var s = str(value).trim();
    if (!s) return { entries: [], error: 'Wert fehlt' };
    var pieces = s.split(','), entries = [], carry = '';
    for (var i = 0; i < pieces.length; i++) {
      var p = (carry ? carry + ',' : '') + pieces[i].trim();
      var m = /^(?:(\S+)\s+)?(\S+)$/.exec(p);
      if (!m || !TIME_RE.test(m[2])) {
        if (/^\S+$/.test(p) && DAYS_RE.test(p) && i + 1 < pieces.length) { carry = p; continue; }
        return { entries: entries, error: '„' + p + '“: erwartet [Tage] HH:MM' };
      }
      if (m[1] && !DAYS_RE.test(m[1])) return { entries: entries, error: '„' + m[1] + '“: unbekannte Tagesangabe' };
      entries.push({ days: (m[1] || '').toLowerCase(), time: m[2] });
      carry = '';
    }
    if (carry) return { entries: entries, error: '„' + carry + '“: Uhrzeit fehlt' };
    return { entries: entries, error: null };
  }

  function formatSchedule(entries) {
    return (entries || []).filter(function (e) { return e && e.time; })
      .map(function (e) { return (e.days && e.days !== 'daily' ? e.days + ' ' : '') + e.time; }).join(', ');
  }

  return {
    parseSchedule: parseSchedule,
    formatSchedule: formatSchedule,
    sanitizeNs: sanitizeNs,
    parseWebUI: parseWebUI,
    autoVars: autoVars,
    merge: merge,
    resolve: resolve,
    varsIn: varsIn,
    nsKey: nsKey,
    keyFor: keyFor,
    patternRegex: patternRegex,
    detectNamespaces: detectNamespaces,
    nextIndex: nextIndex,
    newNamespace: newNamespace,
    splitValue: splitValue,
    joinParts: joinParts,
    detectRepeat: detectRepeat,
    repeatPrefixes: repeatPrefixes,
    parseExtraLabels: parseExtraLabels,
    xssFilter: xssFilter
  };
});

/* Label Presets – book model.
 *
 * State and decisions of the label book without any DOM: which namespaces
 * exist, what each label row shows, and which form changes "Übernehmen"
 * makes. Browser: window.LabelPresets.model, Node: module.exports.
 */
(function (root, factory) {
  var api = factory(root.LabelPresets && root.LabelPresets.resolve ||
    (typeof require === 'function' ? require('./resolve.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LabelPresets = root.LabelPresets || {}; root.LabelPresets.model = api; }
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  function str(v) { return v == null ? '' : String(v); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function indexBy(list) {
    var m = {};
    (list || []).forEach(function (l) { if (!own(m, l.key)) m[l.key] = l; });
    return m;
  }

  function kindOf(service) { return service.namespace || 'none'; }

  function nsId(kind, ns) {
    if (!ns) return '_';
    return kind === 'index' ? 'i:' + ns.index : kind === 'split' ? 's:' + ns.index : 'n:' + ns.key;
  }

  function nsGroups(service) {
    return (service.groups || []).filter(function (g) { return g.scope !== 'container'; });
  }
  function containerGroups(service) {
    return (service.groups || []).filter(function (g) { return g.scope === 'container'; });
  }

  // ---------------------------------------------------------------- index page

  /** How much of a service is already on the container. */
  function serviceStats(service, formLabels, containerName) {
    var prefix = str(service.prefix);
    var count = 0;
    (formLabels || []).forEach(function (l) { if (prefix && l.key.indexOf(prefix) === 0) count++; });
    var ns = R.detectNamespaces(service, formLabels, containerName).filter(function (n) { return n.found; });
    return { labels: count, namespaces: ns.length };
  }

  // ---------------------------------------------------------------- state

  /**
   * ctx: { formLabels, extraLabels, container, env, settings }
   *   formLabels: formbridge.readLabels(), extraLabels: resolve.parseExtraLabels(...)
   */
  function createState(service, ctx) {
    var kind = kindOf(service);
    var name = str(ctx.container && ctx.container.name);
    var auto = R.autoVars(ctx.container || {}, ctx.env || {});
    var settings = ctx.settings || {};
    var st = {
      service: service,
      kind: kind,
      containerName: name,
      form: indexBy(ctx.formLabels),
      formList: ctx.formLabels || [],
      extra: indexBy(ctx.extraLabels),
      auto: auto,
      globals: settings.globals || {},
      globalsOverride: {},
      asked: {},
      drafts: {},
      namespaces: R.detectNamespaces(service, ctx.formLabels || [], name),
      active: 0,
      display: service.display || settings.defaultDisplay || 'advanced',
      displayTouched: false
    };
    return st;
  }

  function activeNs(st) { return st.kind === 'none' ? null : st.namespaces[st.active] || null; }

  /** Add a namespace from user input. Returns { ok, error?, ns? }. */
  function addNamespace(st, input) {
    var label = str(input).trim();
    if (!label) return { ok: false, error: 'Bitte einen Namen eingeben.' };
    var ns;
    if (st.kind === 'name') {
      var res = R.newNamespace(label, st.namespaces);
      if (!res.ok) return { ok: false, error: res.error === 'leer' ? 'Name ergibt keinen gültigen Namespace.' : 'Namespace „' + res.key + '“ gibt es schon.' };
      ns = { key: res.key, index: null, name: res.key, primary: false, found: false };
    } else if (st.kind === 'index') {
      var taken = st.namespaces.some(function (n) { return n.name === label; });
      if (taken) return { ok: false, error: 'Name „' + label + '“ gibt es schon.' };
      var idx = R.nextIndex(st.namespaces);
      ns = { key: idx + '.', index: idx, name: label, primary: false, found: false };
    } else if (st.kind === 'split') {
      if (label.indexOf(st.service.separator || ';') >= 0) return { ok: false, error: 'Der Name darf kein „' + (st.service.separator || ';') + '“ enthalten.' };
      ns = { key: '', index: st.namespaces.length, name: label, primary: false, found: false };
    } else return { ok: false, error: 'Dieser Dienst hat keine Namespaces.' };
    st.namespaces.push(ns);
    st.active = st.namespaces.length - 1;
    return { ok: true, ns: ns };
  }

  // ---------------------------------------------------------------- variables

  /** Variables for one namespace (null = container scope). */
  function varsFor(st, ns) {
    var nsVars = {};
    if (ns) {
      nsVars.NS = ns.name;
      nsVars.NS_KEY = R.nsKey(st.kind, ns);
    } else if (st.kind === 'none' || st.kind === 'split') {
      nsVars.NS = R.sanitizeNs(st.containerName);
    }
    var base = R.merge(st.globals, st.globalsOverride, st.auto.vars, nsVars);
    var asked = st.asked[nsId(st.kind, ns)] || {};
    var out = R.merge(base);
    (st.service.variables || []).forEach(function (v) {
      out[v.id] = own(asked, v.id) ? asked[v.id] : str(v.default);
    });
    return out;
  }

  /** Asked variables for the active namespace, resolved. */
  function askedVars(st, ns) {
    var vars = varsFor(st, ns), asked = st.asked[nsId(st.kind, ns)] || {};
    return (st.service.variables || []).map(function (v) {
      var r = R.resolve(own(asked, v.id) ? asked[v.id] : v.default, vars);
      return { id: v.id, label: v.label || v.id, value: own(asked, v.id) ? asked[v.id] : r.value, touched: own(asked, v.id), missing: r.missing };
    });
  }

  function setAsked(st, ns, id, value) {
    var k = nsId(st.kind, ns);
    st.asked[k] = st.asked[k] || {};
    st.asked[k][id] = str(value);
  }

  /** Global variables the service uses, with value and whether they are set. */
  function globalVars(st) {
    return (st.service.globals || []).map(function (id) {
      var v = own(st.globalsOverride, id) ? st.globalsOverride[id] : st.globals[id];
      return { id: id, value: str(v), set: str(st.globals[id]) !== '', overridden: own(st.globalsOverride, id) };
    });
  }

  // ---------------------------------------------------------------- validation

  function validate(def, value) {
    var v = str(value), t = def.type || 'text';
    if (t === 'port') {
      if (!/^\d+$/.test(v) || +v < 1 || +v > 65535) return 'Port 1–65535 erwartet';
    } else if (t === 'number') {
      if (!/^-?\d+$/.test(v)) return 'ganze Zahl erwartet';
      if (def.min != null && +v < def.min) return 'mindestens ' + def.min;
      if (def.max != null && +v > def.max) return 'höchstens ' + def.max;
    } else if (t === 'bool') {
      if (v !== 'true' && v !== 'false') return 'true oder false erwartet';
    } else if (t === 'enum') {
      if ((def.options || []).indexOf(v) < 0) return 'erlaubt: ' + (def.options || []).join(', ');
    }
    if (def.pattern && !(new RegExp(def.pattern)).test(v)) return 'Format passt nicht';
    if (v === '') return 'Wert fehlt';
    return null;
  }

  // ---------------------------------------------------------------- rows

  function rowId(ns, st, key) { return nsId(st.kind, ns) + '|' + key; }

  /** One label row for a namespace (null for container scope). */
  function row(st, ns, def, group) {
    var vars = varsFor(st, ns);
    var key = R.keyFor(def.key, st.kind, ns);
    var prop = R.resolve(def.value, vars);
    var existing = own(st.form, key) ? st.form[key] : null;
    var extra = own(st.extra, key) ? st.extra[key] : null;
    var id = rowId(ns, st, key);
    var d = st.drafts[id];
    if (!d) {
      d = st.drafts[id] = {
        checked: existing ? true : (!!def.recommended && !extra),
        touched: false,
        value: ''
      };
    }
    var value = d.touched ? d.value : existing ? existing.value : prop.value;
    var status = existing ? (prop.missing.length || existing.value === prop.value ? 'vorhanden' : 'abweichend') : extra ? 'extra' : 'neu';
    var error = d.checked ? validate(def, value) : null;
    var missing = d.touched || existing ? [] : prop.missing;
    if (d.checked && !error && missing.length) error = 'Variable fehlt: ' + missing.join(', ');
    var xss = R.xssFilter(value);
    var sources = R.varsIn(def.value).map(function (n) { return st.auto.sources[n] ? st.auto.sources[n] + ': ' + (st.auto.vars[n] || '') : ''; }).filter(Boolean);
    return {
      id: id, ns: ns, group: group, def: def, key: key, value: value,
      proposed: prop.value, proposedComplete: !prop.missing.length,
      existing: existing, extra: extra, checked: d.checked, touched: d.touched,
      status: status, error: error, missing: missing,
      xss: xss.changed ? xss.value : null, source: sources.join(', ')
    };
  }

  /** Rows for the page: container groups, then namespace groups of the active namespace. */
  function rows(st) {
    var out = [];
    containerGroups(st.service).forEach(function (g) {
      out.push({ group: g, scope: 'container', rows: (g.labels || []).map(function (d) { return row(st, null, d, g); }) });
    });
    var ns = activeNs(st);
    if (ns) {
      nsGroups(st.service).forEach(function (g) {
        out.push({ group: g, scope: 'namespace', rows: (g.labels || []).map(function (d) { return row(st, ns, d, g); }) });
      });
    }
    return out;
  }

  /** Form labels with the service prefix that the catalog does not know. */
  function unknownLabels(st) {
    var prefix = str(st.service.prefix);
    if (!prefix) return [];
    var regs = [];
    (st.service.groups || []).forEach(function (g) {
      (g.labels || []).forEach(function (l) { regs.push(R.patternRegex(l.key, st.kind)); });
    });
    return st.formList.filter(function (l) {
      return l.key.indexOf(prefix) === 0 && !regs.some(function (re) { return re.test(l.key); });
    });
  }

  function setChecked(st, id, on) { if (st.drafts[id]) st.drafts[id].checked = !!on; }
  function setValue(st, id, value) { if (st.drafts[id]) { st.drafts[id].value = str(value); st.drafts[id].touched = true; } }
  function resetValue(st, id) { if (st.drafts[id]) { st.drafts[id].touched = false; st.drafts[id].value = ''; } }
  function setDisplay(st, d) { st.display = d === 'always' ? 'always' : 'advanced'; st.displayTouched = true; }

  // ---------------------------------------------------------------- apply

  function allRows(st) {
    var out = [];
    containerGroups(st.service).forEach(function (g) { (g.labels || []).forEach(function (d) { out.push(row(st, null, d, g)); }); });
    if (st.kind !== 'none') {
      st.namespaces.forEach(function (ns) {
        nsGroups(st.service).forEach(function (g) { (g.labels || []).forEach(function (d) { out.push(row(st, ns, d, g)); }); });
      });
    }
    return out;
  }

  /**
   * Changes "Übernehmen" would make.
   * { add: [{key, value, name, description, display, mask}], update: [{num, key, value, old}],
   *   remove: [{num, key, value}], errors: [{key, error}], warnings: [{key, text}] }
   */
  function plan(st) {
    var p = { add: [], update: [], remove: [], errors: [], warnings: [] };
    if (st.kind === 'split') { p.errors.push({ key: '', error: 'Namespace-Art split ist im Buch noch nicht umgesetzt.' }); return p; }
    allRows(st).forEach(function (r) {
      if (!r.checked) {
        if (r.existing) p.remove.push({ num: r.existing.num, key: r.key, value: r.existing.value });
        return;
      }
      if (r.error) { p.errors.push({ key: r.key, error: r.error }); return; }
      if (r.xss) p.warnings.push({ key: r.key, text: 'Unraid entfernt < und >: kommt an als „' + r.xss + '“' });
      if (r.extra) p.warnings.push({ key: r.key, text: 'steht zusätzlich in Extra Parameters (der Wert dort gewinnt)' });
      if (r.existing) {
        if (r.value !== r.existing.value) p.update.push({ num: r.existing.num, key: r.key, value: r.value, old: r.existing.value });
        return;
      }
      var suffix = r.ns && !r.ns.primary ? ' (' + r.ns.name + ')' : '';
      p.add.push({
        key: r.key, value: r.value,
        name: st.service.name + ': ' + (r.def.title || r.key) + suffix,
        description: r.def.description || '',
        display: st.displayTouched ? st.display : (r.def.display || st.display),
        mask: !!r.def.mask
      });
    });
    return p;
  }

  return {
    serviceStats: serviceStats,
    createState: createState,
    activeNs: activeNs,
    addNamespace: addNamespace,
    varsFor: varsFor,
    askedVars: askedVars,
    setAsked: setAsked,
    globalVars: globalVars,
    validate: validate,
    rows: rows,
    unknownLabels: unknownLabels,
    setChecked: setChecked,
    setValue: setValue,
    resetValue: resetValue,
    setDisplay: setDisplay,
    plan: plan
  };
});

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
    return (service.groups || []).filter(function (g) { return g.scope !== 'container' && !g.repeat; });
  }
  function containerGroups(service) {
    return (service.groups || []).filter(function (g) { return g.scope === 'container' && !g.repeat; });
  }
  function repeatGroups(service) {
    return (service.groups || []).filter(function (g) { return !!g.repeat; });
  }
  function rKey(pattern, prefix) { return str(pattern).split('${R}').join(prefix); }

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
      displayTouched: false,
      repeat: {},
      open: {},
      // service already set up on this container? then "recommended" no longer preselects
      used: (ctx.formLabels || []).some(function (l) { return service.prefix && l.key.indexOf(service.prefix) === 0; })
    };
    repeatGroups(service).forEach(function (g) {
      var det = R.detectRepeat(g.repeat, st.formList);
      st.repeat[g.name] = {
        form: det.form,
        seq: det.blocks.length,
        blocks: det.blocks.map(function (b, i) { return { id: 'b' + i, src: b.prefix, removed: false }; })
      };
    });
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
    } else if (t === 'schedule') {
      var ps = R.parseSchedule(v);
      if (ps.error) return ps.error;
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
  function row(st, ns, def, group, rep) {
    var vars = varsFor(st, ns);
    var key = rep ? rKey(def.key, rep.prefix) : R.keyFor(def.key, st.kind, ns);
    var srcKey = rep ? (rep.src ? rKey(def.key, rep.src) : null) : key;
    var prop = R.resolve(def.value, vars);
    var existing = srcKey && own(st.form, srcKey) ? st.form[srcKey] : null;
    var extra = own(st.extra, key) ? st.extra[key] : null;
    var id = rep ? rep.id + '|' + def.key : rowId(ns, st, key);
    var d = st.drafts[id];
    if (!d) {
      // recommended labels are preselected only where nothing is set up yet:
      // a new namespace, a new repeat block, or a service not used on this container
      var fresh = rep ? !rep.src : ns && st.kind !== 'split' ? !ns.found : !st.used;
      d = st.drafts[id] = {
        checked: existing ? true : (!!def.recommended && !extra && fresh),
        touched: false,
        value: ''
      };
    }
    var value = d.touched ? d.value : existing ? existing.value : prop.value;
    // an empty catalog value means "no proposal": an existing value is then simply present
    var noProposal = prop.value === '' || prop.missing.length > 0;
    var status = existing ? (noProposal || existing.value === prop.value ? 'vorhanden' : 'abweichend') : extra ? 'extra' : 'neu';
    var error = d.checked ? validate(def, value) : null;
    var missing = d.touched || existing ? [] : prop.missing;
    if (d.checked && !error && missing.length) error = 'Variable fehlt: ' + missing.join(', ');
    var xss = R.xssFilter(value);
    var sources = R.varsIn(def.value).map(function (n) { return st.auto.sources[n] ? st.auto.sources[n] + ': ' + (st.auto.vars[n] || '') : ''; }).filter(Boolean);
    return {
      id: id, ns: ns, group: group, def: def, key: key, srcKey: srcKey, value: value,
      proposed: prop.value, proposedComplete: !noProposal,
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
    repeatGroups(st.service).forEach(function (g) { out.push(repeatGroupRows(st, g)); });
    var ns = activeNs(st);
    if (ns) {
      nsGroups(st.service).forEach(function (g) {
        out.push({ group: g, scope: 'namespace', rows: (g.labels || []).map(function (d) { return row(st, ns, d, g); }) });
      });
    }
    return out;
  }

  /** Rows of a repeat group: one set per live block, plus unknown fields found under a block. */
  function repeatGroupRows(st, g) {
    var info = st.repeat[g.name];
    var live = info.blocks.filter(function (b) { return !b.removed; });
    var prefixes = R.repeatPrefixes(g.repeat, live.length);
    var known = (g.labels || []).map(function (d) { return d.key.replace('${R}', ''); });
    var blocks = live.map(function (b, i) {
      var rep = { id: g.name + ':' + b.id, prefix: prefixes[i], src: b.src };
      var rows = (g.labels || []).map(function (d) { return row(st, null, d, g, rep); });
      if (b.src) {
        st.formList.forEach(function (l) {
          if (l.key.indexOf(b.src) !== 0) return;
          var field = l.key.slice(b.src.length);
          if (known.indexOf(field) >= 0) return;
          if (/^\d+\]\./.test(field)) return; // other indexed blocks when src is the single form
          rows.push(row(st, null, { key: '${R}' + field, value: '', title: field, type: 'text' }, g, rep));
        });
      }
      return { block: b, index: i, prefix: prefixes[i], rows: rows };
    });
    var removed = info.blocks.filter(function (b) { return b.removed && b.src; }).map(function (b) {
      return { block: b, labels: st.formList.filter(function (l) { return l.key.indexOf(b.src) === 0 && !/^\d+\]\./.test(l.key.slice(b.src.length)); }) };
    });
    return { group: g, scope: 'repeat', form: info.form, blocks: blocks, removed: removed };
  }

  function addBlock(st, groupName) {
    var info = st.repeat[groupName];
    if (!info) return;
    info.blocks.push({ id: 'b' + (info.seq++), src: null, removed: false });
  }
  function removeBlock(st, groupName, blockId) {
    var info = st.repeat[groupName];
    if (!info) return;
    info.blocks = info.blocks.filter(function (b) {
      if (b.id !== blockId) return true;
      if (!b.src) return false;
      b.removed = true; return true;
    });
  }
  function setOpen(st, groupKey, open) { st.open[groupKey] = !!open; }

  /** Form labels with the service prefix that the catalog does not know. */
  function unknownLabels(st) {
    var prefix = str(st.service.prefix);
    if (!prefix) return [];
    var regs = [];
    (st.service.groups || []).forEach(function (g) {
      (g.labels || []).forEach(function (l) { regs.push(R.patternRegex(l.key, st.kind)); });
    });
    var reps = repeatGroups(st.service).map(function (g) {
      var parts = str(g.repeat.multi).split('${I}');
      return { single: str(g.repeat.single), multi: new RegExp('^' + parts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\d+') };
    });
    return st.formList.filter(function (l) {
      if (l.key.indexOf(prefix) !== 0) return false;
      if (reps.some(function (r) { return (r.single && l.key.indexOf(r.single) === 0) || r.multi.test(l.key); })) return false;
      return !regs.some(function (re) { return re.test(l.key); });
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
    repeatGroups(st.service).forEach(function (g) {
      repeatGroupRows(st, g).blocks.forEach(function (b) { b.rows.forEach(function (r) { out.push(r); }); });
    });
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
    repeatGroups(st.service).forEach(function (g) {
      var info = st.repeat[g.name];
      if (info.form === 'mixed') p.errors.push({ key: g.repeat.single + '* / ' + g.repeat.multi.replace('${I}', 'n') + '*', error: 'beide Schreibweisen gleichzeitig vorhanden – bitte zuerst von Hand bereinigen' });
      repeatGroupRows(st, g).removed.forEach(function (b) {
        b.labels.forEach(function (l) { p.remove.push({ num: l.num, key: l.key, value: l.value }); });
      });
    });
    if (p.errors.length) return p;
    allRows(st).forEach(function (r) {
      if (!r.checked) {
        if (r.existing) p.remove.push({ num: r.existing.num, key: r.key, value: r.existing.value });
        return;
      }
      if (r.error) { p.errors.push({ key: r.key, error: r.error }); return; }
      if (r.xss) p.warnings.push({ key: r.key, text: 'Unraid entfernt < und >: kommt an als „' + r.xss + '“' });
      if (r.extra) p.warnings.push({ key: r.key, text: 'steht zusätzlich in Extra Parameters (der Wert dort gewinnt)' });
      if (r.existing && r.srcKey !== r.key) {
        // repeat block renumbered: move the label to its new key
        p.remove.push({ num: r.existing.num, key: r.srcKey, value: r.existing.value, moved: r.key });
      } else if (r.existing) {
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
    addBlock: addBlock,
    removeBlock: removeBlock,
    setOpen: setOpen,
    setChecked: setChecked,
    setValue: setValue,
    resetValue: resetValue,
    setDisplay: setDisplay,
    plan: plan
  };
});

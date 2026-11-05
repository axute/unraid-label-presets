/* Label Presets – the label book (UI).
 * Index of services -> service page with namespaces, variables and label rows.
 * Decisions live in bookmodel.js; form access in formbridge.js. */
(function ($) {
  'use strict';
  if (!$) return;

  var LP = window.LabelPresets || {};
  var DATA = window.LabelPresetsData || { services: [], settings: {} };
  var $dlg = null, ctx = null, st = null, query = '';

  var STATUS = {
    neu: ['neu', 'lp-st-new'],
    vorhanden: ['vorhanden', 'lp-st-ok'],
    abweichend: ['abweichend', 'lp-st-diff'],
    extra: ['in Extra Parameters', 'lp-st-extra']
  };

  function el(tag, cls, text) {
    var $e = $('<' + tag + '>');
    if (cls) $e.addClass(cls);
    if (text != null) $e.text(text);
    return $e;
  }
  function icon(name) {
    var n = String(name || 'fa-tags').replace(/[^a-z0-9-]/gi, '');
    return el('i', 'fa fa-fw ' + (n.indexOf('fa-') === 0 ? n : 'fa-' + n));
  }

  function services() {
    var hidden = (DATA.settings && DATA.settings.hidden) || [];
    return (DATA.services || []).filter(function (s) { return hidden.indexOf(s.id) < 0; });
  }

  // ------------------------------------------------------------------ context

  function readContext() {
    var f = LP.form, R = LP.resolve;
    var c = f.readContainer();
    return {
      container: c,
      formLabels: f.readLabels().map(function (l) { return { num: l.num, key: l.key, value: l.value, disabled: l.disabled }; }),
      extraLabels: R.parseExtraLabels(c.extraParams),
      env: { serverHost: window.location.hostname },
      settings: DATA.settings || {}
    };
  }

  // ------------------------------------------------------------------ dialog

  function open() {
    if (!LP.form || !LP.form.available()) { alert('Label Presets: Das Container-Formular wurde nicht gefunden.'); return; }
    ctx = readContext();
    st = null;
    if (!$dlg) $dlg = $('<div id="lp-book" class="lp-book"></div>').appendTo('body');
    $dlg.dialog({
      title: 'Label-Buch',
      modal: true, resizable: true,
      width: Math.min(980, $(window).width() - 32),
      height: Math.min(760, $(window).height() - 48),
      close: function () { $dlg.empty(); st = null; }
    });
    // like Unraid's own dialogs: no titlebar close button ("Abbrechen" and Esc close)
    $dlg.closest('.ui-dialog').addClass('lp-dialog').find('.ui-dialog-titlebar-close').hide();
    renderIndex();
  }

  function setButtons(list) { $dlg.dialog('option', 'buttons', list); }

  // ------------------------------------------------------------------ index page

  function renderIndex() {
    st = null;
    $dlg.empty();
    $dlg.closest('.ui-dialog').find('.lp-summary').remove();
    $dlg.dialog('option', 'title', 'Label-Buch' + (ctx.container.name ? ' · ' + ctx.container.name : ''));
    setButtons([{ text: 'Schließen', click: function () { $dlg.dialog('close'); } }]);

    var $search = $('<input type="search" class="lp-search" placeholder="Dienst oder Label suchen …">').val(query);
    $dlg.append(el('div', 'lp-searchbar').append(icon('search'), $search));
    var $list = el('div', 'lp-index');
    $dlg.append($list);

    if (DATA.catalogErrors && DATA.catalogErrors.length) {
      var $err = el('div', 'lp-note lp-warn').append(icon('exclamation-triangle'), el('span', null, ' Katalog-Fehler: ' +
        DATA.catalogErrors.map(function (e) { return e.file.split('/').pop() + ' (' + e.error + ')'; }).join('; ')));
      $dlg.prepend($err);
    }

    function draw() {
      var q = query.trim().toLowerCase();
      $list.empty();
      var items = services().map(function (s) {
        return { s: s, stats: LP.model.serviceStats(s, ctx.formLabels, ctx.container.name), hits: matches(s, q) };
      }).filter(function (i) { return !q || i.hits.service || i.hits.labels.length; });
      items.sort(function (a, b) { return (b.stats.labels > 0) - (a.stats.labels > 0) || a.s.name.localeCompare(b.s.name); });
      if (!items.length) $list.append(el('p', 'lp-empty', q ? 'Nichts gefunden.' : 'Keine Dienste im Katalog.'));
      items.forEach(function (i) {
        var $card = el('button', 'lp-card').attr('type', 'button');
        $card.append(el('span', 'lp-card-icon').append(icon(i.s.icon)));
        var $body = el('span', 'lp-card-body');
        $body.append(el('span', 'lp-card-title', i.s.name), el('span', 'lp-card-desc', i.s.description || ''));
        if (q && i.hits.labels.length) $body.append(el('span', 'lp-card-hits', 'Treffer: ' + i.hits.labels.slice(0, 3).join(', ') + (i.hits.labels.length > 3 ? ' …' : '')));
        $card.append($body);
        var badge = i.stats.labels ? i.stats.labels + ' Label' + (i.stats.labels === 1 ? '' : 's') + (i.stats.namespaces > 1 ? ' · ' + i.stats.namespaces + ' NS' : '') : '–';
        $card.append(el('span', 'lp-badge' + (i.stats.labels ? ' lp-badge-on' : ''), badge));
        $card.on('click', function () { renderService(i.s); });
        $list.append($card);
      });
    }
    $search.on('input', function () { query = $(this).val(); draw(); });
    draw();
    setTimeout(function () { $search.trigger('focus'); }, 0);
  }

  function matches(s, q) {
    var res = { service: false, labels: [] };
    if (!q) return res;
    res.service = (s.name + ' ' + (s.description || '') + ' ' + s.id).toLowerCase().indexOf(q) >= 0;
    (s.groups || []).forEach(function (g) {
      (g.labels || []).forEach(function (l) {
        var t = (l.key + ' ' + (l.title || '') + ' ' + (l.description || '')).toLowerCase();
        if (t.indexOf(q) >= 0) res.labels.push(l.title || l.key);
      });
    });
    return res;
  }

  // ------------------------------------------------------------------ service page

  function renderService(service) {
    st = LP.model.createState(service, ctx);
    st.textMode = {};
    $dlg.dialog('option', 'title', service.name + (ctx.container.name ? ' · ' + ctx.container.name : ''));
    setButtons([
      { text: '← Index', click: function () { renderIndex(); } },
      { text: 'Abbrechen', click: function () { $dlg.dialog('close'); } },
      { text: 'Übernehmen', 'class': 'lp-apply', click: apply }
    ]);
    redraw();
  }

  function redraw() {
    var scroll = $dlg.scrollTop();
    $dlg.empty();
    var s = st.service, M = LP.model;

    var $head = el('div', 'lp-head');
    $head.append(el('span', 'lp-head-icon').append(icon(s.icon)), el('span', 'lp-head-desc', s.description || ''));
    if (s.docs) $head.append($('<a target="_blank" rel="noopener noreferrer" class="lp-docs"></a>').attr('href', s.docs).append(icon('external-link'), ' Doku'));
    $dlg.append($head);

    var needsName = st.kind !== 'none' && !st.containerName;
    if (needsName) $dlg.append(el('div', 'lp-note lp-warn').append(icon('exclamation-triangle'), el('span', null, ' Bitte zuerst oben im Formular einen Containernamen vergeben. Er ist der erste Namespace.')));

    var globals = M.globalVars(st);
    if (globals.length) $dlg.append(globalsBlock(globals));

    var groups = M.rows(st);
    groups.filter(function (g) { return g.scope === 'container'; }).forEach(function (g) { $dlg.append(groupBlock(g, '_')); });
    groups.filter(function (g) { return g.scope === 'repeat'; }).forEach(function (g) { $dlg.append(repeatBlock(g)); });

    if (st.kind !== 'none' && !needsName) {
      var ns = M.activeNs(st);
      $dlg.append(nsBar());
      var asked = M.askedVars(st, ns);
      if (asked.length) $dlg.append(askedBlock(asked, ns));
      groups.filter(function (g) { return g.scope === 'namespace'; }).forEach(function (g) { $dlg.append(groupBlock(g, 'ns:' + ns.name)); });
    }

    var unknown = M.unknownLabels(st);
    if (unknown.length) {
      var $d = $('<details class="lp-grp lp-unknown"></details>').append(el('summary').append(el('b', null, 'Weitere vorhandene Labels'), el('span', 'lp-counts').append(pill('', unknown.length + ' unbekannt'))));
      var $ul = el('ul', 'lp-unknown-list');
      unknown.forEach(function (l) { $ul.append(el('li').append(el('code', null, l.key), ' = ', el('code', null, l.value))); });
      $dlg.append($d.append(el('div', 'lp-grp-body').append($ul, el('p', 'lp-muted lp-hint', 'Diese Labels kennt der Katalog nicht. Das Buch lässt sie unverändert.'))));
    }

    $dlg.append(displayToggle());
    updateSummary();
    $dlg.scrollTop(scroll);
  }

  function pill(cls, text) { return el('span', 'lp-pill ' + cls, text); }

  // ---- collapsible group shell with a summary line
  function groupShell(key, title, sub, counts, autoOpen) {
    var open = Object.prototype.hasOwnProperty.call(st.open, key) ? st.open[key] : autoOpen;
    var $d = $('<details class="lp-grp"></details>').prop('open', !!open);
    var $sum = el('summary').append(el('b', null, title));
    if (sub) $sum.append(el('span', 'lp-muted lp-sub', sub));
    $sum.append(counts);
    $d.append($sum);
    $d.on('toggle', function () { LP.model.setOpen(st, key, this.open); });
    return $d;
  }

  function countsOf(rows) {
    var c = { abweichend: 0, neu: 0, vorhanden: 0, extra: 0, remove: 0, error: 0, on: 0 };
    rows.forEach(function (r) {
      if (r.checked) c.on++;
      if (r.checked && r.error) c.error++;
      if (r.existing && !r.checked) c.remove++;
      else if (r.checked || r.status === 'extra') c[r.status]++;
    });
    return c;
  }

  function countPills(c) {
    var $c = el('span', 'lp-counts');
    if (c.error) $c.append(pill('lp-st-err', c.error + ' Fehler'));
    if (c.abweichend) $c.append(pill('lp-st-diff', c.abweichend + ' abweichend'));
    if (c.remove) $c.append(pill('lp-st-err', c.remove + ' entfernen'));
    if (c.neu) $c.append(pill('lp-st-new', c.neu + ' neu'));
    if (c.vorhanden) $c.append(pill('lp-st-ok', c.vorhanden + ' vorhanden'));
    if (c.extra) $c.append(pill('lp-st-extra', c.extra + ' in Extra Parameters'));
    if (!$c.children().length) $c.append(el('span', 'lp-muted', 'nichts ausgewählt'));
    return $c;
  }

  function needsAttention(c) { return !!(c.error || c.abweichend || c.remove || c.neu || c.extra); }

  function groupBlock(g, scopeKey) {
    var c = countsOf(g.rows);
    var sub = (g.scope === 'container' ? 'pro Container' : (LP.model.activeNs(st) || {}).name) + ' · ' + c.on + '/' + g.rows.length + ' aktiv';
    var $d = groupShell(scopeKey + '|' + g.group.name, g.group.name, sub, countPills(c), needsAttention(c));
    var $body = el('div', 'lp-grp-body lp-rows');
    g.rows.forEach(function (r) { $body.append(labelRow(r)); });
    return $d.append($body);
  }

  function repeatBlock(g) {
    var all = [];
    g.blocks.forEach(function (b) { all = all.concat(b.rows); });
    var c = countsOf(all);
    c.remove += g.removed.reduce(function (n, b) { return n + b.labels.length; }, 0);
    var sub = g.blocks.length + ' ' + g.group.name + (g.blocks.length === 1 ? '' : 's');
    var $d = groupShell('rep|' + g.group.name, g.group.name, sub, countPills(c), needsAttention(c) || g.form === 'mixed');
    var $body = el('div', 'lp-grp-body');
    if (g.form === 'mixed') $body.append(el('div', 'lp-note lp-warn', 'Beide Schreibweisen (' + g.group.repeat.single + '… und ' + g.group.repeat.multi.replace('${I}', 'n') + '…) sind gleichzeitig vorhanden. Bitte zuerst von Hand bereinigen.'));
    g.blocks.forEach(function (b, i) {
      var $card = el('div', 'lp-block');
      var $h = el('div', 'lp-block-head').append(el('b', null, g.group.name + ' ' + (i + 1)), el('code', 'lp-muted', b.prefix + '…'));
      var $rm = el('button', 'lp-mini', 'entfernen').attr('type', 'button').on('click', function () { LP.model.removeBlock(st, g.group.name, b.block.id); redraw(); });
      $card.append($h.append($rm));
      var $rows = el('div', 'lp-rows');
      b.rows.forEach(function (r) { $rows.append(labelRow(r)); });
      $body.append($card.append($rows));
    });
    g.removed.forEach(function (b) {
      $body.append(el('div', 'lp-block lp-block-removed').append(el('div', 'lp-block-head').append(
        el('span', null, b.labels.length + ' Labels unter ' + b.block.src + '… werden entfernt'),
        el('button', 'lp-mini', 'rückgängig').attr('type', 'button').on('click', function () { b.block.removed = false; redraw(); }))));
    });
    var $add = el('button', 'lp-mini lp-add', '+ ' + g.group.name + ' hinzufügen').attr('type', 'button')
      .on('click', function () { LP.model.addBlock(st, g.group.name); LP.model.setOpen(st, 'rep|' + g.group.name, true); redraw(); });
    $body.append($add);
    if (g.blocks.length === 1) $body.append(el('p', 'lp-muted lp-hint', 'Ab zwei ' + g.group.name + 's schreibt das Buch die Labels automatisch in die nummerierte Form um (' + g.group.repeat.multi.replace('${I}', '0') + '…).'));
    return $d.append($body);
  }

  function globalsBlock(globals) {
    var missing = globals.filter(function (g) { return !g.set && !g.value; }).length;
    var $c = el('span', 'lp-counts').append(missing ? pill('lp-st-diff', missing + ' fehlt') : pill('lp-st-ok', 'gesetzt'));
    var $d = groupShell('globals', 'Globale Werte', 'gelten für alle Container', $c, missing > 0);
    var $body = el('div', 'lp-grp-body');
    globals.forEach(function (g) {
      var $row = el('label', 'lp-var');
      $row.append(el('span', 'lp-var-name', g.id));
      if (g.set && !g.overridden) {
        $row.append(el('span', 'lp-var-field').append(el('code', 'lp-var-value', g.value), el('span', 'lp-muted lp-hint', 'aus den Einstellungen')));
      } else {
        var $in = $('<input type="text" class="lp-input">').val(g.value).attr('placeholder', 'noch nicht gesetzt');
        $in.on('change', function () { st.globalsOverride[g.id] = $(this).val(); redraw(); });
        $row.append(el('span', 'lp-var-field').append($in, el('span', 'lp-muted lp-hint', g.set ? 'nur für jetzt geändert' : 'gilt nur für jetzt')));
      }
      $body.append($row);
    });
    $body.append(el('p', 'lp-muted lp-hint').append('Dauerhaft festlegen: ', $('<a target="_blank"></a>').attr('href', DATA.settingsUrl || '/Settings/LabelPresets').text('Einstellungen → Label Presets'), ' (neuer Tab, danach das Buch neu öffnen).'));
    return $d.append($body);
  }

  function askedBlock(asked, ns) {
    var $b = el('div', 'lp-asked');
    asked.forEach(function (v) {
      var $in = $('<input type="text" class="lp-input">').val(v.value);
      $in.on('change', function () { LP.model.setAsked(st, ns, v.id, $(this).val()); redraw(); });
      $b.append(el('label', 'lp-var').append(el('span', 'lp-var-name', v.label), el('span', 'lp-var-field').append($in)));
    });
    return $b;
  }

  function nsBar() {
    var $bar = el('div', 'lp-nsbar').append(el('span', 'lp-nsbar-label', 'Namespace:'));
    var $tabs = el('div', 'lp-nstabs');
    st.namespaces.forEach(function (ns, i) {
      var text = ns.name + (st.kind === 'index' && ns.index ? ' #' + ns.index : '');
      var $t = el('button', 'lp-ns' + (i === st.active ? ' lp-ns-active' : '') + (ns.found ? '' : ' lp-ns-new'), text).attr('type', 'button');
      if (ns.primary) $t.attr('title', st.kind === 'name' && ns.key !== st.containerName ? 'aus Containername „' + st.containerName + '“' : 'Containername');
      $t.on('click', function () { st.active = i; redraw(); });
      $tabs.append($t);
    });
    var $add = el('button', 'lp-ns lp-ns-add').attr({ type: 'button', title: 'Namespace hinzufügen' }).append(icon('plus'));
    $add.on('click', function () {
      var $in = $('<input type="text" class="lp-input lp-ns-input" placeholder="Name, Enter">');
      var $err = el('span', 'lp-error');
      $add.replaceWith($in, $err);
      $in.trigger('focus').on('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); redraw(); }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var r = LP.model.addNamespace(st, $in.val());
        if (r.ok) redraw(); else $err.text(' ' + r.error);
      });
    });
    $tabs.append($add);
    $bar.append($tabs);
    if (st.kind === 'name') {
      var ns = LP.model.activeNs(st);
      if (ns && ns.primary && ns.key !== st.containerName) $bar.append(el('span', 'lp-muted lp-hint', '„' + st.containerName + '“ → ' + ns.key));
    }
    return $bar;
  }

  // ---- inputs
  function valueInput(r) {
    var t = r.def.type || 'text', $in;
    if (t === 'schedule' && !st.textMode[r.id]) return scheduleInput(r);
    if (t === 'bool') {
      $in = $('<select class="lp-input"><option value="true">true</option><option value="false">false</option></select>');
      if (r.value !== 'true' && r.value !== 'false') $in.prepend($('<option>').val(r.value).text(r.value));
    } else if (t === 'enum') {
      $in = $('<select class="lp-input"></select>');
      var opts = (r.def.options || []).slice();
      if (opts.indexOf(r.value) < 0) opts.unshift(r.value);
      opts.forEach(function (o) { $in.append($('<option>').val(o).text(o)); });
    } else {
      $in = $('<input type="text" class="lp-input" spellcheck="false" autocomplete="off">');
      if (t === 'port' || t === 'number') $in.attr('inputmode', 'numeric');
      if (r.def.mask) $in.attr('type', 'password');
    }
    $in.val(r.value);
    $in.on('change', function () { LP.model.setValue(st, r.id, $(this).val()); redraw(); });
    if (t === 'schedule') return el('span', 'lp-sched-text').append($in, textToggle(r, false));
    return $in;
  }

  var DAY_PRESETS = [['', 'täglich'], ['mon-fri', 'Mo–Fr'], ['sat-sun', 'Sa–So'], ['mon', 'Mo'], ['tue', 'Di'], ['wed', 'Mi'], ['thu', 'Do'], ['fri', 'Fr'], ['sat', 'Sa'], ['sun', 'So']];

  function textToggle(r, toText) {
    return el('a', 'lp-take', toText ? 'als Text' : 'als Liste').attr('href', '#').on('click', function (e) {
      e.preventDefault(); st.textMode[r.id] = toText; redraw();
    });
  }

  function scheduleInput(r) {
    var R = LP.resolve, parsed = R.parseSchedule(r.value);
    if (parsed.error && r.value) { st.textMode[r.id] = true; return valueInput(r); }
    var entries = parsed.entries.length ? parsed.entries : [{ days: '', time: '' }];
    var $box = el('div', 'lp-sched');
    function commit() { LP.model.setValue(st, r.id, R.formatSchedule(entries)); redraw(); }
    entries.forEach(function (en, i) {
      var $days = $('<select class="lp-input lp-sched-days"></select>');
      var known = DAY_PRESETS.some(function (p) { return p[0] === (en.days === 'daily' ? '' : en.days); });
      if (!known) $days.append($('<option>').val(en.days).text(en.days));
      DAY_PRESETS.forEach(function (p) { $days.append($('<option>').val(p[0]).text(p[1])); });
      $days.val(en.days === 'daily' ? '' : en.days).on('change', function () { en.days = $(this).val(); commit(); });
      var $time = $('<input type="time" class="lp-input lp-sched-time">').val(en.time).on('change', function () { en.time = $(this).val(); commit(); });
      var $rm = el('button', 'lp-mini', '✕').attr({ type: 'button', title: 'Zeit entfernen' }).on('click', function () { entries.splice(i, 1); commit(); });
      $box.append(el('div', 'lp-sched-row').append($days, $time, entries.length > 1 ? $rm : null));
    });
    var $more = el('button', 'lp-mini', '+ Zeit').attr('type', 'button').on('click', function () { entries.push({ days: '', time: '12:00' }); commit(); });
    $box.append(el('div', 'lp-sched-foot').append($more, textToggle(r, true)));
    return $box;
  }

  function labelRow(r) {
    var $r = el('div', 'lp-row' + (r.checked ? '' : ' lp-off') + (r.existing && !r.checked ? ' lp-removing' : ''));
    var $cb = $('<input type="checkbox" class="lp-check">').prop('checked', r.checked).attr('aria-label', r.def.title || r.key);
    $cb.on('change', function () { LP.model.setChecked(st, r.id, this.checked); redraw(); });

    var $name = el('div', 'lp-cell-name').append(el('span', 'lp-row-name', r.def.title || r.key));
    if (r.def.description) $name.append(el('span', 'lp-help', '?').attr('title', r.def.description));
    $name.append(el('code', 'lp-key', r.key));

    var $val = el('div', 'lp-cell-value').append(valueInput(r));
    if (r.source && !r.touched && !r.existing) $val.append(el('span', 'lp-source', r.source));
    if (r.status === 'abweichend' && r.proposedComplete && r.value !== r.proposed) {
      var $take = el('a', 'lp-take', 'übernehmen').attr('href', '#').on('click', function (e) { e.preventDefault(); LP.model.setValue(st, r.id, r.proposed); redraw(); });
      $val.append(el('div', 'lp-proposal').append('Vorschlag: ', el('code', null, r.proposed), ' ', $take));
    }
    if (r.touched && r.existing && r.value !== r.existing.value) {
      var $undo = el('a', 'lp-take', 'zurück').attr('href', '#').on('click', function (e) { e.preventDefault(); LP.model.resetValue(st, r.id); redraw(); });
      $val.append(el('div', 'lp-proposal').append('bisher: ', el('code', null, r.existing.value), ' ', $undo));
    }
    if (r.existing && r.srcKey && r.srcKey !== r.key && r.checked) $val.append(el('div', 'lp-warn-text', 'wird verschoben von ' + r.srcKey));
    if (r.extra) $val.append(el('div', 'lp-warn-text', 'Steht in Extra Parameters: ' + r.extra.value));
    if (r.existing && !r.checked) $val.append(el('div', 'lp-warn-text', 'wird beim Übernehmen entfernt'));
    if (r.checked && r.error) $val.append(el('div', 'lp-error', r.error));
    if (r.checked && r.xss != null) $val.append(el('div', 'lp-warn-text', 'Unraid entfernt < und > – kommt an als: ' + r.xss));

    var stt = r.existing && !r.checked ? ['entfernen', 'lp-st-err'] : STATUS[r.status];
    return $r.append(el('label', 'lp-cell-check').append($cb), $name, $val, el('div', 'lp-cell-status').append(pill(stt[1], stt[0])));
  }

  function displayToggle() {
    var $s = $('<select class="lp-input"><option value="advanced">ausgeblendet einfügen (unter „Show more settings“)</option><option value="always">sichtbar einfügen</option></select>').val(st.display);
    $s.on('change', function () { LP.model.setDisplay(st, $(this).val()); });
    return el('div', 'lp-display').append(el('span', null, 'Neue Labels: '), $s, el('span', 'lp-muted lp-hint', 'Vorhandene Labels bleiben, wo sie sind.'));
  }

  function updateSummary() {
    var p = LP.model.plan(st);
    var moved = p.remove.filter(function (r) { return r.moved; }).length;
    var text = p.errors.length ? p.errors.length + ' Fehler – bitte korrigieren'
      : 'Beim Übernehmen: ' + (p.add.length - moved) + ' hinzufügen, ' + p.update.length + ' ändern, ' + (p.remove.length - moved) + ' entfernen' + (moved ? ', ' + moved + ' verschieben' : '');
    var $pane = $dlg.closest('.ui-dialog').find('.ui-dialog-buttonpane');
    var $s = $pane.find('.lp-summary');
    if (!$s.length) $s = el('span', 'lp-summary').prependTo($pane);
    $s.text(text).toggleClass('lp-error', !!p.errors.length);
  }

  // ------------------------------------------------------------------ apply

  function apply() {
    var p = LP.model.plan(st);
    if (p.errors.length) {
      alert('Bitte erst korrigieren:\n\n' + p.errors.map(function (e) { return '• ' + e.key + ': ' + e.error; }).join('\n'));
      return;
    }
    if (!p.add.length && !p.update.length && !p.remove.length) { $dlg.dialog('close'); return; }
    var lines = [];
    var rm = p.remove.filter(function (r) { return !r.moved; }), mv = p.remove.filter(function (r) { return r.moved; });
    if (rm.length) lines.push('Entfernen:\n' + rm.map(function (r) { return '• ' + r.key; }).join('\n'));
    if (mv.length) lines.push('Umbenennen:\n' + mv.map(function (r) { return '• ' + r.key + ' → ' + r.moved; }).join('\n'));
    if (p.warnings.length) lines.push('Hinweise:\n' + p.warnings.map(function (w) { return '• ' + w.key + ': ' + w.text; }).join('\n'));
    if (lines.length && !confirm(lines.join('\n\n') + '\n\nTrotzdem übernehmen?')) return;

    var f = LP.form;
    p.remove.forEach(function (r) { f.removeLabel(r.num); });
    p.update.forEach(function (u) { f.updateLabel(u.num, u.value); });
    var advanced = false;
    p.add.forEach(function (a) { f.addLabel(a); if (a.display !== 'always') advanced = true; });
    f.finish({ revealAdvanced: advanced });
    $dlg.dialog('close');
    toast((p.add.length - mv.length) + ' hinzugefügt, ' + p.update.length + ' geändert, ' + rm.length + ' entfernt' + (mv.length ? ', ' + mv.length + ' umbenannt' : '') + '. Zum Speichern „Apply“ klicken.');
  }

  function toast(text) {
    var $t = $('#lp-toast');
    if (!$t.length) $t = el('span', 'lp-toast').attr('id', 'lp-toast');
    var $a = LP.form.anchor();
    $a.parent().find('.lp-open-wrap').append($t);
    $t.text(' ' + text).stop(true, true).show();
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { $t.fadeOut(400); }, 8000);
  }

  // ------------------------------------------------------------------ entry

  $(function () {
    if (!LP.form || !LP.model) return;
    var $a = LP.form.anchor();
    if (!$a.length) return;
    var $link = $('<a href="#" class="lp-open"></a>').append(icon('book'), ' Label-Buch öffnen');
    $link.on('click', function (e) { e.preventDefault(); open(); });
    $a.after(el('span', 'lp-open-wrap').append('\u00a0\u00a0 ', $link));
  });

  LP.book = { open: open };
  window.LabelPresets = LP;
})(window.jQuery);

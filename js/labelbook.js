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

    // global variables
    var globals = M.globalVars(st);
    if (globals.length) {
      $dlg.append(globalsBlock(globals));
      if (globals.some(function (g) { return !g.set; })) $dlg.find('.lp-vars').last().append(el('p', 'lp-muted lp-hint', 'Dauerhaft setzen kannst du globale Werte später auf der Einstellungsseite.'));
    }

    // container groups
    var groups = M.rows(st);
    groups.filter(function (g) { return g.scope === 'container'; }).forEach(function (g) { $dlg.append(groupBlock(g)); });

    // namespaces
    if (st.kind !== 'none' && !needsName) {
      $dlg.append(nsBar());
      var ns = M.activeNs(st);
      var asked = M.askedVars(st, ns);
      if (asked.length) $dlg.append(askedBlock(asked, ns));
      groups.filter(function (g) { return g.scope === 'namespace'; }).forEach(function (g) { $dlg.append(groupBlock(g)); });
    }

    var unknown = M.unknownLabels(st);
    if (unknown.length) {
      var $d = $('<details class="lp-unknown"></details>').append(el('summary', null, 'Weitere vorhandene Labels (' + unknown.length + ')'));
      var $ul = el('ul');
      unknown.forEach(function (l) { $ul.append(el('li').append(el('code', null, l.key), ' = ', el('code', null, l.value))); });
      $dlg.append($d.append($ul, el('p', 'lp-muted', 'Diese Labels kennt der Katalog nicht. Das Buch lässt sie unverändert.')));
    }

    $dlg.append(displayToggle());
    $dlg.scrollTop(scroll);
  }

  function globalsBlock(globals) {
    var $b = el('fieldset', 'lp-vars').append(el('legend', null, 'Globale Werte'));
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
      $b.append($row);
    });
    return $b;
  }

  function askedBlock(asked, ns) {
    var $b = el('fieldset', 'lp-vars').append(el('legend', null, 'Werte für ' + ns.name));
    asked.forEach(function (v) {
      var $in = $('<input type="text" class="lp-input">').val(v.value);
      $in.on('change', function () { LP.model.setAsked(st, ns, v.id, $(this).val()); redraw(); });
      $b.append(el('label', 'lp-var').append(el('span', 'lp-var-name', v.label), el('span', 'lp-var-field').append($in)));
    });
    return $b;
  }

  function nsBar() {
    var $bar = el('div', 'lp-nsbar').append(el('span', 'lp-nsbar-label', 'Namespace:'));
    st.namespaces.forEach(function (ns, i) {
      var text = ns.name + (st.kind === 'index' && ns.index ? ' #' + ns.index : '');
      var $t = el('button', 'lp-ns' + (i === st.active ? ' lp-ns-active' : '') + (ns.found ? '' : ' lp-ns-new'), text).attr('type', 'button');
      if (ns.primary) $t.attr('title', st.kind === 'name' && ns.key !== st.containerName ? 'aus Containername „' + st.containerName + '“' : 'Containername');
      $t.on('click', function () { st.active = i; redraw(); });
      $bar.append($t);
    });
    var $add = el('button', 'lp-ns lp-ns-add').attr({ type: 'button', title: 'Namespace hinzufügen' }).append(icon('plus'));
    $add.on('click', function () {
      var $in = $('<input type="text" class="lp-input lp-ns-input" placeholder="Name">');
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
    $bar.append($add);
    if (st.kind === 'name') {
      var ns = LP.model.activeNs(st);
      if (ns && ns.primary && ns.key !== st.containerName) $bar.append(el('span', 'lp-muted', ' „' + st.containerName + '“ → ' + ns.key));
    }
    return $bar;
  }

  function groupBlock(g) {
    var $b = el('fieldset', 'lp-group').append(el('legend', null, g.group.name + (g.scope === 'container' ? ' (pro Container)' : '')));
    g.rows.forEach(function (r) { $b.append(labelRow(r)); });
    return $b;
  }

  function valueInput(r) {
    var t = r.def.type || 'text', $in;
    if (t === 'bool') {
      $in = $('<select class="lp-input"><option value="true">true</option><option value="false">false</option></select>');
      if (r.value !== 'true' && r.value !== 'false') $in.append($('<option>').val(r.value).text(r.value));
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
    return $in;
  }

  function labelRow(r) {
    var $r = el('div', 'lp-row' + (r.checked ? '' : ' lp-off'));
    var $cb = $('<input type="checkbox" class="lp-check">').prop('checked', r.checked);
    $cb.on('change', function () { LP.model.setChecked(st, r.id, this.checked); redraw(); });

    var $title = el('div', 'lp-row-title').append(el('span', 'lp-row-name', r.def.title || r.key));
    var stt = STATUS[r.status];
    $title.append(el('span', 'lp-status ' + stt[1], stt[0]));
    if (r.def.description) $title.append(el('span', 'lp-help', '?').attr('title', r.def.description));

    var $val = el('div', 'lp-row-value').append(valueInput(r));
    if (r.source && !r.touched && !r.existing) $val.append(el('span', 'lp-source', r.source));

    var $meta = el('div', 'lp-row-meta').append(el('code', 'lp-key', r.key));
    if (r.status === 'abweichend' && r.proposedComplete && r.value !== r.proposed) {
      var $take = el('a', 'lp-take', 'übernehmen').attr('href', '#').on('click', function (e) { e.preventDefault(); LP.model.setValue(st, r.id, r.proposed); redraw(); });
      $meta.append(el('div', 'lp-proposal').append('Vorschlag: ', el('code', null, r.proposed), ' ', $take));
    }
    if (r.touched && r.existing && r.value !== r.existing.value) {
      var $undo = el('a', 'lp-take', 'zurück').attr('href', '#').on('click', function (e) { e.preventDefault(); LP.model.resetValue(st, r.id); redraw(); });
      $meta.append(el('div', 'lp-proposal').append('bisher: ', el('code', null, r.existing.value), ' ', $undo));
    }
    if (r.extra) $meta.append(el('div', 'lp-warn-text', 'Steht in Extra Parameters: ' + r.extra.value));
    if (r.existing && !r.checked) $meta.append(el('div', 'lp-warn-text', 'wird beim Übernehmen entfernt'));
    if (r.checked && r.error) $meta.append(el('div', 'lp-error', r.error));
    if (r.checked && r.xss != null) $meta.append(el('div', 'lp-warn-text', 'Unraid entfernt < und > – kommt an als: ' + r.xss));

    var $left = el('div', 'lp-row-left').append($title, el('code', 'lp-key', r.key));
    $meta.find('.lp-key').remove();
    return $r.append(el('label', 'lp-row-check').append($cb), el('div', 'lp-row-main').append($left, el('div', 'lp-row-right').append($val, $meta)));
  }

  function displayToggle() {
    var $s = $('<select class="lp-input"><option value="advanced">ausgeblendet einfügen (unter „Show more settings“)</option><option value="always">sichtbar einfügen</option></select>').val(st.display);
    $s.on('change', function () { LP.model.setDisplay(st, $(this).val()); });
    return el('div', 'lp-display').append(el('span', null, 'Neue Labels: '), $s, el('span', 'lp-muted', ' Vorhandene Labels bleiben, wo sie sind.'));
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
    if (p.remove.length) lines.push('Entfernen:\n' + p.remove.map(function (r) { return '• ' + r.key; }).join('\n'));
    if (p.warnings.length) lines.push('Hinweise:\n' + p.warnings.map(function (w) { return '• ' + w.key + ': ' + w.text; }).join('\n'));
    if (lines.length && !confirm(lines.join('\n\n') + '\n\nTrotzdem übernehmen?')) return;

    var f = LP.form;
    p.remove.forEach(function (r) { f.removeLabel(r.num); });
    p.update.forEach(function (u) { f.updateLabel(u.num, u.value); });
    var advanced = false;
    p.add.forEach(function (a) { f.addLabel(a); if (a.display !== 'always') advanced = true; });
    f.finish({ revealAdvanced: advanced });
    $dlg.dialog('close');
    toast(p.add.length + ' hinzugefügt, ' + p.update.length + ' geändert, ' + p.remove.length + ' entfernt. Zum Speichern „Apply“ klicken.');
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

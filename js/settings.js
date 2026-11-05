/* Label Presets – settings page. */
(function ($) {
  'use strict';
  if (!$) return;
  var D = window.LabelPresetsSettings || { services: [], shipped: {}, settings: {}, errors: [] };
  var SAVE = '/plugins/label.presets/include/save.php';
  var editing = null; // id being edited, or '' for a new service

  function el(tag, cls, text) { var $e = $('<' + tag + '>'); if (cls) $e.addClass(cls); if (text != null) $e.text(text); return $e; }

  function post(action, fields) {
    return $.ajax({ url: SAVE, method: 'POST', dataType: 'json',
      data: $.extend({ action: action, csrf_token: window.csrf_token }, fields) })
      .then(function (r) { return r && r.ok ? r : $.Deferred().reject(r && r.error || 'Unbekannter Fehler'); },
            function (x) { return $.Deferred().reject('Server antwortet nicht (' + x.status + ')'); });
  }

  function msg($m, text, ok) {
    $m.text(text).toggleClass('lp-ok', !!ok).toggleClass('lp-bad', !ok);
    if (ok) setTimeout(function () { $m.text(''); }, 4000);
  }

  // ---------------------------------------------------------------- globals

  function usedBy() {
    var map = {};
    D.services.forEach(function (s) {
      var text = JSON.stringify(s.groups || []) + JSON.stringify(s.variables || []);
      var names = (s.globals || []).slice();
      (text.match(/\$\{([A-Z0-9_]+)\}/g) || []).forEach(function (m) { names.push(m.slice(2, -1)); });
      names.forEach(function (n) { (map[n] = map[n] || []).indexOf(s.name) < 0 && map[n].push(s.name); });
    });
    return map;
  }

  function renderGlobals() {
    var used = usedBy(), g = D.settings.globals || {};
    var names = Object.keys(g);
    // suggest globals that services declare but are not set yet
    D.services.forEach(function (s) { (s.globals || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); }); });
    names.sort();
    var $box = $('#lp-globals').empty();
    names.forEach(function (n) { $box.append(globalRow(n, g[n] || '', used[n])); });
    if (!names.length) $box.append(el('p', 'lp-muted', 'Noch keine globalen Werte.'));
  }

  function globalRow(name, value, users) {
    var $r = el('div', 'lp-grow');
    var $n = $('<input type="text" class="lp-gname" placeholder="NAME" spellcheck="false">').val(name);
    var $v = $('<input type="text" class="lp-gvalue" placeholder="Wert" spellcheck="false">').val(value);
    var $rm = el('button', 'lp-mini', '✕').attr({ type: 'button', title: 'Entfernen' }).on('click', function () { $r.remove(); });
    $n.on('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); });
    $r.append($n, $v, $rm, el('span', 'lp-muted lp-users', users && users.length ? 'genutzt von ' + users.join(', ') : ''));
    return $r;
  }

  function collectSettings() {
    var globals = {};
    $('#lp-globals .lp-grow').each(function () {
      var n = $(this).find('.lp-gname').val().trim(), v = $(this).find('.lp-gvalue').val();
      if (n && v !== '') globals[n] = v;
    });
    var hidden = [];
    $('#lp-services .lp-visible').each(function () { if (!this.checked) hidden.push($(this).data('id')); });
    return { globals: globals, defaultDisplay: $('#lp-display').val(), hidden: hidden };
  }

  function saveSettings() {
    var data = collectSettings();
    post('settings', { data: JSON.stringify(data) }).then(function () {
      D.settings = data;
      renderGlobals();
      msg($('#lp-save-msg'), 'Gespeichert.', true);
    }, function (e) { msg($('#lp-save-msg'), e, false); });
  }

  // ---------------------------------------------------------------- services

  function renderServices() {
    var hidden = D.settings.hidden || [];
    var $t = $('#lp-services').empty();
    $t.append(el('thead').append(el('tr').append(el('th', null, 'Dienst'), el('th', null, 'Herkunft'), el('th', null, 'Im Buch'), el('th', null, ''))));
    var $b = el('tbody');
    D.services.forEach(function (s) {
      var $actions = el('td', 'lp-act');
      if (s.origin === 'mitgeliefert') {
        $actions.append(el('button', 'lp-mini', 'Kopie anpassen').attr('type', 'button').on('click', function () { openEditor(s.id, D.shipped[s.id]); }));
      } else {
        $actions.append(el('button', 'lp-mini', 'Bearbeiten').attr('type', 'button').on('click', function () { openEditor(s.id, s); }));
        $actions.append(el('button', 'lp-mini', s.origin === 'überschrieben' ? 'Zurücksetzen' : 'Löschen').attr('type', 'button').on('click', function () { removeService(s); }));
      }
      var $vis = $('<input type="checkbox" class="lp-visible">').data('id', s.id).prop('checked', hidden.indexOf(s.id) < 0);
      var labels = (s.groups || []).reduce(function (n, g) { return n + (g.labels || []).length; }, 0);
      $b.append(el('tr').append(
        el('td').append(el('b', null, s.name), el('div', 'lp-muted', (s.description || '') + ' · ' + labels + ' Labels')),
        el('td').append(el('span', 'lp-origin lp-origin-' + s.origin.replace('ü', 'u'), s.origin)),
        el('td').append($('<label class="lp-vis"></label>').append($vis, ' anzeigen')),
        $actions));
    });
    $t.append($b);
  }

  function clean(s) { var c = $.extend(true, {}, s); delete c.origin; return c; }

  function openEditor(id, svc) {
    editing = id;
    $('#lp-editor').prop('hidden', false);
    $('#lp-editor-title').text(id ? (D.shipped[id] && svc === D.shipped[id] ? 'Kopie von „' + svc.name + '“ anpassen' : '„' + svc.name + '“ bearbeiten') : 'Neuer Dienst');
    $('#lp-editor-text').val(JSON.stringify(clean(svc), null, 2));
    $('#lp-editor-msg').text('');
    $('#lp-editor')[0].scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function saveService() {
    var text = $('#lp-editor-text').val(), parsed;
    try { parsed = JSON.parse(text); } catch (e) { msg($('#lp-editor-msg'), 'Kein gültiges JSON: ' + e.message, false); return; }
    if (editing && parsed.id !== editing && !confirm('Die id wurde von „' + editing + '“ zu „' + parsed.id + '“ geändert. Das legt einen neuen Eintrag an. Fortfahren?')) return;
    post('service_save', { data: JSON.stringify(parsed) }).then(function () {
      msg($('#lp-editor-msg'), 'Gespeichert. Seite wird neu geladen …', true);
      setTimeout(function () { location.reload(); }, 600);
    }, function (e) { msg($('#lp-editor-msg'), e, false); });
  }

  function removeService(s) {
    var q = s.origin === 'überschrieben'
      ? 'Eigene Kopie von „' + s.name + '“ löschen und den mitgelieferten Eintrag wieder verwenden?'
      : 'Eigenen Dienst „' + s.name + '“ löschen?';
    if (!confirm(q)) return;
    post('service_delete', { id: s.id }).then(function () { location.reload(); }, function (e) { alert(e); });
  }

  var TEMPLATE = {
    id: 'mein-dienst', name: 'Mein Dienst', description: 'Wofür die Labels sind.', icon: 'fa-tags',
    docs: '', prefix: 'meindienst.', namespace: 'none', display: 'advanced',
    groups: [{ name: 'Basis', scope: 'container', labels: [
      { key: 'meindienst.enable', type: 'bool', value: 'true', title: 'Aktivieren', recommended: true },
      { key: 'meindienst.url', type: 'text', value: '${WEBUI_URL}', title: 'Link' }
    ] }]
  };

  // ---------------------------------------------------------------- init

  $(function () {
    if (D.errors && D.errors.length) {
      var $e = el('div', 'lp-errbox').append(el('b', null, 'Diese Katalog-Dateien wurden übersprungen:'));
      var $ul = el('ul');
      D.errors.forEach(function (x) { $ul.append(el('li').append(el('code', null, x.file), ' – ' + x.error)); });
      $('#lp-errors').append($e.append($ul));
    }
    $('#lp-display').val(D.settings.defaultDisplay || 'advanced');
    renderGlobals();
    renderServices();
    $('#lp-global-add').on('click', function () { $('#lp-globals .lp-muted').filter('p').remove(); $('#lp-globals').append(globalRow('', '', null)); $('#lp-globals .lp-gname').last().trigger('focus'); });
    $('#lp-save').on('click', saveSettings);
    $('#lp-services').on('change', '.lp-visible', saveSettings);
    $('#lp-new').on('click', function () { openEditor('', TEMPLATE); });
    $('#lp-editor-save').on('click', saveService);
    $('#lp-editor-cancel').on('click', function () { editing = null; $('#lp-editor').prop('hidden', true); });
  });
})(window.jQuery);

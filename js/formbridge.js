/* Label Presets – form bridge.
 *
 * The only file that touches Unraid's Add/Edit Container internals
 * (CreateDocker.php). Everything else talks to window.LabelPresets.form.
 * Verified against Unraid 7.3.4, see NOTES-7.3.4.md.
 *
 * Rules (do not break):
 * - call window.makeConfig at click time, never cache or wrap it
 *   (Docker Template Fields wraps it in its ready handler)
 * - no submit hook
 * - no unnamed <input> inside ConfigNum rows (editConfigPopup() would throw)
 */
(function ($) {
  'use strict';
  if (!$) return;

  var LISTS = '#configLocation, #configLocationAdvanced';
  var ROW = 'div[id^="ConfigNum"]';
  var LABEL_TYPE = /^(Disabled:)?Label$/i;

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // makeConfig() runs escapeQuote() on Value itself, so only & is left to us
  function escValue(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;'); }

  function field(row, name) { return $(row).find('input[name="conf' + name + '[]"]').first(); }

  function rowNum(row) { return parseInt(String(row.id).replace('ConfigNum', ''), 10); }

  /** True when the page offers everything this bridge relies on. */
  function available() {
    return typeof window.makeConfig === 'function' &&
      typeof window.confNum === 'number' &&
      $('#configLocation').length > 0 && $('#configLocationAdvanced').length > 0;
  }

  /** All label rows currently in the form, in DOM order. */
  function readLabels() {
    var out = [];
    $(LISTS).children(ROW).each(function () {
      var type = field(this, 'Type').val() || '';
      if (!LABEL_TYPE.test(type)) return;
      var value = $(this).find('[name="confValue[]"]').first().val();
      var def = field(this, 'Default').val();
      out.push({
        num: rowNum(this),
        key: field(this, 'Target').val() || '',
        value: (value != null && value !== '') ? value : (def || ''),
        name: field(this, 'Name').val() || '',
        display: field(this, 'Display').val() || '',
        disabled: /^Disabled:/i.test(type),
        el: this
      });
    });
    return out;
  }

  /** Map of key -> label row (first one wins; duplicates are reported). */
  function labelsByKey() {
    var map = {}, dupes = [];
    readLabels().forEach(function (l) {
      if (map[l.key]) dupes.push(l.key); else map[l.key] = l;
    });
    return { map: map, duplicates: dupes };
  }

  // Edit/Remove texts come translated from Unraid; borrow them from an existing row
  function buttonTexts() {
    var t = { edit: 'Edit', remove: 'Remove' };
    var $e = $(LISTS).find('button[onclick^="editConfigPopup"]').first();
    var $r = $(LISTS).find('button[onclick^="removeConfig"]').first();
    if ($e.length) t.edit = $e.text();
    if ($r.length) t.remove = $r.text();
    return t;
  }

  function buttonsHtml(num, display) {
    var t = buttonTexts();
    var b = "<button type='button' onclick='editConfigPopup(" + num + ",false)'>" + escHtml(t.edit) + "</button>" +
            "<button type='button' onclick='removeConfig(" + num + ")'>" + escHtml(t.remove) + "</button>";
    if (display === 'always-hide' || display === 'advanced-hide') b = "<span class='advanced'>" + b + "</span>";
    return "<span class='flex flex-row items-center gap-4'>" + b + "</span>";
  }

  function isAdvanced(display) { return display === 'advanced' || display === 'advanced-hide'; }

  /**
   * Append a new label row, the way CreateDocker.php's load loop does it.
   * spec: { key, value, name?, description?, display? ('advanced'), mask? (false) }
   * Returns the row number. Call finish() once after a batch.
   */
  function addLabel(spec) {
    if (!available()) throw new Error('Label Presets: Unraid form not available');
    var display = spec.display || 'advanced';
    window.confNum += 1;                     // caller's increment (makeConfig adds a second one)
    var num = window.confNum;
    var opts = {                             // fresh object, never Unraid's `Object`
      Name: escHtml(spec.name || spec.key),
      Target: escHtml(spec.key),
      Default: escHtml(spec.value),
      Mode: '',
      Description: escHtml(spec.description || ''),
      Type: 'Label',
      Display: display,
      Required: 'false',
      Mask: spec.mask ? 'true' : 'false',
      Value: escValue(spec.value),
      Buttons: buttonsHtml(num, display),
      Number: num
    };
    var html = window.makeConfig(opts);
    $(isAdvanced(display) ? '#configLocationAdvanced' : '#configLocation').append(html);
    return num;
  }

  /** Set the value of an existing label row. */
  function updateLabel(num, value) {
    var $row = $('#ConfigNum' + num);
    if (!$row.length) return false;
    $row.find('[name="confValue[]"]').first().val(value);
    field($row, 'Default').val(value);
    return true;
  }

  /** Remove a label row through Unraid's own function. */
  function removeLabel(num) {
    if (typeof window.removeConfig === 'function') window.removeConfig(num);
    else $('#ConfigNum' + num).remove();
  }

  /** Follow-up calls after a batch of changes, same as addConfigPopup(). */
  function finish(opts) {
    if (typeof window.reloadTriggers === 'function') window.reloadTriggers();
    $('input[name="contName"]').trigger('change');
    if (opts && opts.revealAdvanced) {
      var $adv = $('#configLocationAdvanced');
      if ($adv.children(ROW).length && !$adv.is(':visible') && typeof window.toggleReadmore === 'function') window.toggleReadmore();
    }
  }

  /** Plain values from the form, for variable resolution. */
  function readContainer() {
    var ports = [];
    $(LISTS).children(ROW).each(function () {
      var type = (field(this, 'Type').val() || '').replace(/^Disabled:/i, '');
      if (type !== 'Port') return;
      ports.push({
        target: field(this, 'Target').val() || '',
        value: $(this).find('[name="confValue[]"]').first().val() || field(this, 'Default').val() || '',
        mode: field(this, 'Mode').val() || ''
      });
    });
    var network = $('select[name="contNetwork"]').val() || '';
    return {
      name: $('input[name="contName"]').val() || '',
      webui: $('input[name="contWebUI"]').val() || '',
      icon: $('input[name="contIcon"]').val() || '',
      overview: $('textarea[name="contOverview"]').val() || '',
      network: network,
      driver: (window.drivers && window.drivers[network]) || '',
      ip: $('input[name="contMyIP"]').val() || '',
      extraParams: $('input[name="contExtraParams"]').val() || '',
      ports: ports
    };
  }

  /** Where to hang our own UI: right after the "Add another …" link. */
  function anchor() { return $('a[href="javascript:addConfigPopup()"]').first(); }

  window.LabelPresets = window.LabelPresets || {};
  window.LabelPresets.form = {
    available: available,
    readLabels: readLabels,
    labelsByKey: labelsByKey,
    addLabel: addLabel,
    updateLabel: updateLabel,
    removeLabel: removeLabel,
    finish: finish,
    readContainer: readContainer,
    anchor: anchor,
    escHtml: escHtml
  };
})(window.jQuery);

/* Label Presets – Phase-1 dev test. Adds a link that inserts/updates one fixed
 * label with awkward characters, to check the form bridge end to end.
 * Removed once the label book exists. */
(function ($) {
  'use strict';
  if (!$) return;
  var KEY = 'lp.test';
  var VALUE = 'Host(`a.b`) "q" \'s\' <t> & $x {0}';

  function run() {
    var f = window.LabelPresets && window.LabelPresets.form;
    if (!f || !f.available()) { alert('Label Presets: Formular nicht gefunden'); return; }
    var existing = f.labelsByKey().map[KEY];
    var msg;
    if (existing) {
      f.updateLabel(existing.num, VALUE);
      msg = 'aktualisiert (Zeile ' + existing.num + ')';
    } else {
      var num = f.addLabel({ key: KEY, value: VALUE, name: 'LP Test', description: 'Label Presets Dev-Test', display: 'advanced' });
      msg = 'eingefügt (Zeile ' + num + ')';
    }
    f.finish({ revealAdvanced: true });
    console.info('[label.presets] ' + KEY + ' ' + msg, f.readLabels(), f.readContainer());
    $('#lp-devtest-msg').text(KEY + ' ' + msg);
  }

  $(function () {
    var f = window.LabelPresets && window.LabelPresets.form;
    if (!f) return;
    var $a = f.anchor();
    if (!$a.length) return;
    var $link = $('<a href="#" class="lp-devtest"><i class="fa fa-fw fa-flask"></i> Label Presets: Dev-Test</a>');
    $link.on('click', function (e) { e.preventDefault(); run(); });
    $a.after($('<span class="lp-devtest-wrap"></span>').append(' &nbsp; ', $link, ' <span id="lp-devtest-msg"></span>'));
  });
})(window.jQuery);

<?PHP
/* Settings > Utilities > Label Presets.
 * Global variables, default display, visible services and the user catalog.
 * Saves through include/save.php (JSON, csrf_token). */
require_once __DIR__ . '/catalog.php';

$lpCat = lp_catalog();
$lpShipped = [];
foreach (glob(LP_PLUGIN_DIR . '/catalog/*.json') ?: [] as $f) {
    $s = lp_read_json($f);
    if ($s && isset($s['id'])) $lpShipped[$s['id']] = $s;
}
$lpData = [
    'services' => $lpCat['services'],
    'errors'   => $lpCat['errors'],
    'shipped'  => $lpShipped,
    'settings' => lp_settings(),
];
$lpJson = json_encode($lpData, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
$lpAsset = function (string $p): string {
    $u = '/plugins/label.presets/' . $p;
    return htmlspecialchars(function_exists('autov') ? autov($u, true) : $u);
};
?>
<link type="text/css" rel="stylesheet" href="<?= $lpAsset('css/settings.css') ?>">
<script>window.LabelPresetsSettings = <?= $lpJson ?>;</script>

<div id="lp-settings" class="lp-settings">
  <p class="lp-intro">Das Label-Buch öffnest du beim Hinzufügen oder Bearbeiten eines Containers über <b>„Label-Buch öffnen“</b> neben „Add another Path, Port, Variable, Label or Device“. Hier legst du fest, was es vorschlägt.</p>

  <div id="lp-errors"></div>

  <section class="lp-sec">
    <h3>Globale Werte</h3>
    <p class="lp-muted">Werte, die in vielen Containern gleich sind, z. B. deine Domain. Das Buch setzt sie überall ein, wo ein Katalogeintrag <code>${NAME}</code> verwendet.</p>
    <div id="lp-globals" class="lp-globals"></div>
    <button type="button" id="lp-global-add">+ Wert hinzufügen</button>
  </section>

  <section class="lp-sec">
    <h3>Einfügen</h3>
    <dl class="lp-dl">
      <dt>Neue Labels standardmäßig:</dt>
      <dd>
        <select id="lp-display">
          <option value="advanced">ausgeblendet (unter „Show more settings“)</option>
          <option value="always">sichtbar</option>
        </select>
        <div class="lp-muted">Ein Katalogeintrag kann das pro Dienst oder Label überschreiben; im Buch lässt es sich pro Vorgang umschalten.</div>
      </dd>
    </dl>
  </section>

  <div class="lp-actions">
    <button type="button" id="lp-save">Übernehmen</button>
    <input type="button" value="Done" onclick="done()">
    <span id="lp-save-msg" class="lp-msg"></span>
  </div>

  <section class="lp-sec">
    <h3>Dienste</h3>
    <p class="lp-muted">Mitgelieferte Dienste werden bei Plugin-Updates erneuert. Willst du einen anpassen, lege eine eigene Kopie an: Sie ersetzt den mitgelieferten Eintrag, bis du sie zurücksetzt. Gespeichert wird auf dem USB-Stick unter <code><?= htmlspecialchars(LP_CONFIG_DIR) ?>/catalog/</code>.</p>
    <div class="lp-table-wrap"><table class="lp-table" id="lp-services"></table></div>
    <button type="button" id="lp-new">+ Neuer Dienst</button>
    <div id="lp-editor" class="lp-editor" hidden>
      <h4 id="lp-editor-title"></h4>
      <textarea id="lp-editor-text" spellcheck="false" rows="24"></textarea>
      <div class="lp-editor-bar">
        <button type="button" id="lp-editor-save">Speichern</button>
        <button type="button" id="lp-editor-cancel">Abbrechen</button>
        <span id="lp-editor-msg" class="lp-msg"></span>
      </div>
      <details class="lp-help-box">
        <summary>Aufbau eines Eintrags</summary>
        <ul>
          <li><code>id</code>: Kleinbuchstaben, Ziffern, <code>-</code>. Gleiche id wie ein mitgelieferter Dienst = ersetzt ihn.</li>
          <li><code>namespace</code>: <code>none</code>, <code>name</code> (z. B. Traefik-Router), <code>index</code> (z. B. Docktail) oder <code>split</code>.</li>
          <li><code>groups[].scope</code>: <code>container</code> oder <code>namespace</code>. Namespace-Keys enthalten <code>${NS_KEY}</code>.</li>
          <li><code>labels[]</code>: <code>key</code>, <code>value</code> (mit <code>${VARIABLE}</code>), <code>title</code>, <code>description</code>, <code>type</code> (<code>text</code>, <code>bool</code>, <code>number</code>, <code>port</code>, <code>enum</code> mit <code>options</code>, <code>schedule</code>), <code>recommended</code>, optional <code>pattern</code>, <code>mask</code>, <code>display</code>.</li>
          <li>Automatische Variablen: <code>CONTAINER_NAME</code>, <code>CONTAINER_NAME_LOWER</code>, <code>NS</code>, <code>NS_KEY</code>, <code>WEBUI_PORT</code>, <code>WEBUI_HOST_PORT</code>, <code>WEBUI_URL</code>, <code>WEBUI_SCHEME</code>, <code>WEBUI_PATH</code>, <code>ICON</code>, <code>OVERVIEW</code>, <code>NETWORK</code>, <code>IP</code>, <code>SERVER_IP</code>.</li>
        </ul>
      </details>
    </div>
  </section>
</div>

<script src="<?= $lpAsset('js/settings.js') ?>"></script>

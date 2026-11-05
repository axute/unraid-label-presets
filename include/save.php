<?PHP
/* Label Presets – save endpoint for the settings page.
 * POST only, csrf_token checked (Unraid's local_prepend.php also checks it),
 * writes only below /boot/config/plugins/label.presets, atomically.
 * Answers JSON: {"ok":true} or {"ok":false,"error":"..."}. */

require_once __DIR__ . '/catalog.php';

header('Content-Type: application/json; charset=utf-8');

function lp_out(bool $ok, string $error = '', array $extra = []): void {
    echo json_encode(['ok' => $ok, 'error' => $error] + $extra, JSON_UNESCAPED_UNICODE);
    exit;
}

function lp_write_atomic(string $file, string $data): bool {
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0777, true)) return false;
    $tmp = $dir . '/.' . basename($file) . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $data) !== strlen($data)) { @unlink($tmp); return false; }
    return @rename($tmp, $file);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') lp_out(false, 'Nur POST erlaubt.');
// Unraid's local_prepend.php (auto_prepend_file) already checked csrf_token for every
// POST, terminated on a mismatch and removed the field from $_POST. Only check it
// ourselves when that prepend did not run (CLI tests).
if (!function_exists('csrf_terminate')) {
    $var = @parse_ini_file('/var/local/emhttp/var.ini') ?: [];
    if (empty($var['csrf_token']) || !hash_equals((string)$var['csrf_token'], (string)($_POST['csrf_token'] ?? ''))) lp_out(false, 'Ungültiges csrf_token. Seite neu laden.');
}

$action = (string)($_POST['action'] ?? '');

if ($action === 'settings') {
    $in = json_decode((string)($_POST['data'] ?? ''), true);
    if (!is_array($in)) lp_out(false, 'Daten fehlen.');
    $globals = [];
    foreach ((array)($in['globals'] ?? []) as $k => $v) {
        $k = (string)$k;
        if ($k === '') continue;
        if (!preg_match('/^[A-Z][A-Z0-9_]{0,63}$/', $k)) lp_out(false, "Name „{$k}“: nur A–Z, 0–9 und _ (Beginn mit Buchstabe).");
        if (in_array($k, ['NS', 'NS_KEY', 'R', 'I'], true)) lp_out(false, "Name „{$k}“ ist reserviert.");
        if (!is_scalar($v) || strlen((string)$v) > 1000) lp_out(false, "Wert für „{$k}“ ungültig.");
        $globals[$k] = (string)$v;
    }
    ksort($globals);
    $display = in_array($in['defaultDisplay'] ?? '', ['always', 'advanced'], true) ? $in['defaultDisplay'] : 'advanced';
    $hidden = [];
    foreach ((array)($in['hidden'] ?? []) as $id) {
        if (is_string($id) && preg_match('/^[a-z0-9-]+$/', $id)) $hidden[] = $id;
    }
    $json = json_encode(['globals' => (object)$globals, 'defaultDisplay' => $display, 'hidden' => array_values(array_unique($hidden))], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!lp_write_atomic(LP_CONFIG_DIR . '/settings.json', $json . "\n")) lp_out(false, 'Konnte settings.json nicht schreiben.');
    lp_out(true);
}

if ($action === 'service_save') {
    $raw = (string)($_POST['data'] ?? '');
    if (strlen($raw) > 262144) lp_out(false, 'Eintrag ist zu groß (max. 256 KB).');
    $s = json_decode($raw, true);
    if (!is_array($s)) lp_out(false, 'Kein gültiges JSON: ' . json_last_error_msg());
    unset($s['origin']);
    $err = lp_check_service($s);
    if ($err) lp_out(false, $err);
    $json = json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!lp_write_atomic(LP_CONFIG_DIR . '/catalog/' . $s['id'] . '.json', $json . "\n")) lp_out(false, 'Konnte den Katalogeintrag nicht schreiben.');
    lp_out(true, '', ['id' => $s['id']]);
}

if ($action === 'service_delete') {
    $id = (string)($_POST['id'] ?? '');
    if (!preg_match('/^[a-z0-9-]+$/', $id)) lp_out(false, 'Ungültige id.');
    $file = LP_CONFIG_DIR . '/catalog/' . $id . '.json';
    if (is_file($file) && !@unlink($file)) lp_out(false, 'Konnte die Datei nicht löschen.');
    lp_out(true);
}

lp_out(false, 'Unbekannte Aktion.');

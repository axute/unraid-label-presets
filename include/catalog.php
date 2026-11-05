<?PHP
/* Catalog and settings loading for Label Presets.
 * Shipped catalog: plugin dir catalog/*.json. User catalog on the flash drive
 * replaces a shipped service with the same id completely. */

// overridable for tests (define before including this file)
if (!defined('LP_PLUGIN_DIR')) define('LP_PLUGIN_DIR', '/usr/local/emhttp/plugins/label.presets');
if (!defined('LP_CONFIG_DIR')) define('LP_CONFIG_DIR', '/boot/config/plugins/label.presets');

function lp_read_json(string $file): ?array {
    if (!is_file($file)) return null;
    $data = json_decode((string)@file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

/** Basic shape check; returns an error text or null. */
function lp_check_service(array $s): ?string {
    if (!isset($s['id']) || !is_string($s['id']) || !preg_match('/^[a-z0-9-]+$/', $s['id'])) return 'id fehlt oder ungültig';
    if (!isset($s['name']) || !is_string($s['name'])) return 'name fehlt';
    if (!isset($s['groups']) || !is_array($s['groups'])) return 'groups fehlt';
    $kind = $s['namespace'] ?? 'none';
    if (!in_array($kind, ['name', 'index', 'split', 'none'], true)) return "namespace '$kind' unbekannt";
    foreach ($s['groups'] as $g) {
        $scope = $g['scope'] ?? '';
        if (!in_array($scope, ['container', 'namespace', 'split'], true)) return "scope '$scope' unbekannt";
        if ($kind === 'none' && $scope !== 'container') return "namespace none erlaubt nur scope container";
        $repeat = $g['repeat'] ?? null;
        if ($repeat !== null) {
            if ($scope !== 'container') return 'repeat nur bei scope container';
            if (!is_string($repeat['single'] ?? null) || !is_string($repeat['multi'] ?? null) || strpos($repeat['multi'], '${I}') === false) return 'repeat braucht single und multi mit ${I}';
        }
        foreach (($g['labels'] ?? []) as $l) {
            $key = $l['key'] ?? '';
            if (!is_string($key) || $key === '') return 'Label ohne key';
            $hasNs = strpos($key, '${NS_KEY}') !== false;
            if ($scope === 'namespace' && !$hasNs) return "$key: scope namespace braucht \${NS_KEY}";
            if ($scope !== 'namespace' && $hasNs) return "$key: \${NS_KEY} nur bei scope namespace";
            if ($repeat !== null && strpos($key, '${R}') !== 0) return "$key: Felder einer Wiederholung beginnen mit \${R}";
            if (preg_match_all('/\$\{([A-Z0-9_]+)\}/', $key, $m)) {
                foreach ($m[1] as $v) if ($v !== 'NS_KEY' && !($v === 'R' && $repeat !== null)) return "$key: nur \${NS_KEY} im Key erlaubt";
            }
        }
    }
    return null;
}

/** ['services' => [...], 'errors' => [['file' => ..., 'error' => ...]]] */
function lp_catalog(): array {
    $byId = []; $errors = [];
    foreach ([LP_PLUGIN_DIR . '/catalog', LP_CONFIG_DIR . '/catalog'] as $i => $dir) {
        foreach (glob("$dir/*.json") ?: [] as $file) {
            $s = lp_read_json($file);
            $err = $s === null ? 'kein gültiges JSON' : lp_check_service($s);
            if ($err) { $errors[] = ['file' => $file, 'error' => $err]; continue; }
            $s['origin'] = $i === 0 ? 'mitgeliefert' : (isset($byId[$s['id']]) ? 'überschrieben' : 'eigen');
            $byId[$s['id']] = $s;
        }
    }
    uasort($byId, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    return ['services' => array_values($byId), 'errors' => $errors];
}

function lp_settings(): array {
    $s = lp_read_json(LP_CONFIG_DIR . '/settings.json') ?? [];
    $display = in_array($s['defaultDisplay'] ?? '', ['always', 'advanced'], true) ? $s['defaultDisplay'] : 'advanced';
    $globals = [];
    foreach ((array)($s['globals'] ?? []) as $k => $v) {
        if (is_string($k) && preg_match('/^[A-Z0-9_]+$/', $k) && is_scalar($v)) $globals[$k] = (string)$v;
    }
    return ['defaultDisplay' => $display, 'globals' => $globals, 'hidden' => array_values(array_filter((array)($s['hidden'] ?? []), 'is_string'))];
}

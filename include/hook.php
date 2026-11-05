<?PHP
/* Runs from LabelPresetsHook.page, a "Buttons" page that Unraid evaluates inside
 * <head> on the Add and Update Container pages. It only adds our stylesheet,
 * scripts and data; nothing of Unraid is patched. See NOTES-7.3.4.md. */

require_once __DIR__ . '/catalog.php';

const LP_PLUGIN = 'label.presets';

/** Public URL of a plugin file, versioned by Unraid's cache-buster when available. */
function lp_asset(string $path): string {
    $url = '/plugins/' . LP_PLUGIN . '/' . $path;
    return function_exists('autov') ? autov($url, true) : $url;
}

function lp_inject(): void {
    $cat = lp_catalog();
    $data = [
        'services' => $cat['services'],
        'catalogErrors' => $cat['errors'],
        'settings' => lp_settings(),
        'settingsUrl' => '/Settings/LabelPresets',
    ];
    $json = json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
    echo '<link type="text/css" rel="stylesheet" href="' . htmlspecialchars(lp_asset('css/labelbook.css')) . '">' . "\n";
    echo '<script>window.LabelPresetsData=' . $json . ';</script>' . "\n";
    foreach (['js/formbridge.js', 'js/resolve.js', 'js/bookmodel.js', 'js/labelbook.js'] as $js) {
        echo '<script src="' . htmlspecialchars(lp_asset($js)) . '"></script>' . "\n";
    }
}

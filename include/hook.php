<?PHP
/* Runs from LabelPresetsHook.page, a "Buttons" page that Unraid evaluates inside
 * <head> on the Add and Update Container pages. It only adds our stylesheet and
 * scripts; nothing of Unraid is patched. See NOTES-7.3.4.md for the internals used. */

const LP_PLUGIN = 'label.presets';

/** Public URL of a plugin file, versioned by Unraid's cache-buster when available. */
function lp_asset(string $path): string {
    $url = '/plugins/' . LP_PLUGIN . '/' . $path;
    return function_exists('autov') ? autov($url, true) : $url;
}

function lp_inject(): void {
    echo '<link type="text/css" rel="stylesheet" href="' . htmlspecialchars(lp_asset('css/labelbook.css')) . '">' . "\n";
    foreach (['js/formbridge.js', 'js/devtest.js'] as $js) {
        echo '<script src="' . htmlspecialchars(lp_asset($js)) . '"></script>' . "\n";
    }
}

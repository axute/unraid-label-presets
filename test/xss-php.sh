#!/bin/sh
# Regenerates test/xss-php.json from test/xss-cases.txt with Unraid's own
# xmlSecurity() logic (Helpers.php), so resolve.xssFilter() can be compared
# against real PHP. Run on the Unraid server from the repo root.
cd "$(dirname "$0")/.." || exit 1
php -r '
$f = file($argv[1], FILE_IGNORE_NEW_LINES);
$o = [];
foreach ($f as $s) {
  $t = htmlspecialchars_decode($s);
  $o[] = ["in" => $s, "out" => trim(strip_tags($t)) !== trim($t) ? str_replace(["<", ">"], "", $t) : $t];
}
echo json_encode($o, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
' test/xss-cases.txt > test/xss-php.json

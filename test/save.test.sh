#!/bin/sh
# Exercises include/save.php from the CLI against a temporary config dir.
cd "$(dirname "$0")/.." || exit 1
TMP=$(mktemp -d); TOKEN=$(sed -n 's/^csrf_token="\(.*\)"/\1/p' /var/local/emhttp/var.ini)
run() { php -d auto_prepend_file= -r '
  define("LP_CONFIG_DIR", $argv[1]); define("LP_PLUGIN_DIR", getcwd());
  $_SERVER["REQUEST_METHOD"] = "POST"; parse_str($argv[2], $_POST);
  include "include/save.php";' "$TMP" "$1"; echo; }
fail=0
check() { case "$2" in *"$3"*) echo "ok   $1";; *) echo "FAIL $1: $2"; fail=1;; esac; }
check "falsches Token"     "$(run 'action=settings&csrf_token=x&data={}')" 'csrf_token'
check "Einstellungen"      "$(run "action=settings&csrf_token=$TOKEN&data=%7B%22globals%22%3A%7B%22DOMAIN%22%3A%22example.de%22%7D%2C%22defaultDisplay%22%3A%22always%22%2C%22hidden%22%3A%5B%22dockhand%22%2C%22..%2Fx%22%5D%7D")" '"ok":true'
check "settings.json"      "$(cat $TMP/settings.json)" '"DOMAIN": "example.de"'
check "hidden gefiltert"   "$(cat $TMP/settings.json)" '"dockhand"'
check "reservierter Name"  "$(run "action=settings&csrf_token=$TOKEN&data=%7B%22globals%22%3A%7B%22NS%22%3A%22x%22%7D%7D")" 'reserviert'
check "Dienst speichern"   "$(run "action=service_save&csrf_token=$TOKEN&data=$(php -r 'echo urlencode(file_get_contents("catalog/controlarr.json"));')")" '"ok":true'
check "Datei geschrieben"  "$(ls $TMP/catalog)" 'controlarr.json'
check "ungültiger Dienst"  "$(run "action=service_save&csrf_token=$TOKEN&data=%7B%22id%22%3A%22..%2Fevil%22%7D")" 'id fehlt oder ungültig'
check "kein JSON"          "$(run "action=service_save&csrf_token=$TOKEN&data=nope")" 'Kein gültiges JSON'
check "Löschen Pfad"       "$(run "action=service_delete&csrf_token=$TOKEN&id=../settings")" 'Ungültige id'
check "Löschen"            "$(run "action=service_delete&csrf_token=$TOKEN&id=controlarr")" '"ok":true'
check "Datei weg"          "$(ls $TMP/catalog | wc -l)" '0'
rm -rf "$TMP"; exit $fail

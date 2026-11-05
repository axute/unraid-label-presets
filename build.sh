#!/bin/bash
# Builds the Slackware package and updates version + SHA256 in label.presets.plg.
#
#   ./build.sh                 version = today (YYYY.MM.DD)
#   ./build.sh 2026.11.05a     explicit version
#
# Output: archive/label.presets-<version>-noarch-1.txz
# Run on the Unraid server (needs makepkg). Runs the tests first.
set -euo pipefail
cd "$(dirname "$0")"

NAME=label.presets
VERSION=${1:-$(date +%Y.%m.%d)}
PKG="$NAME-$VERSION-noarch-1.txz"
PLUGDIR=usr/local/emhttp/plugins/$NAME

if ! [[ $VERSION =~ ^[0-9]{4}\.[0-9]{2}\.[0-9]{2}[a-z]?$ ]]; then
  echo "Version must look like 2026.11.05 or 2026.11.05a" >&2; exit 1
fi

echo "== tests"
node --test test/*.test.js >/dev/null
./test/save.test.sh >/dev/null
for f in include/*.php; do php -l "$f" >/dev/null; done
for f in js/*.js; do node --check "$f"; done
for f in catalog/*.json; do php -r 'json_decode(file_get_contents($argv[1]), true) !== null || exit(1);' "$f"; done

echo "== package $PKG"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$PLUGDIR"
cp -r ./*.page include js css catalog "$STAGE/$PLUGDIR/"
printf '%s\n' "$VERSION" > "$STAGE/$PLUGDIR/VERSION"
find "$STAGE" -type d -exec chmod 755 {} +
find "$STAGE" -type f -exec chmod 644 {} +
mkdir -p archive
( cd "$STAGE" && makepkg -l y -c y "$OLDPWD/archive/$PKG" >/dev/null )

SHA=$(sha256sum "archive/$PKG" | cut -d' ' -f1)
sed -i -E \
  -e "s|(<!ENTITY version +\")[^\"]*\"|\1$VERSION\"|" \
  -e "s|(<!ENTITY sha256 +\")[^\"]*\"|\1$SHA\"|" \
  "$NAME.plg"

echo "== done"
echo "   archive/$PKG"
echo "   sha256 $SHA"
echo "   $NAME.plg -> version $VERSION"
echo
echo "Local install:"
echo "   mkdir -p /boot/config/plugins/$NAME && cp archive/$PKG /boot/config/plugins/$NAME/"
echo "   cp $NAME.plg /boot/config/plugins/$NAME/$NAME-install.plg"
echo "   Plugins > Install Plugin: /boot/config/plugins/$NAME/$NAME-install.plg"

# Label Presets für Unraid

Ein **Label-Buch** für die Add/Edit-Container-Seite von Unraid. Statt Docker-Labels für Traefik, Homepage, Docktail & Co. aus der Doku abzutippen, wählst du den Dienst aus, siehst alle verfügbaren Labels mit Erklärung und hakst an, was du brauchst. Werte wie Port, Name oder Link werden aus der Container-Konfiguration vorgeschlagen.

Das Plugin füllt nur das Formular aus. Gespeichert wird wie immer mit Unraids **Apply**. Abbrechen heißt: Es ist nichts passiert.

## Funktionen

- **Index aller Dienste** mit Suche (auch nach einzelnen Labels) und einer Anzeige, was am Container schon eingerichtet ist.
- **Vorschläge aus der Container-Konfiguration:** Container-Port aus dem WebUI-Feld (`[PORT:8080]`), Host-Port aus dem Port-Mapping, Link, Name, Icon, Beschreibung, Netzwerk. Neben jedem Vorschlag steht, woher er kommt.
- **Globale Werte** wie deine Domain oder den Traefik-Cert-Resolver legst du einmal in den Einstellungen fest.
- **Namespaces** für mehrere Konfigurationen pro Container, z. B. zwei Traefik-Router (`immich` und `immich-api`) oder mehrere Docktail-Services. Der erste Namespace ist immer der Containername; Punkte und Sonderzeichen werden für Label-Keys bereinigt (`Immich.Server` → `immich-server`). Weitere Namespaces erkennt das Buch an den vorhandenen Labels, es speichert dafür nichts extra.
- **Status je Label:** *neu*, *vorhanden*, *abweichend* (mit Vorschlag zum Übernehmen), *in Extra Parameters*.
- **Passende Eingabefelder:** Schalter, Auswahllisten, Ports mit Prüfung, ein Zeitplan-Editor für Controlarr.
- **Wiederholbare Blöcke**, z. B. mehrere Homepage-Widgets. Ab zwei Widgets schreibt das Buch `homepage.widget.*` automatisch in `homepage.widgets[0].*` um.
- **Behutsam bei bestehender Einrichtung:** Ist ein Dienst schon eingerichtet, wird nichts zusätzlich vorausgewählt. Vorhandene Labels behalten Position und Anzeige; abgehakte vorhandene Labels werden erst nach Rückfrage entfernt.
- **Eigene Katalogeinträge** und angepasste Kopien der mitgelieferten Dienste über die Einstellungsseite.
- Funktioniert zusammen mit **Docker Template Fields** (eingefügte Zeilen bekommen Ziehgriff und Schalter).

## Mitgelieferte Dienste

| Dienst | Wofür | Mehrere pro Container |
|---|---|---|
| [Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/) | Reverse Proxy: Router, Service, TLS | ja, Namespace im Key (`routers.<name>.…`) |
| [Docktail](https://docktail.org/docs/labels/) | Container als Tailscale Service | ja, Index im Key (`service.1.…`) |
| [Homepage](https://gethomepage.dev/configs/docker/#automatic-service-discovery) | Dashboard-Kachel und Widgets | Widgets ja (`widgets[n].…`) |
| [Controlarr](https://github.com/p1zzm1ssile/Controlarr#setting-a-schedule) | Start/Stopp/Neustart zu festen Zeiten | – |
| [Dockhand](https://dockhand.pro/manual/#container-labels) | Updates, Anzeige, Start/Stopp-Zeiten | – |

## Voraussetzungen

- Unraid **7.0** oder neuer (entwickelt und getestet mit **7.3.4**)
- Docker aktiviert

## Installation

**Plugins → Install Plugin** und diese URL einfügen:

```
https://raw.githubusercontent.com/axute/unraid-label-presets/main/label.presets.plg
```

Updates erscheinen danach unter **Plugins → Check for Updates**.

## Verwendung

1. **Einmalig:** *Settings → Utilities → Label Presets* öffnen und die globalen Werte eintragen, die du nutzt, z. B. `DOMAIN`, `TRAEFIK_CERTRESOLVER`, `HOMEPAGE_DEFAULT_GROUP`. Werte, die ein Dienst erwartet, stehen dort schon als leere Zeile.
2. *Docker → Add Container* oder einen Container bearbeiten.
3. Neben „Add another Path, Port, Variable, Label or Device“ auf **Label-Buch öffnen** klicken.
4. Dienst auswählen. Gruppen mit Handlungsbedarf sind aufgeklappt; der Kopf jeder Gruppe zeigt, was darin neu, vorhanden oder abweichend ist.
5. Labels anhaken, Werte prüfen, bei Bedarf über **+** einen weiteren Namespace anlegen.
6. **Übernehmen**: Die Labels landen im Formular (standardmäßig unter „Show more settings“).
7. Mit Unraids **Apply** speichern. Erst jetzt wird der Container neu erstellt.

## Einstellungen

*Settings → Utilities → Label Presets*

- **Globale Werte:** Name/Wert-Paare, die Katalogeinträge als `${NAME}` verwenden. Zu jedem Wert steht, welche Dienste ihn nutzen.
- **Neue Labels standardmäßig:** ausgeblendet (unter „Show more settings“) oder sichtbar. Im Buch lässt sich das pro Vorgang umschalten.
- **Dienste:** im Buch ein- oder ausblenden, mitgelieferte Dienste als eigene Kopie anpassen, eigene Dienste anlegen.

Alles wird auf dem USB-Stick unter `/boot/config/plugins/label.presets/` gespeichert und bleibt bei Updates und beim Deinstallieren erhalten.

## Eigene Dienste

Ein Katalogeintrag ist eine JSON-Datei. Auf der Einstellungsseite gibt es dafür einen Editor mit Vorlage und Kurzanleitung. Minimalbeispiel:

```json
{
  "id": "mein-dienst",
  "name": "Mein Dienst",
  "description": "Wofür die Labels sind.",
  "icon": "fa-tags",
  "prefix": "meindienst.",
  "namespace": "none",
  "groups": [
    {
      "name": "Basis",
      "scope": "container",
      "labels": [
        { "key": "meindienst.enable", "type": "bool", "value": "true", "title": "Aktivieren", "recommended": true },
        { "key": "meindienst.url", "type": "text", "value": "${WEBUI_URL}", "title": "Link" }
      ]
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `namespace` | `none`, `name` (Name im Key, wie Traefik), `index` (Zahl im Key, wie Docktail) oder `split` (Werte mit `;` getrennt) |
| `groups[].scope` | `container` (einmal pro Container) oder `namespace` (Key enthält `${NS_KEY}`) |
| `groups[].repeat` | wiederholbare Blöcke: `{ "single": "x.widget.", "multi": "x.widgets[${I}]." }`, Keys beginnen mit `${R}` |
| `labels[].type` | `text`, `bool`, `number`, `port`, `enum` (mit `options`), `schedule` |
| `labels[].recommended` | bei neuer Einrichtung vorausgewählt |
| `labels[].pattern`, `mask`, `display` | Prüfmuster (Regex), Passwortfeld, `always`/`advanced` |
| `globals` | globale Werte, die der Dienst erwartet (erscheinen in den Einstellungen) |

**Variablen in Werten:** `CONTAINER_NAME`, `CONTAINER_NAME_LOWER`, `NS`, `NS_KEY`, `WEBUI_PORT`, `WEBUI_HOST_PORT`, `WEBUI_URL`, `WEBUI_SCHEME`, `WEBUI_PATH`, `ICON`, `OVERVIEW`, `NETWORK`, `IP`, `SERVER_IP`, dazu alle globalen Werte und die `variables` des Dienstes. Variablen dürfen aufeinander verweisen.

Ein eigener Eintrag mit derselben `id` wie ein mitgelieferter ersetzt diesen komplett. Die mitgelieferten Kataloge in [`catalog/`](catalog/) sind gute Beispiele.

## Gut zu wissen

- **Spitze Klammern:** Unraid entfernt beim Erzeugen des Containers `<` und `>` aus Werten, die wie ein HTML-Tag aussehen (XSS-Schutz). Das Buch warnt in diesem Fall und zeigt, wie der Wert ankommt.
- **Extra Parameters:** Labels, die per `--label` in *Extra Parameters* stehen, erkennt das Buch und warnt vor doppelten Einträgen.
- **API-Keys** (z. B. Homepage-Widgets) werden als Passwortfeld angelegt, stehen aber trotzdem im Template auf dem Stick und sind per `docker inspect` lesbar.

## Deinstallieren

*Plugins → Label Presets → Remove.* Einstellungen und eigene Katalogeinträge bleiben in `/boot/config/plugins/label.presets/`. Wer sie nicht mehr braucht, löscht den Ordner von Hand.

## Entwicklung

```bash
node --test test/*.test.js   # Logik (Variablen, Namespaces, Buch-Modell, Kataloge)
./test/save.test.sh          # Speicher-Endpunkt gegen ein temporäres Verzeichnis
./build.sh [version]         # Tests, Paket bauen, Version und SHA256 in die .plg schreiben
```

| Datei | Aufgabe |
|---|---|
| `js/formbridge.js` | einzige Stelle mit Unraid-Interna (Formularzeilen lesen, anlegen, ändern, entfernen) |
| `js/resolve.js` | Variablen, Namespaces, Wiederholungen, Extra Parameters, Zeitpläne, XSS-Filter (ohne DOM) |
| `js/bookmodel.js` | Zustand und Entscheidungen des Buchs (ohne DOM) |
| `js/labelbook.js` | Oberfläche des Buchs |
| `include/` | Hook, Katalog laden und prüfen, Einstellungsseite, Speichern |
| `NOTES-7.3.4.md` | geprüfte Unraid-Interna; bei Unraid-Updates gegenprüfen |

# Notizen: Unraid 7.3.4 – Add/Edit-Container-Formular

Ergebnis von Schritt 0 aus `plan.md`. Geprüft am 2026-11-05 direkt auf dem Server (`/etc/unraid-version` = `7.3.4`).
Zeilennummern beziehen sich auf die Dateien in dieser Version. Bei jedem Unraid-Update erneut prüfen.

Geprüfte Dateien:

- `/usr/local/emhttp/plugins/dynamix.docker.manager/include/CreateDocker.php` (83276 Bytes, 2026-10-22)
- `/usr/local/emhttp/plugins/dynamix.docker.manager/include/Helpers.php`
- `/usr/local/emhttp/plugins/dynamix.docker.manager/AddContainer.page`, `UpdateContainer.page`
- `/usr/local/emhttp/plugins/dynamix/include/DefaultPageLayout.php`
- `/usr/local/emhttp/plugins/unraid-docker-template-fields/` (Hook, JS)

## 1. `makeConfig(opts)` (CreateDocker.php:587)

```js
function makeConfig(opts) {
  confNum += 1;
  var newConfig = $("#templateDisplayConfig").html();
  newConfig = newConfig.format(
    stripTags(opts.Name),   // {0}
    opts.Target,            // {1}  roh!
    opts.Default,           // {2}  roh!
    opts.Mode,              // {3}
    opts.Description,       // {4}  roh!
    opts.Type,              // {5}
    opts.Display,           // {6}
    opts.Required,          // {7}
    opts.Mask,              // {8}
    escapeQuote(opts.Value),// {9}  nur " wird escaped
    opts.Buttons,           // {10} HTML der Edit/Remove-Buttons
    opts.Required=='true' ? 'required' : '',   // {11}
    sprintf('Container %s',opts.Type),         // {12}
    icons[opts.Type] || 'question'             // {13}
  );
  newConfig = "<div id='ConfigNum"+opts.Number+"' class='config_"+opts.Display+"'' >"+newConfig+"</div>";
  ...
  return newConfig.prop('outerHTML');   // gibt HTML-String zurück, hängt NICHT selbst an
}
```

- Benutzte Felder: `Name`, `Target`, `Default`, `Mode`, `Description`, `Type`, `Display`, `Required`, `Mask`, `Value`, `Buttons`, `Number`.
- `Name` und `Value` müssen Strings sein (`stripTags`/`escapeQuote` rufen `.replace` auf).
- **Escaping:** `Target`, `Default`, `Description` werden ungefiltert in HTML-Attribute bzw. Text eingesetzt, `Value` nur mit `"` → `&quot;`.
  Unser Code muss vorher selbst escapen:
  - `Target`, `Default`, `Description`, `Name`: `&` `<` `>` `"` `'` → Entities
  - `Value`: nur `&` → `&amp;` (das `"` erledigt `escapeQuote`, sonst doppelt escaped)
- `String.prototype.format` ersetzt per Callback in einem Durchgang → `{0}` oder `$` in Werten sind unkritisch.

Zeilen-Template `#templateDisplayConfig` (CreateDocker.php:1614): versteckte Inputs
`confName[]`, `confTarget[]`, `confDefault[]`, `confMode[]`, `confDescription[]`, `confType[]`, `confDisplay[]`, `confRequired[]`, `confMask[]`
plus sichtbares `<input type="text" name="confValue[]">`. Alle Inputs haben ein `name`.

## 2. Zeilenzähler `confNum` (global, CreateDocker.php:564)

Wird **zweimal pro Zeile** erhöht: einmal vom Aufrufer, einmal in `makeConfig()`.
Muster aus dem Ladecode (CreateDocker.php:1986–2009) und `addConfigPopup()` (:689–712):

```js
confNum += 1;
Opts.Buttons = "...editConfigPopup("+confNum+",false)...removeConfig("+confNum+")...";
Opts.Number  = confNum;
newConf = makeConfig(Opts);          // erhöht confNum erneut
$("#configLocation").append(newConf);
```

Folge: Zeilen-IDs sind `ConfigNum2`, `ConfigNum4`, … → nie Zeilen zählen, immer `confNum` nutzen.

**Unraid-Bug:** `addConfigPopup()` und `editConfigPopup()` schreiben `var Opts = Object;` und setzen damit Properties auf dem globalen `Object`-Konstruktor. Wir verwenden immer ein frisches `{}`.

## 3. Folgeaufrufe nach dem Einfügen

```js
reloadTriggers();                                   // Basic/Advanced-Sichtbarkeit, numbersOnly
$('input[name="contName"]').trigger('change');      // "Formular geändert"-Signal
```

`reloadTriggers()` (CreateDocker.php:1905) blendet `.basic`/`.advanced` je nach Schalter `.advancedview` ein/aus.

## 4. Platzierung always / advanced

- Ladecode und `editConfigPopup()`: `Display` = `advanced` oder `advanced-hide` → `#configLocationAdvanced`, sonst `#configLocation`.
- `addConfigPopup()` hängt **immer** an `#configLocation`, unabhängig von `Display` (Inkonsistenz in Unraid).
- **Wir folgen dem Ladecode.**
- `#configLocationAdvanced` ist eingeklappt (`display:none`), bis „Show more settings“ (`toggleReadmore()`) geklickt wird.

Buttons-HTML wie im Ladecode:

```js
// Display always / advanced
"<span class='flex flex-row items-center gap-4'>" +
  "<button type='button' onclick='editConfigPopup(N,false)'>Edit</button>" +
  "<button type='button' onclick='removeConfig(N)'>Remove</button>" +
"</span>"
// Display *-hide: die beiden Buttons zusätzlich in <span class='advanced'>…</span>
```

Die Button-Texte sind im Original übersetzt (`_(Edit)_`); wir übernehmen die Texte zur Laufzeit von einer vorhandenen Zeile oder nutzen Englisch als Fallback.

## 5. Label-Zeilen erkennen

- `input[name="confType[]"]` = `Label`
- Key: `input[name="confTarget[]"]`
- Wert: `input[name="confValue[]"]`, Fallback `confDefault[]`

`xmlToCommand()` (Helpers.php:508–545):

```php
$hostConfig = strlen($config['Value']) ? $config['Value'] : $config['Default'];
if ($confType != "device" && !strlen($containerConfig)) continue;   // leeres Target → übersprungen
...
} elseif ($confType == "label") {
  $Labels[] = escapeshellarg($containerConfig).'='.escapeshellarg($hostConfig);
```

Typ wird per `strtolower` verglichen. Unraid setzt zusätzlich selbst `net.unraid.docker.managed`, `net.unraid.docker.webui`, `net.unraid.docker.icon`.

`postToXML()` (Helpers.php:124) schreibt pro `<Config>` genau: Wert, `Name`, `Target`, `Default`, `Mode`, `Description`, `Type`, `Display`, `Required`, `Mask`. Eigene Attribute gehen verloren.

## 6. Ankerpunkte im DOM

| Was | Selektor | Stelle |
|---|---|---|
| Containername | `input[name="contName"]` (pattern `[a-zA-Z0-9][a-zA-Z0-9_.\-]+`) | :1014 |
| WebUI | `input[name="contWebUI"]` | :1142 |
| Icon | `input[name="contIcon"]` | :1137 |
| Netzwerk | `select[name="contNetwork"]` (Treiber über globales `drivers[...]`) | :1163 |
| Feste IP | `input[name="contMyIP"]` | :1187 |
| Zeilen „immer“ | `#configLocation` | :1515 |
| Zeilen „erweitert“ | `#configLocationAdvanced` | :1518 |
| Link „Add another …“ | `a[href="javascript:addConfigPopup()"]` | :1528 |
| Formular | `form[onsubmit="return prepareConfig(this)"]` | :972 |
| Popup-Container von Unraid | `#dialogAddConfig` (nicht mitbenutzen) | :1548 |

Der Name enthält erlaubterweise `.` → muss für Namespaces bereinigt werden (siehe Plan).

## 7. Hook-Mechanismus und Bibliotheken

- `DefaultPageLayout.php:142` lädt `dynamix.js` (enthält **jQuery 3.7.1** und jQuery UI inkl. `sortable` und `dialog`).
- Direkt danach (:145–156) werden alle `Menu="Buttons"`-Pages im `<head>` ausgewertet. jQuery ist dort verfügbar, das DOM noch nicht → Code in `$(function(){…})`.
- `var Settings = {…}` kommt per `<script>` aus CreateDocker.php:386; die Zeilen werden im Ready-Handler von CreateDocker.php gezeichnet. Unser Ready-Handler (im `<head>` registriert) läuft **vorher** → nichts beim Laden zeichnen, alles erst auf Klick.
- `var csrf_token` ist global gesetzt (`HeadInlineJS.php:38`).
- `AddContainer.page` hat `Eval="true"`, `UpdateContainer.page` nicht; beide `Cond="(pgrep('dockerd')!==false)"`.

## 8. Docker Template Fields (installiert, Stand 2025-09-25)

Hook `TemplateFieldsHook.page`:

```
Menu="Buttons:99"
Title="Docker Template Fields"
Icon="arrows-v"
Link="tf-hook"
Cond="preg_match('/AddContainer|UpdateContainer/', $_SERVER['REQUEST_URI'])"
Markdown="false"
```

`js/templatefields.js`:
- im Ready-Handler: entfernt `Disabled:` aus `Settings.Config[].Type` und **ersetzt `window.makeConfig`** durch einen Wrapper (`draw.apply(this, arguments)`, markiert mit `__tf`).
- `MutationObserver` auf `#configLocation, #configLocationAdvanced` mit `{childList: true, subtree: true}` → dekoriert neue Zeilen automatisch.
- Capture-`submit`-Listener auf dem Formular: setzt `Disabled:` vor `confType[]` ausgeschalteter Zeilen, nimmt es per `setTimeout` wieder weg.
- jQuery-UI-`sortable` auf beiden Listen.

Konsequenz: `window.makeConfig(...)` erst zur Laufzeit (Klick) aufrufen, nie eine Referenz beim Laden cachen, nie selbst wrappen. Beim Lesen von `confType[]` während eines Submits könnte `Disabled:Label` stehen → wir lesen nur außerhalb des Submits, Vergleich trotzdem tolerant (`/^(Disabled:)?Label$/i`).

## 9. Andere Plugins

- Außer Template Fields greift **kein** installiertes Plugin in AddContainer/UpdateContainer ein (geprüft per grep über `*.page`, `include/*.php`, `js/*.js`).
- `labelman` ist **nicht** der Docker Label Manager (Coryrichter94), sondern „Label Manager“ von Derek Kaser (EDACerton): nur eine Seite unter Utilities, kein Buttons-Hook → kein Konflikt.

## 10. PR #2619

Enthalten: `<form … onsubmit="return prepareConfig(this)">` (:972), `prepareConfig()` (:810) normalisiert `contMyMAC`, setzt im Host-Netzwerk bei Port-Zeilen `confTarget` = `confValue` und füllt `contCPUset`. Betrifft Labels nicht.

## 11. Speichern und Laden: Kodierung und XSS-Filter (getestet 2026-11-05)

Test mit Label `lp.test` = `` Host(`a.b`) "q" 's' <t> & $x {0} `` (Container `zipboom`):

- `docker inspect` liefert `` Host(`a.b`) "q" 's' t & $x {0} `` → **`<` und `>` fehlen**, alles andere ist korrekt.
- Ursache: `xmlSecurity()` (Helpers.php:378), aufgerufen am Ende von `xmlToVar()`. Für **jeden** String im Template gilt: Ändert `strip_tags()` den Wert, werden alle `<` und `>` entfernt. XSS-Schutz von Unraid, betrifft Value, Default, Target usw.
  → Label-Werte und Keys, die nach einem HTML-Tag aussehen (`<…>`), verlieren beim Erzeugen des Containers ihre spitzen Klammern. Einzelne `<` oder `>` ohne Tag-Form (z. B. `a < b`) bleiben erhalten, weil `strip_tags()` dann nichts ändert. (Das Template-XML enthält den Wert noch unverändert.)
- Zusätzlich setzt `xmlToVar()` (Helpers.php:272) alle **Attribute** (`Name`, `Target`, `Default`, `Description` …) durch `strip_tags(html_entity_decode(…))`.
- Doppelte Kodierung der Attribute im XML (`Default="&amp;lt;t&amp;gt;"`) ist **normal**: `postToXML()` ruft `xml_encode()` auf, und SimpleXML escaped bei der Zuweisung an Attribute ein zweites Mal. Beim Laden wird entsprechend zweimal dekodiert (`xml_decode()` + `html_entity_decode()`). Der Inhalt von `<Config>` (Value) wird nur einfach kodiert. Kein Fehler im Plugin.

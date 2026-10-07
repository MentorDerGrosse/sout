# sout

Desktop-App fürs Studium an der TU Wien: Kalender aus TISS, Abgaben aus TUWEL, Notizen pro Fach.
Läuft im Hintergrund weiter, mit einem kleinen Fenster oben rechts (wie die JetBrains Toolbox).

Stand: Phase 1 (Kalender aus TISS). Plan, Entscheidungen und Hintergründe: [PLAN.md](PLAN.md).

## Voraussetzungen

- Node.js 22 und npm
- Für das Symbol oben in der Leiste braucht GNOME die Erweiterung „AppIndicator and KStatusNotifierItem Support“:
  ```sh
  sudo dnf install gnome-shell-extension-appindicator
  # einmal ab- und wieder anmelden, dann:
  gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
  ```

## Starten

```sh
npm install
npm run dev      # Entwicklung mit Live-Reload (F12 öffnet die DevTools)
npm run build    # fertige Version nach out/ bauen
npm start        # bauen und die fertige Version starten
```

## Ins System einbinden

```sh
npm run build
npm run install-desktop    # Eintrag in der App-Übersicht + Befehl ~/.local/bin/sout
```

- **Autostart:** in der App unter Einstellungen (oder im Menü des Tray-Symbols)
- **Tastenkürzel für die Mini-Ansicht:** GNOME-Einstellungen → Tastatur → eigene Tastenkombination, Befehl `~/.local/bin/sout --mini` (mit vollem Pfad)
- Wieder entfernen: `npm run uninstall-desktop`

## Wo liegen die Daten?

| Datei | Inhalt |
|---|---|
| `~/.config/sout/settings.json` | Einstellungen |
| `~/.config/sout/secrets.json` | Tokens, verschlüsselt (Schlüssel im GNOME-Schlüsselbund) |
| `~/.config/sout/calendar.json` | zwischengespeicherte TISS-Termine |
| `~/.config/sout/courses.json` | Kurznamen, Farben, ausgeblendete Fächer |
| `~/.config/autostart/sout.desktop` | nur wenn Autostart an ist |

## XWayland

sout läuft unter Linux über XWayland (`--ozone-platform=x11`), weil Wayland Apps ihre Fenster nicht selbst
platzieren lässt – das Mini-Fenster muss aber oben rechts unter dem Tray-Symbol sitzen. Electron wählt das
Anzeigesystem, bevor der App-Code läuft, deshalb muss der Schalter beim Start übergeben werden. Die npm-Skripte,
der Befehl `sout` und der Autostart machen das automatisch; wird sout ohne den Schalter gestartet, startet es
sich einmal selbst mit ihm neu.

Die Zeile `GetVSyncParametersIfAvailable() failed for 1 times!` im Terminal ist harmlos.

## Testlauf ohne Fenster

```sh
npm run build
node_modules/electron/dist/electron . --ozone-platform=x11 --smoke-test=/tmp/sout-smoke
```

Startet alles unsichtbar, legt Screenshots der Ansichten und `report.json` im angegebenen Ordner ab und beendet sich.
Nutzt einen eigenen Datenordner und nicht den Schlüsselbund.

Hilfen für die Entwicklung (nur ungepackt):

| | |
|---|---|
| `--dump-tiss=<datei>` | speichert deinen TISS-Feed roh in eine Datei (zum Anschauen des Formats) |
| `SOUT_TISS_FILE=<datei>` | liest den Kalender aus dieser Datei statt von TISS – z. B. für den Testlauf mit echten Daten |
| `SOUT_SMOKE_THEME=light` | Testlauf im hellen statt dunklen Modus |

## Danke

Die Raumliste `resources/rooms.csv` (Adressen, TUW-Maps-Codes) stammt aus
[better-tiss-calendar](https://github.com/flofriday/better-tiss-calendar) von flofriday (MIT-Lizenz, siehe `resources/rooms.LICENSE`).

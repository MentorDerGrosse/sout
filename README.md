# sout

Desktop-App fürs Studium an der TU Wien: Kalender aus TISS, Abgaben aus TUWEL, Notizen pro Fach.
Läuft im Hintergrund weiter, mit einem kleinen Fenster oben rechts (wie die JetBrains Toolbox).

Stand: Phase 3 (Kalender aus TISS, Abgaben aus TUWEL, Notizen). Plan, Entscheidungen und Hintergründe: [PLAN.md](PLAN.md).

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

## Notizen

Notizen sind normale Markdown-Dateien in einem Ordner, den du beim ersten Öffnen von „Notizen“ festlegst
(Vorschlag: `~/Studium`). sout legt darin eine Inbox und pro Semester einen Ordner je Fach aus dem TISS-Kalender an:

```
~/Studium/
├── Inbox/                                  Schnellnotizen aus dem Mini-Fenster
└── 2026W/
    └── Beispielkunde (123.456)/            die LVA-Nummer am Ende verbindet den Ordner mit dem Fach
        ├── _fach.md                        Übersicht mit Link zu TISS
        ├── Vorlesung/2026-10-07.md         Mitschrift, aus dem Kalender angelegt
        ├── Übung/Übungsblatt 3.md          Notizen zu einer Abgabe
        ├── Prüfung/
        └── Folien/                         PDFs, werden neben der Notiz angezeigt
```

- **Schreiben:** Markdown mit Formeln (`$a^2 + b^2 = c^2$`, `$$ … $$` für eigene Zeilen), Code, Tabellen und
  Checklisten (`- [ ]`). Daneben eine Live-Ansicht, wahlweise nur Schreiben oder nur Lesen. Gespeichert wird von selbst.
- **Kürzel:** Strg+B fett, Strg+I kursiv, Strg+M Formel, Strg+Umschalt+M Formelblock, Strg+Umschalt+L Checkliste,
  Strg+E Code, Strg+F suchen in der Notiz, Strg+N neue Notiz, Strg+Umschalt+F alle Notizen durchsuchen.
- **Folien:** PDFs ins Fenster ziehen oder über „Folien daneben“ hinzufügen – sie landen im `Folien/`-Ordner des Fachs.
- **Verknüpft:** Im Kalender legt „Mitschrift anlegen“ die Notiz für genau diese Vorlesung an (mit Zeit und Raum),
  bei Abgaben „Notizen anlegen“ eine für das Übungsblatt. Läuft gerade eine Vorlesung, steht sie oben in der Liste.
- **Tags:** `#prüfung` irgendwo im Text; die Suche findet sie mit `#prüfung`.
- Ändert ein anderes Programm eine offene Notiz, zeigt sout die neue Fassung. Hast du gleichzeitig in sout etwas
  geändert, fragt es nach, statt etwas zu überschreiben.

## Wo liegen die Daten?

| Datei | Inhalt |
|---|---|
| `~/.config/sout/settings.json` | Einstellungen |
| `~/.config/sout/secrets.json` | Tokens, verschlüsselt (Schlüssel im GNOME-Schlüsselbund) |
| `~/.config/sout/calendar.json` | zwischengespeicherte TISS-Termine |
| `~/.config/sout/courses.json` | Kurznamen, Farben, ausgeblendete Fächer |
| `~/.config/sout/tuwel.json` | zwischengespeicherte TUWEL-Abgaben und -Tests |
| `~/.config/sout/todos.json` | eigene To-dos und in sout abgehakte TUWEL-Aufgaben |
| `~/.config/sout/reminders.json` | welche Erinnerungen schon gezeigt wurden |
| `~/.config/sout/notes.json` | für welche Fächer sout schon einen Notizordner angelegt hat (ein gelöschter kommt nicht wieder) |
| `~/Studium/` (oder der gewählte Ordner) | die Notizen selbst |
| `~/.config/sout/Partitions/tuwel/` | die TU-Wien-/TUWEL-Anmeldung (Cookies) für die stille Erneuerung; „Abmelden“ löscht sie |
| `~/.config/autostart/sout.desktop` | nur wenn Autostart an ist |

## Startschalter: XWayland und Deutsch

sout läuft unter Linux über XWayland (`--ozone-platform=x11`), weil Wayland Apps ihre Fenster nicht selbst
platzieren lässt – das Mini-Fenster muss aber oben rechts unter dem Tray-Symbol sitzen. Außerdem startet es mit
`--lang=de-AT`, damit Datumsfelder und Menüs deutsch sind, auch wenn das System auf Englisch steht.

Electron liest beide Schalter, bevor der App-Code läuft, deshalb müssen sie beim Start übergeben werden. Die
npm-Skripte, der Befehl `sout` und der Autostart machen das automatisch; fehlen sie, startet sout sich einmal
selbst mit ihnen neu.

Die Zeile `GetVSyncParametersIfAvailable() failed for 1 times!` im Terminal ist harmlos.

## Testlauf ohne Fenster

```sh
npm run build
node_modules/electron/dist/electron . --ozone-platform=x11 --lang=de-AT --smoke-test=/tmp/sout-smoke
```

Startet alles unsichtbar, legt Screenshots der Ansichten und `report.json` im angegebenen Ordner ab und beendet sich.
Nutzt einen eigenen Datenordner und nicht den Schlüsselbund. Die Notizen legt er in einem Ordner `Studium` darin an
und prüft dabei auch das Speichern: von selbst, bei Änderungen von außen, bei Konflikten und beim Schließen
(`notes.editing` in `report.json`).

Hilfen für die Entwicklung (nur ungepackt):

| | |
|---|---|
| `--dump-tiss=<datei>` | speichert deinen TISS-Feed roh in eine Datei (zum Anschauen des Formats) |
| `SOUT_TISS_FILE=<datei>` | liest den Kalender aus dieser Datei statt von TISS – z. B. für den Testlauf mit echten Daten |
| `--dump-tuwel=<datei>` | speichert, was TUWEL liefert (Zeitleiste, Abgaben, Tests), als JSON |
| `SOUT_TUWEL_FILE=<datei>` | nimmt diese JSON-Datei statt TUWEL |
| `--probe-tuwel` | prüft, ob TUWEL den gespeicherten Schlüssel noch annimmt (gibt nur „gültig“/„abgelehnt“ aus) |
| `SOUT_SMOKE_THEME=light` | Testlauf im hellen statt dunklen Modus |

## Lizenz

MIT – siehe [LICENSE](LICENSE). Du darfst sout benutzen, verändern und weitergeben, solange der Lizenzhinweis dabei bleibt.

## Danke

Die Raumliste `resources/rooms.csv` (Adressen, TUW-Maps-Codes) stammt aus
[better-tiss-calendar](https://github.com/flofriday/better-tiss-calendar) von flofriday (MIT-Lizenz, siehe `resources/rooms.LICENSE`).

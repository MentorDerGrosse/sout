# sout

Desktop-App fürs Studium an der TU Wien: Kalender aus TISS, Prüfungen mit Anmeldefristen, Abgaben aus TUWEL, Notizen pro Fach.
Läuft im Hintergrund weiter, mit einem kleinen Fenster oben rechts (wie die JetBrains Toolbox).

Stand: alle Phasen bis 5 umgesetzt – Kalender aus TISS mit eigenen Terminen, Abgaben aus TUWEL, Notizen,
Meldungen bei Änderungen, Pakete für Linux, Windows und macOS; dazu Prüfungstermine und Anmeldefristen.
Plan, Entscheidungen und Hintergründe: [PLAN.md](PLAN.md).

## Installieren

Es gibt (noch) keine fertigen Downloads – du baust dir sout einmal selbst. Dafür brauchst du auf jedem System
[Node.js 22 (LTS)](https://nodejs.org) mit npm und [Git](https://git-scm.com). Danach:

```sh
git clone https://github.com/MentorDerGrosse/sout.git
cd sout
npm install
```

Ohne etwas zu installieren, startet `npm start` sout direkt aus dem Ordner. Für eine richtige Installation baut
`npm run dist` ein Paket für das System, auf dem du gerade bist (Windows-Installer gehen nur unter Windows,
Mac-Pakete nur auf einem Mac). Das Ergebnis liegt in `dist/`.

### Linux (Fedora, GNOME)

1. Für das Symbol oben in der Leiste braucht GNOME die Erweiterung „AppIndicator and KStatusNotifierItem Support“:
   ```sh
   sudo dnf install gnome-shell-extension-appindicator
   # einmal ab- und wieder anmelden, dann:
   gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
   ```
2. Paket bauen und installieren – eines von beiden:
   - **AppImage** (eine einzelne Datei, keine Installation): `npm run dist:appimage`, dann
     `dist/sout-0.1.0-x86_64.AppImage` starten. Fedora braucht dafür einmal `sudo dnf install fuse-libs`.
   - **RPM** (mit Eintrag in der App-Übersicht): einmal `sudo dnf install rpm-build`, dann `npm run dist:linux` und
     `sudo dnf install ./dist/sout-0.1.0-x86_64.rpm`. Startet danach mit `sout` oder aus der App-Übersicht.
3. Oder ohne Paket aus dem Projektordner, siehe [Ins System einbinden](#ins-system-einbinden-linux-aus-dem-projektordner).
4. Ein Klick aufs Symbol öffnet das Menü und gleich die Mini-Ansicht dazu; „Mini-Ansicht“ im Menü abhaken schließt
   sie wieder. (GNOME öffnet bei einem Klick immer das Menü – sout hört mit, wann das passiert. Ein Doppelklick
   öffnet oder schließt nur die Mini-Ansicht.)

### Windows

1. Node.js und Git installieren, z. B. in der Eingabeaufforderung:
   ```
   winget install OpenJS.NodeJS.LTS Git.Git
   ```
   Danach ein neues Terminal öffnen und wie oben `git clone …` und `npm install`.
2. `npm run dist:win` baut den Installer `dist\sout-0.1.0-x64.exe` – doppelklicken und durchklicken.
3. Windows warnt beim ersten Start vor einer „unbekannten App“ (der Installer ist nicht signiert):
   **Weitere Informationen → Trotzdem ausführen**.
4. Das Symbol sitzt **unten rechts in der Taskleiste**, eventuell hinter dem Pfeil **^**. Am besten von dort in die
   Taskleiste ziehen, dann ist es immer sichtbar. Klick öffnet die Mini-Ansicht, Rechtsklick das Menü.

### macOS

1. Node.js und Git: entweder von [nodejs.org](https://nodejs.org) (Git kommt mit `xcode-select --install`) oder mit
   [Homebrew](https://brew.sh): `brew install node@22 git`. Dann wie oben `git clone …` und `npm install`.
2. `npm run dist:mac` baut `dist/sout-0.1.0-mac-arm64.dmg` (Apple Silicon) und `…-mac-x64.dmg` (Intel). Die passende
   `.dmg` öffnen und sout in **Programme** ziehen.
3. sout ist nicht von Apple signiert. Beim ersten Start daher **Rechtsklick auf sout → Öffnen → Öffnen**
   (oder Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“).
4. Das Symbol sitzt **oben rechts in der Menüleiste**; ist etwas in den nächsten 24 Stunden fällig, steht die Anzahl daneben.
   Tastenkürzel heißen dort Cmd statt Strg.

### Fertige Pakete von GitHub bauen lassen

Unter **Actions → „Bauen & testen“ → Run workflow** baut GitHub sout auf echten Linux-, Windows- und Mac-Rechnern,
lässt dort den Testlauf laufen und legt Installer und Screenshots zum Herunterladen ab (unten auf der Seite des Laufs).

### Überall gleich

- **Autostart:** in der App unter Einstellungen oder im Menü des Symbols
- **Schließen** beendet sout nicht: Das Hauptfenster wird zur Mini-Ansicht beim Symbol, ein Klick daneben schickt sie
  ins Symbol (in den Einstellungen abschaltbar). Ganz beenden mit Strg+Q (Mac: Cmd+Q) oder „Beenden“ im Menü

## Aus dem Quellcode (Entwicklung)

```sh
npm run dev      # Entwicklung mit Live-Reload (F12 öffnet die DevTools)
npm run build    # fertige Version nach out/ bauen
npm start        # bauen und die fertige Version starten
npm run dist     # Paket für dieses System nach dist/
```

Alles, was die App braucht, bündelt electron-vite nach `out/`; deshalb stehen alle npm-Pakete unter
`devDependencies` und kommen nicht ins fertige Paket.

## Ins System einbinden (Linux, aus dem Projektordner)

```sh
npm run build
npm run install-desktop    # Eintrag in der App-Übersicht + Befehl ~/.local/bin/sout
```

- **Tastenkürzel für die Mini-Ansicht:** GNOME-Einstellungen → Tastatur → eigene Tastenkombination, Befehl `~/.local/bin/sout --mini` (mit vollem Pfad)
- Wieder entfernen: `npm run uninstall-desktop`

## Prüfungen und Anmeldefristen

Im TISS-Kalender steht eine Prüfung erst, wenn du dich angemeldet hast. Deshalb liest sout zusätzlich die
öffentlichen TISS-Seiten deiner LVAs – nur die aus deinem TISS-Kalender, ohne ausgeblendete Fächer. Dafür braucht
es keine Anmeldung; sout liest alle sechs Stunden, eine Seite pro Sekunde. Die Seite „Prüfungen“ zeigt dann:

- **Anmeldung offen:** Was zuerst schließt, steht oben. „In TISS anmelden“ führt direkt zu den Prüfungsterminen der LVA.
- **Anmeldung noch nicht offen:** sortiert danach, was zuerst aufmacht
- **Angemeldet:** sobald die Prüfung in deinem TISS-Kalender steht (sout schaut stündlich nach, „Aktualisieren“ sofort)
- **Vorbei oder nicht nötig:** In dieser Gruppe landen
  - verpasste Fristen
  - Termine, die du schon abgedeckt hast: dieselbe Zeit in einem anderen Raum, ein anderer Termin derselben Prüfung, oder du bist schon angetreten
  - was du mit „Brauche ich nicht“ ausgeblendet hast

Offene und bald öffnende Anmeldungen stehen auch an diesen Stellen:

- auf „Heute“
- im Kalender: die Prüfung gestrichelt, die Anmeldefrist als Balken (Filter „Anmeldungen“)
- in der Mini-Ansicht, wenn sie in den nächsten Tagen enden

sout meldet sich in diesen Fällen:

- sobald eine Anmeldung aufmacht
- vor dem Anmeldeschluss, zu denselben Zeiten wie bei den Abgaben
- wenn TISS einen neuen Prüfungstermin einträgt

Endet eine Anmeldung in den nächsten 24 Stunden, bekommt das Symbol den roten Punkt. Alles das lässt sich in den
Einstellungen abschalten. Die Namen der Prüfungen zeigt sout so, wie TISS sie nennt; manche LVAs tragen dort den
Namen der prüfenden Person ein.

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
- **Kürzel** (Mac: Cmd statt Strg): Strg+B fett, Strg+I kursiv, Strg+M Formel, Strg+Umschalt+M Formelblock, Strg+Umschalt+L Checkliste,
  Strg+E Code, Strg+F suchen in der Notiz, Strg+N neue Notiz, Strg+Umschalt+F alle Notizen durchsuchen.
- **Folien:** PDFs ins Fenster ziehen oder über „Folien daneben“ hinzufügen – sie landen im `Folien/`-Ordner des Fachs.
- **Verknüpft:** Im Kalender legt „Mitschrift anlegen“ die Notiz für genau diese Vorlesung an (mit Zeit und Raum),
  bei Abgaben „Notizen anlegen“ eine für das Übungsblatt. Läuft gerade eine Vorlesung, steht sie oben in der Liste.
- **Tags:** `#prüfung` irgendwo im Text; die Suche findet sie mit `#prüfung`.
- Ändert ein anderes Programm eine offene Notiz, zeigt sout die neue Fassung. Hast du gleichzeitig in sout etwas
  geändert, fragt es nach, statt etwas zu überschreiben.

## Wo liegen die Daten?

Unter Linux in `~/.config/sout/`, unter Windows in `%APPDATA%\sout\`, unter macOS in
`~/Library/Application Support/sout/`. Die Tabelle nennt die Linux-Pfade:

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
| `~/.config/sout/events.json` | eigene Termine (Lerngruppe, Lernblöcke …) |
| `~/.config/sout/changes.json` | Neuigkeiten der letzten zwei Wochen (Raumwechsel, neue Aufgaben, Bewertungen …) |
| `~/.config/sout/exams.json` | Prüfungstermine und Anmeldefristen von den TISS-Seiten deiner LVAs; was du mit „Brauche ich nicht“ ausgeblendet hast |
| `~/.config/autostart/sout.desktop` | nur unter Linux und nur wenn Autostart an ist (Windows/macOS: Anmeldeobjekte des Systems) |

## Startschalter: XWayland und Deutsch (Linux)

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
npm run smoke              # unter Linux ohne Bildschirm: xvfb-run -a npm run smoke
```

Erzeugt erfundene Testdaten: Fächer wie „Beispielkunde“, Abgaben, TISS-LVA-Seiten mit Prüfungen und Anmeldefristen
und eine zweite Synchronisierung. Diese bringt einen Raumwechsel, einen verschobenen und einen entfallenen Termin, eine
Prüfungsanmeldung, einen neuen Prüfungstermin und eine neue Aufgabe. sout startet unsichtbar damit, legt
Screenshots der Ansichten und `report.json` in `smoke/` ab und meldet, ob alles geklappt hat. Geprüft wird unter
anderem das Speichern der Notizen (von selbst, bei Änderungen von außen, bei Konflikten, beim Schließen), das
Erkennen von Änderungen, wie sout jede Prüfung einordnet (offen, angemeldet, nicht nötig …) und dass PDFs nur aus dem
Notizordner kommen. Nutzt einen eigenen Datenordner und nicht den
Schlüsselbund.

Ohne Testdaten geht es auch direkt: `node_modules/electron/dist/electron . --smoke-test=<ordner>` (unter Linux mit
`--ozone-platform=x11 --lang=de-AT`); bei einem installierten Paket das Programm selbst mit `--smoke-test=<ordner>`.

Hilfen für die Entwicklung (nur ungepackt):

| | |
|---|---|
| `--dump-tiss=<datei>` | speichert deinen TISS-Feed roh in eine Datei (zum Anschauen des Formats) |
| `SOUT_TISS_FILE=<datei>` | liest den Kalender aus dieser Datei statt von TISS – z. B. für den Testlauf mit echten Daten |
| `--dump-tuwel=<datei>` | speichert, was TUWEL liefert (Zeitleiste, Abgaben, Tests), als JSON |
| `SOUT_TUWEL_FILE=<datei>` | nimmt diese JSON-Datei statt TUWEL |
| `--probe-tuwel` | prüft, ob TUWEL den gespeicherten Schlüssel noch annimmt (gibt nur „gültig“/„abgelehnt“ aus) |
| `--dump-grades=<datei>` | holt still einen frischen Schlüssel und die Bewertungen; gibt nur deren Aufbau aus |
| `--dump-exams=<datei>` | liest die TISS-Seiten der LVAs aus deinem Kalender wie die App und speichert die Prüfungen als JSON; gibt nur Zahlen aus |
| `SOUT_TISS_PAGES=<ordner>` | nimmt die LVA-Seiten aus diesem Ordner (`123456.html` für 123.456) statt von TISS |
| `SOUT_SMOKE_THEME=light` | Testlauf im hellen statt dunklen Modus |

## Lizenz

MIT – siehe [LICENSE](LICENSE). Du darfst sout benutzen, verändern und weitergeben, solange der Lizenzhinweis dabei bleibt.

## Danke

Die Raumliste `resources/rooms.csv` (Adressen, TUW-Maps-Codes) stammt aus
[better-tiss-calendar](https://github.com/flofriday/better-tiss-calendar) von flofriday (MIT-Lizenz, siehe `resources/rooms.LICENSE`).

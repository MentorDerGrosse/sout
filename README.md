# sout

Desktop-App fürs Studium an der TU Wien: Kalender aus TISS, Prüfungen mit Anmeldefristen, Abgaben aus TUWEL, Notizen pro Fach.
Läuft im Hintergrund weiter, mit einem kleinen Fenster oben rechts (wie die JetBrains Toolbox).

Kurz, was sout kann:

- **Kalender** aus TISS mit eigenen Terminen, Überschneidungen markiert, LectureTube- und TUWEL-Links, gebuchte
  TUWEL-Termine (z. B. Abgabegespräche)
- **Abgaben & Tests** aus TUWEL, Kreuzerlübungen mit angekreuzten Beispielen, Raum bei Präsenztests,
  Ankündigungen der Kurse
- **Prüfungen**: Termine und Anmeldefristen deiner LVAs, Gruppenanmeldung, LVA-Abmeldefrist
- **Noten**: ECTS und Notendurchschnitt, Bewertungen und Feedback aus TUWEL
- **Notizen** pro Fach mit Formeln, PDFs daneben, Bildern per Strg+V, Links zwischen Notizen, PDF-Export;
  TUWEL-Unterlagen landen von selbst im Fach-Ordner
- Erinnerungen, Mini-Ansicht beim Symbol, hell/dunkel mit mehreren Farbschemata, Updates von selbst
  (Windows, Linux) – für Linux, Windows und macOS
Plan, Entscheidungen und Hintergründe: [PLAN.md](PLAN.md).

## Installieren

Die fertigen Dateien liegen bei jeder Version unter **[Releases](https://github.com/MentorDerGrosse/sout/releases/latest)**
(rechts auf der GitHub-Seite oder über den Link). Dort unter **Assets** die passende Datei herunterladen:

| System | Datei |
|---|---|
| Windows | `sout-…-x64.exe` |
| macOS mit Apple-Chip (M1, M2, M3 …) | `sout-…-mac-arm64.dmg` |
| macOS mit Intel-Chip | `sout-…-mac-x64.dmg` |
| Linux (alle) | `sout-…-x86_64.AppImage` – aktualisiert sich selbst |
| Fedora, wer lieber ein Paket will | `sout-…-x86_64.rpm` |

Welchen Chip dein Mac hat, steht unter  → Über diesen Mac.

### Windows

1. `sout-…-x64.exe` doppelklicken und durchklicken.
2. Windows warnt vor einer „unbekannten App“, weil sout nicht signiert ist: **Weitere Informationen → Trotzdem ausführen**.
3. Das Symbol sitzt **unten rechts in der Taskleiste**, eventuell hinter dem Pfeil **^**. Am besten von dort in die
   Taskleiste ziehen, dann ist es immer sichtbar. Ein Klick öffnet die Mini-Ansicht, ein Rechtsklick das Menü.

### macOS

1. Die `.dmg` öffnen und sout in **Programme** ziehen.
2. sout ist nicht von Apple signiert, deshalb blockiert macOS den ersten Start:
   - sout einmal öffnen; macOS meldet, dass es nicht geöffnet werden kann. Mit „Fertig“ schließen.
   - **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen, bei sout auf **„Dennoch öffnen“**
     klicken und mit dem Passwort bestätigen.
   - Bei älteren macOS-Versionen geht auch: Rechtsklick auf sout → Öffnen → Öffnen.
3. Das Symbol sitzt **oben rechts in der Menüleiste**. Ist etwas in den nächsten 24 Stunden fällig, steht die Anzahl
   daneben. Tastenkürzel heißen auf dem Mac Cmd statt Strg.

### Linux (Fedora, GNOME)

1. Für das Symbol oben in der Leiste braucht GNOME die Erweiterung „AppIndicator and KStatusNotifierItem Support“.
   Im Terminal (Aktivitäten → „Terminal“):
   ```sh
   sudo dnf install gnome-shell-extension-appindicator fuse-libs
   ```
   Danach einmal ab- und wieder anmelden und die Erweiterung einschalten:
   ```sh
   gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
   ```
   (`fuse-libs` braucht das AppImage zum Starten.)
2. **AppImage:** die Datei an einen festen Ort legen, z. B. einen Ordner `~/Programme`. Rechtsklick → Eigenschaften →
   „Als Programm ausführen“ einschalten, dann mit Doppelklick starten. Nicht mehr verschieben, sonst findet der
   Autostart sie nicht (ein Start von Hand repariert das).
3. **Oder RPM:** `sudo dnf install ./sout-…-x86_64.rpm` im Download-Ordner. Danach startet sout aus der App-Übersicht
   oder mit `sout`.
4. Ein Klick aufs Symbol öffnet das Menü und gleich die Mini-Ansicht dazu. Abhaken von „Mini-Ansicht“ im Menü
   schließt sie wieder. (GNOME öffnet bei einem Klick immer das Menü, sout hört mit, wann das passiert. Ein
   Doppelklick öffnet oder schließt nur die Mini-Ansicht.)

### Überall gleich

- **Erster Start:** Unter Einstellungen trägst du die TISS-Kalender-URL ein, unter Abgaben meldest du dich bei TUWEL an.
- **Autostart:** in der App unter Einstellungen oder im Menü des Symbols.
- **Schließen** beendet sout nicht: Das Hauptfenster wird zur Mini-Ansicht beim Symbol, ein Klick daneben schickt sie
  ins Symbol (in den Einstellungen abschaltbar). Ganz beenden mit Strg+Q (Mac: Cmd+Q) oder „Beenden“ im Menü.

## Aktualisieren

sout schaut alle sechs Stunden auf GitHub nach einer neuen Version. **Deine Daten bleiben bei jedem Update erhalten:**
Einstellungen, Zugänge, eigene Termine und Notizen liegen außerhalb des Programms (siehe
[Wo liegen die Daten?](#wo-liegen-die-daten)). Welche Version du hast und ob es eine neue gibt, steht unter
Einstellungen → Info → Updates.

### Windows und Linux (AppImage): von selbst

Du musst nichts tun. sout lädt die neue Version im Hintergrund und installiert sie, wenn du sout das nächste Mal
beendest. Eine Benachrichtigung sagt, wenn sie bereit ist. Wer nicht warten will: Einstellungen → Info → Updates →
**„Jetzt neu starten“**. Unter Windows kann dabei die Warnung „unbekannte App“ kommen: Weitere Informationen →
Trotzdem ausführen.

### macOS: von Hand, in einer Minute

Ohne kostenpflichtige Apple-Signatur darf sich sout auf dem Mac nicht selbst ersetzen. sout sagt dir aber Bescheid:
eine Benachrichtigung „Neue Version von sout“ und unter Einstellungen → Info → Updates der Knopf **„So aktualisierst du“**.
Dann:

1. sout ganz beenden: Cmd+Q oder im Menü des Symbols „Beenden“.
2. Auf der [Releases-Seite](https://github.com/MentorDerGrosse/sout/releases/latest) die neue `.dmg` herunterladen
   (Apple-Chip: `…-mac-arm64.dmg`, Intel: `…-mac-x64.dmg`).
3. Die `.dmg` öffnen, sout in **Programme** ziehen und **„Ersetzen“** wählen.
4. sout starten. Weil die neue Fassung wieder nicht signiert ist, blockiert macOS den ersten Start erneut:
   Systemeinstellungen → Datenschutz & Sicherheit → **„Dennoch öffnen“**.
5. Fertig. Autostart, Einstellungen und Zugänge bleiben, wie sie waren.

### Linux (RPM): von Hand

sout sagt Bescheid wie auf dem Mac. Dann die neue `.rpm` von der Releases-Seite laden und im Download-Ordner:
```sh
sudo dnf install ./sout-…-x86_64.rpm
```
Danach sout beenden und neu starten. (Wer das nicht jedes Mal machen will: das AppImage aktualisiert sich selbst.)

## Selbst bauen

Statt die fertigen Dateien herunterzuladen, kannst du sout auch selbst bauen, z. B. um den neuesten Stand vor der
nächsten Version zu haben. Das klingt schwieriger, als es ist: Du tippst ein paar Befehle in ein Terminal, den Rest
erledigt der Computer. Einmal einrichten dauert etwa 15 Minuten, danach geht jedes Update in wenigen Minuten (siehe
[Selbst gebaut aktualisieren](#selbst-gebaut-aktualisieren)).

**Was du brauchst:** [Node.js 22 (LTS)](https://nodejs.org) mit npm und [Git](https://git-scm.com). Wie du sie
installierst, steht unten beim jeweiligen System.

**Ein Terminal öffnen:**

- **Linux:** Aktivitäten → „Terminal“
- **Windows:** Start → „Eingabeaufforderung“ oder „Terminal“
- **macOS:** Programme → Dienstprogramme → „Terminal“

Befehle tippst oder kopierst du dort hinein und bestätigst jede Zeile mit Enter. Manche brauchen etwas Zeit,
dann einfach warten, bis wieder eine Eingabezeile kommt.

### Linux (Fedora, GNOME)

1. Werkzeuge installieren (fragt nach deinem Passwort):
   ```sh
   sudo dnf install nodejs git
   ```
2. Für das Symbol oben in der Leiste braucht GNOME die Erweiterung „AppIndicator and KStatusNotifierItem Support“:
   ```sh
   sudo dnf install gnome-shell-extension-appindicator
   ```
   Danach einmal ab- und wieder anmelden und die Erweiterung einschalten:
   ```sh
   gnome-extensions enable appindicatorsupport@rgcjonas.gmail.com
   ```
3. sout herunterladen und vorbereiten:
   ```sh
   git clone https://github.com/MentorDerGrosse/sout.git
   cd sout
   npm install
   ```
4. Paket bauen und installieren, eines von beiden:
   - **AppImage** (eine einzelne Datei, keine Installation):
     ```sh
     sudo dnf install fuse-libs
     npm run dist:appimage
     ```
     Die Datei `dist/sout-…-x86_64.AppImage` kannst du an einen festen Ort kopieren, z. B. nach `~/Programme/`.
     Starten mit Doppelklick, oder Rechtsklick → Eigenschaften → „Als Programm ausführen“ einschalten.
   - **RPM** (mit Eintrag in der App-Übersicht):
     ```sh
     sudo dnf install rpm-build
     npm run dist:linux
     sudo dnf install ./dist/sout-*-x86_64.rpm
     ```
     Danach startet sout aus der App-Übersicht oder mit `sout`.
5. Ein Klick aufs Symbol öffnet das Menü und gleich die Mini-Ansicht dazu. Abhaken von „Mini-Ansicht“ im Menü
   schließt sie wieder. (GNOME öffnet bei einem Klick immer das Menü, sout hört mit, wann das passiert. Ein
   Doppelklick öffnet oder schließt nur die Mini-Ansicht.)

Ohne Paket geht es auch direkt aus dem Projektordner, siehe
[Ins System einbinden](#ins-system-einbinden-linux-aus-dem-projektordner).

### Windows

1. Werkzeuge installieren, in der Eingabeaufforderung:
   ```
   winget install OpenJS.NodeJS.LTS Git.Git
   ```
   Danach das Fenster schließen und ein **neues** öffnen (sonst kennt es die neuen Befehle noch nicht).
2. sout herunterladen, vorbereiten und den Installer bauen:
   ```
   git clone https://github.com/MentorDerGrosse/sout.git
   cd sout
   npm install
   npm run dist:win
   ```
3. Im Ordner `sout\dist` liegt jetzt `sout-…-x64.exe`. Doppelklicken und durchklicken.
4. Windows warnt beim ersten Start vor einer „unbekannten App“, weil der Installer nicht signiert ist:
   **Weitere Informationen → Trotzdem ausführen**.
5. Das Symbol sitzt **unten rechts in der Taskleiste**, eventuell hinter dem Pfeil **^**. Am besten von dort in
   die Taskleiste ziehen, dann ist es immer sichtbar. Ein Klick öffnet die Mini-Ansicht, ein Rechtsklick das Menü.

### macOS

1. Werkzeuge installieren: Node.js 22 (LTS) von [nodejs.org](https://nodejs.org) herunterladen und installieren.
   Git kommt mit diesem Befehl (ein Fenster fragt nach, mit „Installieren“ bestätigen):
   ```sh
   xcode-select --install
   ```
   Wer [Homebrew](https://brew.sh) hat, kann stattdessen `brew install node@22 git` nehmen.
2. sout herunterladen, vorbereiten und bauen:
   ```sh
   git clone https://github.com/MentorDerGrosse/sout.git
   cd sout
   npm install
   npm run dist:mac
   ```
3. Im Ordner `sout/dist` liegen zwei `.dmg`-Dateien:
   - `…-mac-arm64.dmg` für Macs mit Apple-Chip (M1, M2, M3 …)
   - `…-mac-x64.dmg` für ältere Macs mit Intel

   Welchen Chip du hast, steht unter  → Über diesen Mac. Die passende `.dmg` öffnen und sout in **Programme**
   ziehen.
4. sout ist nicht von Apple signiert, deshalb blockiert macOS den ersten Start:
   - sout einmal öffnen; macOS meldet, dass es nicht geöffnet werden kann. Mit „Fertig“ schließen.
   - **Systemeinstellungen → Datenschutz & Sicherheit**, ganz nach unten scrollen, bei sout auf **„Dennoch öffnen“**
     klicken und mit dem Passwort bestätigen.
   - Bei älteren macOS-Versionen geht auch: Rechtsklick auf sout → Öffnen → Öffnen.
5. Das Symbol sitzt **oben rechts in der Menüleiste**. Ist etwas in den nächsten 24 Stunden fällig, steht die
   Anzahl daneben. Tastenkürzel heißen auf dem Mac Cmd statt Strg.

### Pakete von GitHub bauen lassen

Unter **Actions → „Bauen & testen“ → Run workflow** baut GitHub sout auf echten Linux-, Windows- und Mac-Rechnern,
lässt dort den Testlauf laufen und legt Installer und Screenshots zum Herunterladen ab (unten auf der Seite des Laufs).
Das braucht einen GitHub-Zugang mit Rechten am Repository.

### Selbst gebaut aktualisieren

Eine neue Version holst du dir so wie beim ersten Bauen: neuen Stand herunterladen, neu bauen, neu installieren.
**Deine Daten bleiben dabei erhalten:** Einstellungen, Zugänge, eigene Termine und Notizen liegen außerhalb des
Programms (siehe [Wo liegen die Daten?](#wo-liegen-die-daten)). Welche Version du hast, steht unter Einstellungen → Info.

**1. sout ganz beenden:** Menü des Symbols → „Beenden“, oder Strg+Q (Mac: Cmd+Q). Nur das Fenster zu schließen
reicht nicht, sout läuft sonst im Hintergrund weiter.

**2. Den neuen Stand holen**, im Terminal im Ordner `sout`:

```sh
cd sout
git pull
npm install
```

`cd sout` brauchst du nur, wenn das Terminal nicht schon im Ordner ist. Unter Windows z. B. `cd %USERPROFILE%\sout`,
unter Linux und macOS `cd ~/sout`, je nachdem, wohin du sout bei der Installation geladen hast.

**3. Neu bauen und installieren**, je nach System:

- **Linux, AppImage:**
  ```sh
  npm run dist:appimage
  ```
  Die neue Datei aus `dist/` über die alte kopieren (gleicher Ort, gleicher Name). Der Autostart findet sie dann
  von selbst. Falls der Name sich geändert hat, startet sout einmal von Hand, dann passt sich der Autostart an.
- **Linux, RPM:**
  ```sh
  npm run dist:linux
  sudo dnf reinstall ./dist/sout-*-x86_64.rpm
  ```
  Meldet dnf, dass das Paket nicht installiert ist (z. B. weil die Version gestiegen ist), stattdessen
  `sudo dnf install ./dist/sout-*-x86_64.rpm`.
- **Linux, aus dem Projektordner** (`npm start` oder `npm run install-desktop`):
  ```sh
  npm run build
  ```
  Danach sout neu starten. Der Autostart nimmt automatisch die neue Fassung.
- **Windows:**
  ```
  npm run dist:win
  ```
  Den neuen Installer aus `dist\` starten und durchklicken. Er ersetzt die alte Version, deine Einstellungen
  bleiben. Die Warnung „unbekannte App“ kann wieder kommen: **Weitere Informationen → Trotzdem ausführen**.
- **macOS:**
  ```sh
  npm run dist:mac
  ```
  1. Die passende `.dmg` aus `dist/` öffnen.
  2. sout in **Programme** ziehen und **„Ersetzen“** wählen.
  3. Weil die neue Fassung wieder nicht signiert ist, blockiert macOS den ersten Start erneut. Wie bei der
     Installation: Systemeinstellungen → Datenschutz & Sicherheit → **„Dennoch öffnen“**.
  4. Den Autostart musst du nicht neu einschalten.

**4. sout starten.** Fertig.

**Wenn etwas hakt:**

- **`git pull` meldet Konflikte:** Du hast im Ordner `sout` selbst Dateien geändert. Mit `git stash` legst du deine
  Änderungen beiseite, dann `git pull` nochmal.
- **`npm install` oder das Bauen bricht ab:** Ist Node.js 22 installiert? Prüfen mit `node --version`, die Ausgabe
  sollte `v22` oder höher sein.
- **sout startet nach dem Update gar nicht:** Den Ordner `dist` löschen und Schritt 3 wiederholen.

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
- **Bilder:** Ein Bild in der Zwischenablage (z. B. ein Screenshot) mit Strg+V (Mac: Cmd+V) einfügen. Es landet im
  Ordner `Bilder` neben der Notiz.
- **Links zwischen Notizen:** `[[Zusammenfassung]]` oder `[[Zusammenfassung|anderer Text]]`. Nach `[[` schlägt der Editor
  die Notizen vor. Gibt es die Notiz noch nicht, ist der Link grau und ein Klick legt sie an.
- **Als PDF:** das Symbol mit dem Pfeil in der Notizleiste. Die Notiz kommt so wie in der Vorschau heraus, immer hell.
- **TUWEL-Unterlagen:** Mit TUWEL-Verbindung kommen die Dateien deiner Kurse alle sechs Stunden in den Ordner
  `Unterlagen` des Fachs. Was du dort löschst, kommt nicht wieder. Abschaltbar unter Einstellungen → Notizen.
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
| `~/.config/sout/courseinfo.json` | ECTS und TUWEL-Link je LVA, von ihrer TISS-Seite |
| `~/.config/sout/studies.json` | ECTS- und Notenübersicht mit deinen eingetragenen Noten |
| `~/.config/sout/tuwel-extras.json` | Ankündigungen, Kreuzerlübungen, Termine und Bewertungen aus TUWEL |
| `~/.config/sout/materials.json` | welche TUWEL-Dateien schon im Notizordner liegen |
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
| `--tuwel-calls=<datei>` | ruft die TUWEL-Funktionen aus `SOUT_TUWEL_CALLS` (JSON) mit frischem Schlüssel auf und speichert die Antworten; gibt nur Zahlen aus |
| `--dump-exams=<datei>` | liest die TISS-Seiten der LVAs aus deinem Kalender wie die App und speichert die Prüfungen als JSON; gibt nur Zahlen aus |
| `SOUT_TISS_PAGES=<ordner>` | nimmt die LVA-Seiten aus diesem Ordner (`123456.html` für 123.456) statt von TISS |
| `SOUT_SMOKE_THEME=light` | Testlauf im hellen statt dunklen Modus |

## Lizenz

MIT – siehe [LICENSE](LICENSE). Du darfst sout benutzen, verändern und weitergeben, solange der Lizenzhinweis dabei bleibt.

## Danke

Die Raumliste `resources/rooms.csv` (Adressen, TUW-Maps-Codes) stammt aus
[better-tiss-calendar](https://github.com/flofriday/better-tiss-calendar) von flofriday (MIT-Lizenz, siehe `resources/rooms.LICENSE`).

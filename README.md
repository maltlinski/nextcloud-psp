# PSP – Projektstrukturplan für Nextcloud

Projektstrukturpläne (PSP, engl. *work breakdown structure*) gemeinsam in Nextcloud erstellen, als Baum bearbeiten und für Anträge exportieren.

> **Status:** im Aufbau. Phasen 0–2 sind umgesetzt: Pläne lassen sich in Files anlegen, im Editor als Gliederung bearbeiten und gemeinsam nutzen. Den Fahrplan zeigt [ROADMAP.md](ROADMAP.md).

## Idee

- Projekt → Teilprojekte → Arbeitspakete in beliebiger Tiefe, dazu Meilensteine
- Automatische PSP-Codes (1, 1.2, 1.2.3)
- Arbeitspaket-Steckbriefe: verantwortliche Person, Ziel, Ergebnis, Aufwand, Kosten, Termine, Status
- Summen für Aufwand, Kosten und Zeitraum über alle Ebenen
- Gespeichert als `.psp`-Datei (JSON) in Nextcloud Files – teilen, Versionen und Rechte funktionieren wie bei jeder Datei
- Export als PDF, SVG/PNG, CSV und XLSX (geplant)

## Voraussetzungen

- Nextcloud 33, 34 oder 35
- PHP 8.2 oder neuer

## Installation (eigener Server)

Bis zur Veröffentlichung im App Store:

```bash
cd /pfad/zu/nextcloud/custom_apps   # oder apps/
git clone https://github.com/maltlinski/nextcloud-psp.git psp
cd psp
npm ci && npm run build
cd ../..
sudo -u www-data php occ app:enable psp
```

Danach erscheint „PSP“ in der App-Leiste, und in Files gibt es unter „Neu“ den Eintrag „Neuer Projektstrukturplan“.

## Bedienung

- **Anlegen:** in Files „Neu → Neuer Projektstrukturplan“ oder in der App „Neuer Projektstrukturplan“
- **Öffnen:** auf eine `.psp`-Datei klicken
- **Bearbeiten:** Enter legt einen neuen Punkt an, Tab rückt ein, Umschalt+Tab rückt aus, Alt+Pfeil verschiebt, Strg+Z macht rückgängig
- **Speichern:** passiert automatisch. Hat jemand anderes inzwischen gespeichert, fragt die App, welche Fassung gelten soll.

## Entwicklung

Siehe [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md). Kurz:

```bash
npm ci
npm run watch          # Frontend neu bauen bei Änderungen
npm test               # Unit-Tests (Vitest)
npm run test:coverage  # mit Abdeckungsbericht
npm run lint
composer install       # PHP-Werkzeuge
composer run test:unit # PHPUnit
```

Das Dateiformat `.psp` ist in [docs/DATEIFORMAT.md](docs/DATEIFORMAT.md) beschrieben.

## Lizenz

AGPL-3.0-or-later

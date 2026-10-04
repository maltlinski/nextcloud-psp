# Fahrplan

Jede Phase endet mit einer prüfbaren Abnahme. Nach Phase 4 ist die App im Alltag nutzbar (MVP).
Der ausführliche Plan mit Recherche und Begründungen liegt im Planungsdokument
„PSP-App für Nextcloud – Recherche & Bauplan“.

## Phase 0 – Grundgerüst ✅

- [x] Git-Repository, Lizenz AGPL-3.0-or-later
- [x] App aus `nextcloud/app_template` erzeugt, App-ID `psp`, Namespace `OCA\Psp`, NC 33–35
- [x] Anleitung für eine lokale Entwicklungs-Nextcloud ([docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md))
- [x] CI-Workflows: ESLint, Stylelint, Typprüfung, Vitest, Build, PHP-Lint, PHPUnit, Psalm, php-cs-fixer, info.xml-Schema, Installation auf NC 33/34/35 (liegen in `ci/workflows/`, Aktivierung siehe [ci/README.md](ci/README.md))

**Abnahme:** App erscheint in der Navigation und zeigt eine Vue-3-Seite. Geprüft auf Nextcloud 34.0.4.

## Phase 1 – Datenkern (TypeScript) ✅

- [x] Typen und Validierung für Dateiformat v1 ([docs/DATEIFORMAT.md](docs/DATEIFORMAT.md))
- [x] Baumoperationen: einfügen, verschieben, ein-/ausrücken, hoch/runter, löschen
- [x] Rückgängig/Wiederholen
- [x] PSP-Codes (auch eingefroren), Summen (Aufwand, Kosten, Zeitraum), Validierung (Zyklen, verwaiste Knoten, Abhängigkeiten)
- [x] Vitest-Tests, Abdeckung ≥ 90 % (erreicht: 98,8 % Zeilen, 98,3 % Zweige)

**Abnahme:** Beispiel-PSP lässt sich laden, ändern und verlustfrei speichern. Erfüllt: [docs/beispiel.psp](docs/beispiel.psp) wird geladen, bearbeitet und byte-genau wieder geschrieben (Test in `src/core/__tests__/serialize.test.ts`).

## Phase 2 – Files-Integration

- [ ] Dateityp `.psp` registrieren (MIME-Typ, Symbol)
- [ ] Eintrag „Neu → Projektstrukturplan“ im Files-Menü
- [ ] Datei-Aktion „In PSP öffnen“
- [ ] Laden/Speichern per WebDAV mit ETag, Autosave, Konfliktdialog

**Abnahme:** Zwei Personen öffnen dieselbe geteilte Datei; wer veraltet speichert, bekommt einen Konfliktdialog statt stillem Überschreiben.

## Phase 3 – Editor

- [ ] Gliederungsansicht mit Tastatursteuerung
- [ ] Baumdiagramm (SVG, einklappbar, Zoom, Drag & Drop)
- [ ] Seitenleiste mit Steckbrief, Personenauswahl aus Nextcloud-Nutzern
- [ ] Tabellenansicht der Arbeitspakete

## Phase 4 – Export (MVP)

- [ ] PDF (A4/A3 quer, optional Steckbriefe), SVG/PNG, CSV, XLSX
- [ ] Druckansicht mit Kopfzeile

## Phase 5 – Zeit und Kosten

- [ ] Zeitleiste aus Start/Ende, Meilensteine
- [ ] Kostenplan nach Kategorien und Teilprojekten
- [ ] Vorlagen (Theaterproduktion, leer)

## Phase 6 – Anbindungen

- [ ] Arbeitspakete als Deck-Karten
- [ ] Export für Gantt Projects (NC-Gantt)
- [ ] Meilensteine als ICS
- [ ] Benachrichtigung bei Zuweisung

## Phase 7 – Veröffentlichung

- [ ] Übersetzungen, Barrierefreiheit
- [ ] App-Store-Zertifikat, signierte Releases

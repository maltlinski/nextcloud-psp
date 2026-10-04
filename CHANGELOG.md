# Changelog

## Unveröffentlicht

### Phase 2 – Files-Integration
- „Neu → Neuer Projektstrukturplan“ in Files und auf der Startseite der App
- `.psp`-Dateien öffnen sich per Klick im Editor; neue Dateien bekommen den MIME-Typ `application/x-psp+json`
- Datei-API mit ETag-Prüfung: automatisches Speichern, Konfliktdialog (neu laden oder eigene Fassung speichern), Nur-lesen-Modus für Freigaben ohne Schreibrecht
- Erste Gliederungsansicht mit Tastatursteuerung, PSP-Codes und Summen
- Integrationstest der API und Browsertest (Nextcloud 34 und 35)

### Phase 1 – Datenkern
- Dateiformat `.psp` Version 1 mit robustem Laden (Fehler vs. Warnungen) und stabilem Speichern
- Baumoperationen: einfügen, verschieben, ein-/ausrücken, hoch/runter, löschen
- PSP-Codes inkl. Einfrieren, Summen für Aufwand, Kosten und Zeitraum
- Rückgängig/Wiederholen

### Phase 0 – Grundgerüst
- App `psp` auf Basis von `nextcloud/app_template` (Vue 3, Vite), Nextcloud 33–35
- CI für Frontend, PHP und Installation auf echten Nextcloud-Servern

# Hinweise für die Arbeit an diesem Repository

Nextcloud-App `psp` (Projektstrukturplan). Klassische App: PHP-Backend dünn, Logik im Browser (Vue 3 + TypeScript).
Pläne werden als `.psp`-JSON-Dateien in Nextcloud Files gespeichert.

## Stand und Plan

- Fahrplan mit Phasen und Abnahmekriterien: `ROADMAP.md` (nach jeder Phase abhaken).
- Dateiformat: `docs/DATEIFORMAT.md`. Änderungen am Format nur mit neuer `schemaVersion` und Migration in `src/core/validate.ts`.

## Regeln

- `src/core/` bleibt frei von Vue- und Nextcloud-Abhängigkeiten. Alle Operationen sind rein (neues Dokument zurück, Eingabe unverändert).
- Jede Änderung in `src/core/` mit Vitest-Tests; Abdeckungsschwelle 90 % (`npm run test:coverage`).
- `tsconfig` setzt `erasableSyntaxOnly`: keine Parameter-Properties, keine `enum`s, keine Namespaces.
- Unterstützte Nextcloud-Versionen 33–35 (`appinfo/info.xml`), PHP ab 8.2.
- Oberfläche auf Deutsch, Texte über `t('psp', …)` aus `@nextcloud/l10n`. Code und Kommentare auf Englisch.
- Lizenzkopf (SPDX, AGPL-3.0-or-later) in jeder neuen Quelldatei.

## Befehle

```bash
npm ci && npm run build
npm test / npm run test:coverage
npm run lint && npm run stylelint && npm run typecheck
composer install && composer run test:unit && composer run psalm
```

Packagist ist in manchen Sandbox-Umgebungen gesperrt. Dann PHPUnit 10.5 und seine Abhängigkeiten per `git clone` holen und mit
einer Classmap (`composer dump-autoload`) laden; Psalm gibt es als fertiges Phar im Repository `psalm/phar`.
Für einen echten Test eine Nextcloud aus `nextcloud/server` (Branch `stable34`, Submodul `3rdparty`) mit SQLite installieren,
die App nach `apps/psp` verlinken und `php occ app:enable psp` ausführen. Danach `tests/integration/api-test.sh`
und `tests/e2e/editor-flow.mjs` laufen lassen.

## Architektur in einem Satz je Teil

- Speichern läuft über `FileController` → `PlanFileService` (ETag-Vergleich, `force` zum Überschreiben), nicht über WebDAV-`If-Match`.
- `src/services/session.ts` hält Dokument, Verlauf und Speicherzustand (`saved`, `dirty`, `saving`, `conflict`, `error`, `readonly`).
- `src/files.ts` wird über `LoadAdditionalScriptsEvent` in Files geladen; Dateien werden an der Endung `.psp` erkannt.

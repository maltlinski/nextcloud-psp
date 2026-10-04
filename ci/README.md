# CI-Workflows

Diese GitHub-Actions-Workflows sind fertig, aber noch nicht aktiv: Die GitHub-Anbindung, über die Claude
in dieses Repository schreibt, darf aus Sicherheitsgründen keine Dateien unter `.github/workflows/` anlegen.

**Aktivieren (einmalig):** die drei Dateien nach `.github/workflows/` verschieben, z. B. lokal:

```bash
git mv ci/workflows .github/workflows
git commit -m "ci: Workflows aktivieren"
git push
```

oder auf github.com je Datei „Add file → Create new file“ mit dem Pfad `.github/workflows/<name>.yml` und dem Inhalt.

| Datei | Prüft |
| --- | --- |
| `node.yml` | ESLint, Stylelint, Typprüfung, Vitest mit Abdeckung, Build |
| `php.yml` | PHP-Syntax und PHPUnit (PHP 8.2–8.4), Psalm gegen NC 33/34/35, Codestil, info.xml-Schema |
| `integration.yml` | Installiert Nextcloud 33, 34 und 35 mit SQLite, aktiviert die App und ruft ihre Seite auf |

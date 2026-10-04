# Entwicklung

## Werkzeuge

- Node 24 und npm 11 (`.nvmrc`)
- PHP 8.2+ und Composer
- Docker (für die lokale Nextcloud)

## Lokale Nextcloud unter Windows

1. **Docker Desktop** mit WSL-2-Backend installieren.
2. Den Code **in WSL** ablegen, nicht in OneDrive oder unter `C:\` – sonst ist das Dateisystem langsam und OneDrive synchronisiert `node_modules`:
   ```bash
   # in einem WSL-Terminal (Ubuntu)
   mkdir -p ~/dev && cd ~/dev
   git clone https://github.com/juliusknorr/nextcloud-docker-dev.git
   git clone https://github.com/maltlinski/nextcloud-psp.git
   ```
3. Der Entwicklungsumgebung den App-Ordner bekannt machen. In `nextcloud-docker-dev/.env` (nach `./bootstrap.sh` vorhanden) den Pfad für zusätzliche Apps setzen, z. B.
   ```
   ADDITIONAL_APPS_PATH=/home/<du>/dev/apps-extra
   ```
   und die App dort verlinken:
   ```bash
   mkdir -p ~/dev/apps-extra && ln -s ~/dev/nextcloud-psp ~/dev/apps-extra/psp
   ```
   Alternativ eine einzelne Testinstanz starten und den Ordner direkt einhängen:
   ```bash
   docker run --rm -p 8080:80 \
     -v ~/dev/nextcloud-psp:/var/www/html/apps-extra/psp \
     ghcr.io/juliusknorr/nextcloud-dev-php83:latest
   ```
   Details: <https://juliusknorr.github.io/nextcloud-docker-dev/basics/getting-started/>
4. Frontend bauen und beobachten:
   ```bash
   cd ~/dev/nextcloud-psp
   npm ci
   npm run watch
   ```
5. App aktivieren (Container-Name ggf. anpassen):
   ```bash
   docker compose exec nextcloud occ app:enable psp
   ```
6. Im Browser anmelden (Standard: `admin` / `admin`) und „PSP“ in der App-Leiste öffnen.

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Produktions-Build nach `js/` und `css/` |
| `npm run watch` | Entwicklungs-Build bei jeder Änderung |
| `npm test` | Vitest-Unit-Tests |
| `npm run test:coverage` | Tests mit Abdeckung (Schwelle 90 % für `src/core`) |
| `npm run lint` / `npm run stylelint` | ESLint / Stylelint |
| `npm run typecheck` | TypeScript-Prüfung inkl. `.vue` |
| `composer install` | PHP-Werkzeuge (PHPUnit, Psalm, php-cs-fixer) |
| `composer run test:unit` | PHPUnit |
| `composer run psalm` | Statische Analyse |
| `composer run cs:fix` | PHP-Code formatieren |

## Aufbau

```
appinfo/info.xml        App-Metadaten
lib/                    PHP: App-Registrierung, Controller
templates/index.php     Einstiegsseite der App
src/core/               Datenkern ohne UI (TypeScript, voll getestet)
src/components/         Vue-Komponenten
src/App.vue, main.ts    Vue-Einstieg
tests/                  PHPUnit
docs/                   Dokumentation
```

Der Datenkern in `src/core` hängt weder von Vue noch von Nextcloud ab. Alle Operationen sind rein:
Sie bekommen ein Dokument und geben ein neues zurück. Das macht Rückgängig/Wiederholen und Tests einfach.

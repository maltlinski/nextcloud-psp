# Dateiformat `.psp` (Version 1)

Ein Projektstrukturplan ist eine UTF-8-JSON-Datei mit der Endung `.psp` und dem MIME-Typ `application/x-psp+json`.
Eine leere `.psp`-Datei öffnet die App als neuen Plan, benannt nach der Datei.
Ein vollständiges Beispiel liegt in [beispiel.psp](beispiel.psp).

## Aufbau

```json
{
  "format": "nextcloud-psp",
  "schemaVersion": 1,
  "meta": { … },
  "nodes": [ … ]
}
```

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| `format` | ja | immer `"nextcloud-psp"` |
| `schemaVersion` | ja | Ganzzahl ≥ 1. Ältere Versionen werden beim Laden migriert, neuere abgelehnt. |
| `meta` | nein | Einstellungen des Plans, fehlende Werte werden ergänzt |
| `nodes` | ja | alle Knoten als flache Liste |

### `meta`

| Feld | Typ | Standard | Bedeutung |
| --- | --- | --- | --- |
| `title` | Text | `""` | Titel des Plans, identisch mit dem Titel des Wurzelknotens |
| `currency` | Text | `"EUR"` | Währung (ISO 4217) |
| `codeScheme` | `"numeric"` | `"numeric"` | Nummerierung (derzeit nur 1, 1.2, 1.2.3) |
| `frozenCodes` | Wahrheitswert | `false` | Codes eingefroren, siehe unten |
| `costCategories` | Liste von Texten | Personal, Sachkosten, Reise, Sonstiges | Auswahl für Kostenpositionen |

### Knoten

Der Baum ist flach gespeichert: Jeder Knoten nennt seinen Elternknoten (`parentId`) und seine Position unter den Geschwistern (`order`).

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `id` | Text | eindeutige Kennung (UUID) |
| `parentId` | Text oder `null` | Elternknoten; genau ein Knoten hat `null` (die Wurzel) |
| `order` | Zahl | Position unter den Geschwistern, beginnend bei 0 |
| `type` | `project`, `subproject`, `workpackage`, `milestone` | Art des Knotens |
| `title` | Text | Bezeichnung |
| `code` | Text | nur bei eingefrorenen Codes: gespeicherter PSP-Code |
| `owner` | `{ "uid", "displayName" }` oder `null` | verantwortliche Person (Nextcloud-Nutzer) |
| `goal` | Text | Ziel |
| `deliverable` | Text | Ergebnis / Lieferobjekt |
| `description` | Text | Beschreibung |
| `effortDays` | Zahl ≥ 0 oder `null` | Aufwand in Personentagen |
| `costs` | Liste von `{ "category", "amount", "note"? }` | Kostenpositionen, Beträge ≥ 0 |
| `start`, `end` | `"JJJJ-MM-TT"` oder `null` | Zeitraum, Ende einschließlich |
| `date` | `"JJJJ-MM-TT"` oder `null` | nur Meilensteine: Termin |
| `status` | `open`, `in_progress`, `done` | Bearbeitungsstand |
| `dependsOn` | Liste von Knoten-IDs | Vorgänger, die vorher fertig sein müssen |

Optionale Felder fehlen in der Datei, wenn sie nicht gesetzt sind.

## Regeln

- Genau eine Wurzel, und sie hat den Typ `project`. Kein anderer Knoten ist ein `project`.
- Jeder `parentId` verweist auf einen vorhandenen Knoten; es gibt keine Zyklen.
- Meilensteine haben keine Kinder.
- Bekommt ein Arbeitspaket Kinder, wird es automatisch zum Teilprojekt. Ein Knoten mit Kindern kann nicht zum Arbeitspaket oder Meilenstein werden.

## PSP-Codes

Codes werden nicht gespeichert, sondern aus der Position berechnet:
Wurzel `0`, ihre Kinder `1`, `2`, `3`, darunter `1.1`, `1.2`, `1.2.1` usw.
Meilensteine zählen nicht mit; sie heißen in Baumreihenfolge `M1`, `M2`, …

Ist `meta.frozenCodes` `true`, behält jeder Knoten den Code aus seinem Feld `code`, auch wenn er verschoben wird.
Neue Knoten bekommen die nächste freie Nummer unter ihrem Elternknoten. So bleiben Verweise in einem
abgegebenen Antrag gültig.

## Robustes Laden

- **Fehler** (Datei wird nicht geöffnet): kein JSON, falsches `format`, neuere `schemaVersion`,
  Knoten ohne `id` oder mit unbekanntem `type`, doppelte IDs, keine oder mehrere Wurzeln,
  fehlende Elternknoten, Zyklen, Meilensteine mit Kindern.
- **Warnungen** (Feld wird verworfen, der Rest öffnet): ungültige Datumswerte, negative Beträge oder
  Aufwände, unbekannter Status, Abhängigkeiten auf fehlende Knoten. Abhängigkeitszyklen und
  Start nach Ende werden nur gemeldet.

## Speichern

Beim Speichern stehen die Knoten in Baumreihenfolge und die Felder immer in derselben Reihenfolge.
Ein unveränderter Plan ergibt dieselben Bytes; Dateiversionen in Nextcloud unterscheiden sich nur dort,
wo sich der Plan geändert hat.

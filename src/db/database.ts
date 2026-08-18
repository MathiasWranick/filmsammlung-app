import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

// Name der Datenbank-Datei im privaten Browser-Speicher (OPFS).
// OPFS ist ein Dateisystem, das nur diese Web-App selbst sehen kann -
// es liegt nicht im normalen Download-Ordner o.ä.
const DB_DATEINAME = 'filmsammlung.sqlite3'

// Einfache Schema-Versionierung: Jede neue Version fügt bei Bedarf
// weitere Spalten/Tabellen hinzu, ohne bestehende Daten zu verlieren.
const AKTUELLE_SCHEMA_VERSION = 8

let dbInstanz: Database | null = null
let dbWirdGeoeffnet: Promise<Database> | null = null

async function opfsWurzel(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

async function ladeDatenbankBytes(): Promise<Uint8Array | undefined> {
  try {
    const wurzel = await opfsWurzel()
    const dateiHandle = await wurzel.getFileHandle(DB_DATEINAME)
    const datei = await dateiHandle.getFile()
    const buffer = await datei.arrayBuffer()
    return buffer.byteLength > 0 ? new Uint8Array(buffer) : undefined
  } catch {
    // Datei existiert noch nicht - das ist beim allerersten Start normal.
    return undefined
  }
}

async function speichereDatenbankBytes(bytes: Uint8Array): Promise<void> {
  const wurzel = await opfsWurzel()
  const dateiHandle = await wurzel.getFileHandle(DB_DATEINAME, { create: true })
  const schreibStrom = await dateiHandle.createWritable()
  // Type-Cast nötig: TypeScripts DOM-Typen erwarten hier ein Uint8Array,
  // dessen Speicherbereich exakt als "ArrayBuffer" typisiert ist, sql.js
  // liefert aber den allgemeineren Typ "ArrayBufferLike" zurück. Zur
  // Laufzeit sind beide identisch (ganz normale Bytes), es geht hier
  // ausschließlich um eine Falschmeldung der TypeScript-Prüfung.
  await schreibStrom.write(bytes as unknown as BufferSource)
  await schreibStrom.close()
}

function fuehreMigrationenAus(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      version INTEGER NOT NULL
    );
  `)

  const ergebnis = db.exec('SELECT version FROM schema_meta LIMIT 1')
  const vorhandeneVersion = ergebnis.length > 0 ? Number(ergebnis[0].values[0][0]) : 0

  if (vorhandeneVersion < 1) {
    db.run(`
      CREATE TABLE filme (
        id TEXT PRIMARY KEY,
        titel TEXT NOT NULL,
        format TEXT NOT NULL,
        foto_dateiname TEXT NOT NULL,
        erfasst_am TEXT NOT NULL,
        zuletzt_geaendert TEXT NOT NULL,
        geloescht_am TEXT
      );
    `)
  }

  if (vorhandeneVersion < 2) {
    // Neue, optionale Felder für die per Texterkennung (OCR) erfassten
    // Angaben. ADD COLUMN verändert bestehende Datensätze nicht - dort
    // bleiben diese Felder einfach leer (NULL).
    db.run('ALTER TABLE filme ADD COLUMN fsk TEXT')
    db.run('ALTER TABLE filme ADD COLUMN laufzeit_minuten INTEGER')
    db.run('ALTER TABLE filme ADD COLUMN barcode TEXT')
  }

  if (vorhandeneVersion < 3) {
    // Zweites, optionales Foto (Rückseite). Das bisherige Feld
    // foto_dateiname steht ab jetzt für die Vorderseite (Vorschaubild),
    // vorhandene Datensätze aus Stufe 0.1/0.2 zeigten dort bisher ein Foto
    // der Rückseite - das bleibt als Vorschaubild einfach bestehen.
    db.run('ALTER TABLE filme ADD COLUMN foto_rueckseite_dateiname TEXT')
    // Zusätzliche Felder, die die neue KI-Bilderkennung direkt liefern
    // kann (bisher für Stufe 0.3/OMDb vorgesehen, werden jetzt schon vom
    // Foto miterfasst, falls erkennbar).
    db.run('ALTER TABLE filme ADD COLUMN regisseur TEXT')
    db.run('ALTER TABLE filme ADD COLUMN darsteller TEXT')
    db.run('ALTER TABLE filme ADD COLUMN handlung TEXT')
  }

  if (vorhandeneVersion < 4) {
    // Felder, die ab Stufe 0.3 über OMDb ergänzt werden können (füllt nur
    // Lücken, die Foto/KI-Bilderkennung und manuelle Eingabe offen lassen).
    db.run('ALTER TABLE filme ADD COLUMN originaltitel TEXT')
    db.run('ALTER TABLE filme ADD COLUMN jahr INTEGER')
    db.run('ALTER TABLE filme ADD COLUMN genre TEXT')
    db.run('ALTER TABLE filme ADD COLUMN produktionsland TEXT')
    db.run('ALTER TABLE filme ADD COLUMN sprache TEXT')
    db.run('ALTER TABLE filme ADD COLUMN imdb_bewertung TEXT')
  }

  if (vorhandeneVersion < 5) {
    // Verleih-Felder für Stufe 0.4 (waren im Datenmodell von Anfang an
    // vorgesehen, jetzt über die Filmkarte direkt nutzbar).
    db.run('ALTER TABLE filme ADD COLUMN ausgeliehen_an TEXT')
    db.run('ALTER TABLE filme ADD COLUMN ausgeliehen_am TEXT')
  }

  if (vorhandeneVersion < 6) {
    // Fassung/Edition (z. B. "Director's Cut", "Steelbook", "Mediabook") -
    // war von Anfang an im Datenmodell vorgesehen, aber übersehen worden.
    // Bewusst reines Freitextfeld: Die Bezeichnungen bei Sonderfassungen
    // sind zu vielfältig für eine feste Auswahlliste. Wird best-effort von
    // der KI-Bilderkennung vorgeschlagen (falls auf der Hülle vermerkt),
    // bleibt aber wie alle anderen Felder frei editierbar.
    db.run('ALTER TABLE filme ADD COLUMN fassung TEXT')
  }

  if (vorhandeneVersion < 7) {
    // Unterscheidung Film/Serie plus Staffel-Angabe (Ausbaustufe 2): Beim
    // Erfassen fiel auf, dass neben Filmen auch Serien gesammelt werden,
    // die sich klar unterscheiden und danach filtern lassen sollen. Alle
    // bisherigen Datensätze erhalten automatisch den Standardwert "Film" -
    // das war bei ihnen tatsächlich auch der Fall.
    db.run("ALTER TABLE filme ADD COLUMN typ TEXT NOT NULL DEFAULT 'Film'")
    db.run('ALTER TABLE filme ADD COLUMN staffel TEXT')
  }

  if (vorhandeneVersion < 8) {
    // Frei definierbare Tags (Version 1.37) - Nutzer-Idee für flexible,
    // selbst definierte Film-Gruppen (z. B. "Lieblingsfilm", "Weihnachtsfilm",
    // "Gesehen"), ohne dafür einzelne feste Felder bauen zu müssen. Bewusst
    // ein einziges Freitextfeld statt einer eigenen Tags-Tabelle - der
    // Nutzer trennt mehrere Tags selbst per Komma, das Filtern durchsucht
    // das Feld einfach per Textvergleich (siehe Filterzustand/FilmListe.tsx).
    db.run('ALTER TABLE filme ADD COLUMN tags TEXT')
  }

  if (vorhandeneVersion === 0) {
    db.run('INSERT INTO schema_meta (version) VALUES (?)', [AKTUELLE_SCHEMA_VERSION])
  } else if (vorhandeneVersion < AKTUELLE_SCHEMA_VERSION) {
    db.run('UPDATE schema_meta SET version = ?', [AKTUELLE_SCHEMA_VERSION])
  }
}

async function neueDbOeffnen(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  const vorhandeneBytes = await ladeDatenbankBytes()
  const db = vorhandeneBytes ? new SQL.Database(vorhandeneBytes) : new SQL.Database()

  fuehreMigrationenAus(db)
  return db
}

// Öffnet die Datenbank (beim allerersten Aufruf) und liefert danach
// immer dieselbe, bereits geöffnete Instanz zurück.
export async function oeffneDatenbank(): Promise<Database> {
  if (dbInstanz) return dbInstanz
  if (!dbWirdGeoeffnet) {
    dbWirdGeoeffnet = neueDbOeffnen().then((db) => {
      dbInstanz = db
      return db
    })
  }
  return dbWirdGeoeffnet
}

// Schreibt den aktuellen Datenbankinhalt auf die Festplatte (OPFS).
// Muss nach jeder Änderung (Anlegen, Bearbeiten, Löschen) aufgerufen werden.
export async function sichereAenderungen(): Promise<void> {
  if (!dbInstanz) return
  const bytes = dbInstanz.export()
  await speichereDatenbankBytes(bytes)
}

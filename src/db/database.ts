import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

// Name der Datenbank-Datei im privaten Browser-Speicher (OPFS).
// OPFS ist ein Dateisystem, das nur diese Web-App selbst sehen kann -
// es liegt nicht im normalen Download-Ordner o.ä.
const DB_DATEINAME = 'filmsammlung.sqlite3'

// Einfache Schema-Versionierung: Jede neue Version fügt bei Bedarf
// weitere Spalten/Tabellen hinzu, ohne bestehende Daten zu verlieren.
const AKTUELLE_SCHEMA_VERSION = 1

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
  await schreibStrom.write(bytes)
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

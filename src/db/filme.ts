import type { Database } from 'sql.js'
import { oeffneDatenbank, sichereAenderungen } from './database'

export type Format = 'DVD' | 'Blu-ray' | '4K UHD' | 'Sonstiges'

export const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

// Unterscheidung Film/Serie (Ausbaustufe 2) - bewusst eine feste Auswahl
// (nicht Freitext wie bei "Fassung"), weil hier klar nur zwei Werte
// vorkommen und die Unterscheidung auch zum Filtern dienen soll.
export type Typ = 'Film' | 'Serie'

export const TYPEN: Typ[] = ['Film', 'Serie']

export interface Film {
  id: string
  titel: string
  format: Format
  fassung?: string
  // Nur bei typ === 'Serie' relevant, aber bewusst kein eigenes Feld auf
  // DB-Ebene erzwungen - bleibt bei Filmen einfach leer. Freitext statt
  // fester Auswahl, da Angaben wie "Staffel 1-3" oder "Staffel 2" zu
  // vielfältig für eine Liste sind (gleiches Prinzip wie bei "Fassung").
  typ: Typ
  staffel?: string
  fotoDateiname: string
  fotoRueckseiteDateiname?: string
  erfasstAm: string
  fsk?: string
  laufzeitMinuten?: number
  barcode?: string
  regisseur?: string
  darsteller?: string
  handlung?: string
  originaltitel?: string
  jahr?: number
  genre?: string
  produktionsland?: string
  sprache?: string
  imdbBewertung?: string
  ausgeliehenAn?: string
  ausgeliehenAm?: string
  // Für den OneDrive-Sync (Ausbaustufe 1, Version 1.16): "zuletztGeaendert"
  // entscheidet pro Film, welche Version (lokal oder aus der Cloud) beim
  // Zusammenführen gewinnt; "geloeschtAm" (bereits seit Version 0.1 als
  // Soft-Delete-Spalte in der Datenbank vorhanden) sorgt dafür, dass eine
  // Löschung auch auf Geräte übertragen wird, die zum Löschzeitpunkt
  // offline waren, statt dass der Film dort einfach wieder auftaucht.
  zuletztGeaendert: string
  geloeschtAm?: string
}

// Filter-/Suchzustand für Stufe 0.4. "omdbUnvollstaendig" braucht bewusst
// kein eigenes Datenbankfeld - Genre wird ausschließlich über OMDb befüllt,
// ein leeres Genre ist deshalb bereits ein zuverlässiger Hinweis darauf,
// dass die OMDb-Ergänzung für diesen Film noch fehlt oder keinen Treffer
// hatte (siehe Architekturkonzept, Abschnitt 2.3).
export interface Filterzustand {
  suche: string
  format: Format | ''
  fsk: string
  genre: string
  typ: Typ | ''
  ausgeliehenStatus: 'alle' | 'verliehen' | 'nicht_verliehen'
  omdbUnvollstaendig: boolean
}

// Leerer/Grundzustand des Filters - an einer einzigen Stelle definiert
// (statt z. B. doppelt in App.tsx und FilmListe.tsx), damit App.tsx (Startwert
// beim Laden) und der "Filter zurücksetzen"-Button in FilmListe.tsx (seit
// Version 1.29) garantiert denselben Zustand verwenden, ohne dass beide bei
// einer künftigen Änderung an Filterzustand einzeln nachgezogen werden müssen.
export const FILTER_STANDARD: Filterzustand = {
  suche: '',
  format: '',
  fsk: '',
  genre: '',
  typ: '',
  ausgeliehenStatus: 'alle',
  omdbUnvollstaendig: false,
}

interface FilmAnlegenEingabe {
  id: string
  titel: string
  format: Format
  fassung?: string
  typ: Typ
  staffel?: string
  fotoDateiname: string
  fotoRueckseiteDateiname?: string
  fsk?: string
  laufzeitMinuten?: number
  barcode?: string
  regisseur?: string
  darsteller?: string
  handlung?: string
  originaltitel?: string
  jahr?: number
  genre?: string
  produktionsland?: string
  sprache?: string
  imdbBewertung?: string
}

export async function filmAnlegen(eingabe: FilmAnlegenEingabe): Promise<Film> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  const film: Film = {
    id: eingabe.id,
    titel: eingabe.titel.trim(),
    format: eingabe.format,
    fassung: eingabe.fassung,
    typ: eingabe.typ,
    staffel: eingabe.staffel,
    fotoDateiname: eingabe.fotoDateiname,
    fotoRueckseiteDateiname: eingabe.fotoRueckseiteDateiname,
    erfasstAm: jetzt,
    zuletztGeaendert: jetzt,
    fsk: eingabe.fsk,
    laufzeitMinuten: eingabe.laufzeitMinuten,
    barcode: eingabe.barcode,
    regisseur: eingabe.regisseur,
    darsteller: eingabe.darsteller,
    handlung: eingabe.handlung,
    originaltitel: eingabe.originaltitel,
    jahr: eingabe.jahr,
    genre: eingabe.genre,
    produktionsland: eingabe.produktionsland,
    sprache: eingabe.sprache,
    imdbBewertung: eingabe.imdbBewertung,
  }

  db.run(
    `INSERT INTO filme (
       id, titel, format, fassung, foto_dateiname, foto_rueckseite_dateiname, erfasst_am, zuletzt_geaendert,
       fsk, laufzeit_minuten, barcode, regisseur, darsteller, handlung,
       originaltitel, jahr, genre, produktionsland, sprache, imdb_bewertung, typ, staffel
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      film.id,
      film.titel,
      film.format,
      film.fassung ?? null,
      film.fotoDateiname,
      film.fotoRueckseiteDateiname ?? null,
      film.erfasstAm,
      jetzt,
      film.fsk ?? null,
      film.laufzeitMinuten ?? null,
      film.barcode ?? null,
      film.regisseur ?? null,
      film.darsteller ?? null,
      film.handlung ?? null,
      film.originaltitel ?? null,
      film.jahr ?? null,
      film.genre ?? null,
      film.produktionsland ?? null,
      film.sprache ?? null,
      film.imdbBewertung ?? null,
      film.typ,
      film.staffel ?? null,
    ],
  )

  await sichereAenderungen()
  return film
}

export async function filmeLaden(): Promise<Film[]> {
  const db = await oeffneDatenbank()
  const ergebnis = db.exec(`
    SELECT id, titel, format, fassung, foto_dateiname, foto_rueckseite_dateiname, erfasst_am,
           fsk, laufzeit_minuten, barcode, regisseur, darsteller, handlung,
           originaltitel, jahr, genre, produktionsland, sprache, imdb_bewertung,
           ausgeliehen_an, ausgeliehen_am, zuletzt_geaendert, typ, staffel
    FROM filme
    WHERE geloescht_am IS NULL
    ORDER BY erfasst_am DESC
  `)

  if (ergebnis.length === 0) return []

  return ergebnis[0].values.map((zeile) => ({
    id: String(zeile[0]),
    titel: String(zeile[1]),
    format: zeile[2] as Format,
    fassung: zeile[3] !== null ? String(zeile[3]) : undefined,
    fotoDateiname: String(zeile[4]),
    fotoRueckseiteDateiname: zeile[5] !== null ? String(zeile[5]) : undefined,
    erfasstAm: String(zeile[6]),
    fsk: zeile[7] !== null ? String(zeile[7]) : undefined,
    laufzeitMinuten: zeile[8] !== null ? Number(zeile[8]) : undefined,
    barcode: zeile[9] !== null ? String(zeile[9]) : undefined,
    regisseur: zeile[10] !== null ? String(zeile[10]) : undefined,
    darsteller: zeile[11] !== null ? String(zeile[11]) : undefined,
    handlung: zeile[12] !== null ? String(zeile[12]) : undefined,
    originaltitel: zeile[13] !== null ? String(zeile[13]) : undefined,
    jahr: zeile[14] !== null ? Number(zeile[14]) : undefined,
    genre: zeile[15] !== null ? String(zeile[15]) : undefined,
    produktionsland: zeile[16] !== null ? String(zeile[16]) : undefined,
    sprache: zeile[17] !== null ? String(zeile[17]) : undefined,
    imdbBewertung: zeile[18] !== null ? String(zeile[18]) : undefined,
    ausgeliehenAn: zeile[19] !== null ? String(zeile[19]) : undefined,
    ausgeliehenAm: zeile[20] !== null ? String(zeile[20]) : undefined,
    zuletztGeaendert: String(zeile[21]),
    typ: zeile[22] as Typ,
    staffel: zeile[23] !== null ? String(zeile[23]) : undefined,
  }))
}

export interface FilmAktualisierenEingabe {
  id: string
  titel: string
  format: Format
  fassung?: string
  typ: Typ
  staffel?: string
  fotoDateiname: string
  fotoRueckseiteDateiname?: string
  fsk?: string
  laufzeitMinuten?: number
  barcode?: string
  regisseur?: string
  darsteller?: string
  handlung?: string
  originaltitel?: string
  jahr?: number
  genre?: string
  produktionsland?: string
  sprache?: string
  imdbBewertung?: string
}

// Aktualisiert die im Formular bearbeitbaren Felder eines bestehenden
// Films, inklusive der beiden Foto-Dateinamen (seit Version 1.13 können
// Fotos beim Bearbeiten ersetzt werden, z. B. durch ein Cover aus einer
// externen Quelle) - der Verleih-Status hat weiterhin eine eigene,
// schlankere Funktion (siehe filmVerleihStatusSetzen), damit ein schneller
// Verleihen/Zurückgeben-Klick in der Liste keinen kompletten
// Formular-Durchlauf braucht.
export async function filmAktualisieren(eingabe: FilmAktualisierenEingabe): Promise<void> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  db.run(
    `UPDATE filme SET
       titel = ?, format = ?, fassung = ?, foto_dateiname = ?, foto_rueckseite_dateiname = ?,
       fsk = ?, laufzeit_minuten = ?, barcode = ?,
       regisseur = ?, darsteller = ?, handlung = ?, originaltitel = ?, jahr = ?,
       genre = ?, produktionsland = ?, sprache = ?, imdb_bewertung = ?, typ = ?, staffel = ?, zuletzt_geaendert = ?
     WHERE id = ?`,
    [
      eingabe.titel.trim(),
      eingabe.format,
      eingabe.fassung ?? null,
      eingabe.fotoDateiname,
      eingabe.fotoRueckseiteDateiname ?? null,
      eingabe.fsk ?? null,
      eingabe.laufzeitMinuten ?? null,
      eingabe.barcode ?? null,
      eingabe.regisseur ?? null,
      eingabe.darsteller ?? null,
      eingabe.handlung ?? null,
      eingabe.originaltitel ?? null,
      eingabe.jahr ?? null,
      eingabe.genre ?? null,
      eingabe.produktionsland ?? null,
      eingabe.sprache ?? null,
      eingabe.imdbBewertung ?? null,
      eingabe.typ,
      eingabe.staffel ?? null,
      jetzt,
      eingabe.id,
    ],
  )

  await sichereAenderungen()
}

// Setzt oder löscht (bei undefined) den Verleih-Status eines Films,
// unabhängig von den übrigen Feldern.
export async function filmVerleihStatusSetzen(
  id: string,
  ausgeliehenAn: string | undefined,
  ausgeliehenAm: string | undefined,
): Promise<void> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  db.run('UPDATE filme SET ausgeliehen_an = ?, ausgeliehen_am = ?, zuletzt_geaendert = ? WHERE id = ?', [
    ausgeliehenAn?.trim() || null,
    ausgeliehenAm || null,
    jetzt,
    id,
  ])

  await sichereAenderungen()
}

// Markiert einen Film als gelöscht (Soft-Delete: der Datensatz bleibt in
// der Datenbank erhalten statt ihn zu entfernen, damit ein späterer
// Mehrgeräte-Sync in Ausbaustufe 1 die Löschung auf andere Geräte
// übertragen kann, siehe Architekturkonzept Abschnitt 3.3).
export async function filmLoeschen(id: string): Promise<void> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  db.run('UPDATE filme SET geloescht_am = ?, zuletzt_geaendert = ? WHERE id = ?', [jetzt, jetzt, id])

  await sichereAenderungen()
}

// Lädt ALLE Filme für den OneDrive-Sync (Ausbaustufe 1, Version 1.16) -
// anders als filmeLaden() bewusst INKLUSIVE der bereits gelöschten
// (geloescht_am gesetzt), damit eine Löschung als "Grabstein" mit auf
// andere Geräte übertragen werden kann, statt dass der Film dort beim
// nächsten Sync einfach wieder auftaucht (siehe Architekturkonzept,
// Abschnitt 3.3).
export async function filmeFuerSyncLaden(): Promise<Film[]> {
  const db = await oeffneDatenbank()
  const ergebnis = db.exec(`
    SELECT id, titel, format, fassung, foto_dateiname, foto_rueckseite_dateiname, erfasst_am,
           fsk, laufzeit_minuten, barcode, regisseur, darsteller, handlung,
           originaltitel, jahr, genre, produktionsland, sprache, imdb_bewertung,
           ausgeliehen_an, ausgeliehen_am, zuletzt_geaendert, geloescht_am, typ, staffel
    FROM filme
  `)

  if (ergebnis.length === 0) return []

  return ergebnis[0].values.map((zeile) => ({
    id: String(zeile[0]),
    titel: String(zeile[1]),
    format: zeile[2] as Format,
    fassung: zeile[3] !== null ? String(zeile[3]) : undefined,
    fotoDateiname: String(zeile[4]),
    fotoRueckseiteDateiname: zeile[5] !== null ? String(zeile[5]) : undefined,
    erfasstAm: String(zeile[6]),
    fsk: zeile[7] !== null ? String(zeile[7]) : undefined,
    laufzeitMinuten: zeile[8] !== null ? Number(zeile[8]) : undefined,
    barcode: zeile[9] !== null ? String(zeile[9]) : undefined,
    regisseur: zeile[10] !== null ? String(zeile[10]) : undefined,
    darsteller: zeile[11] !== null ? String(zeile[11]) : undefined,
    handlung: zeile[12] !== null ? String(zeile[12]) : undefined,
    originaltitel: zeile[13] !== null ? String(zeile[13]) : undefined,
    jahr: zeile[14] !== null ? Number(zeile[14]) : undefined,
    genre: zeile[15] !== null ? String(zeile[15]) : undefined,
    produktionsland: zeile[16] !== null ? String(zeile[16]) : undefined,
    sprache: zeile[17] !== null ? String(zeile[17]) : undefined,
    imdbBewertung: zeile[18] !== null ? String(zeile[18]) : undefined,
    ausgeliehenAn: zeile[19] !== null ? String(zeile[19]) : undefined,
    ausgeliehenAm: zeile[20] !== null ? String(zeile[20]) : undefined,
    zuletztGeaendert: String(zeile[21]),
    geloeschtAm: zeile[22] !== null ? String(zeile[22]) : undefined,
    typ: zeile[23] as Typ,
    staffel: zeile[24] !== null ? String(zeile[24]) : undefined,
  }))
}

// Schreibt einen Film unverändert (roh) in die Datenbank - im Unterschied
// zu filmAnlegen()/filmAktualisieren() OHNE die Werte für "erfasstAm" oder
// "zuletztGeaendert" auf "jetzt" zu setzen, weil beim Sync ja genau die
// vom anderen Gerät stammenden Zeitstempel übernommen werden sollen, nicht
// der Zeitpunkt des Sync-Vorgangs selbst. "ON CONFLICT" sorgt dafür, dass
// ein bereits lokal vorhandener Film (gleiche id) überschrieben statt ein
// Duplikat angelegt wird.
function filmUpsertRoh(db: Database, film: Film): void {
  db.run(
    `INSERT INTO filme (
       id, titel, format, fassung, foto_dateiname, foto_rueckseite_dateiname, erfasst_am,
       fsk, laufzeit_minuten, barcode, regisseur, darsteller, handlung,
       originaltitel, jahr, genre, produktionsland, sprache, imdb_bewertung,
       ausgeliehen_an, ausgeliehen_am, zuletzt_geaendert, geloescht_am, typ, staffel
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       titel = excluded.titel, format = excluded.format, fassung = excluded.fassung,
       foto_dateiname = excluded.foto_dateiname, foto_rueckseite_dateiname = excluded.foto_rueckseite_dateiname,
       fsk = excluded.fsk, laufzeit_minuten = excluded.laufzeit_minuten, barcode = excluded.barcode,
       regisseur = excluded.regisseur, darsteller = excluded.darsteller, handlung = excluded.handlung,
       originaltitel = excluded.originaltitel, jahr = excluded.jahr, genre = excluded.genre,
       produktionsland = excluded.produktionsland, sprache = excluded.sprache, imdb_bewertung = excluded.imdb_bewertung,
       ausgeliehen_an = excluded.ausgeliehen_an, ausgeliehen_am = excluded.ausgeliehen_am,
       zuletzt_geaendert = excluded.zuletzt_geaendert, geloescht_am = excluded.geloescht_am,
       typ = excluded.typ, staffel = excluded.staffel`,
    [
      film.id,
      film.titel,
      film.format,
      film.fassung ?? null,
      film.fotoDateiname,
      film.fotoRueckseiteDateiname ?? null,
      film.erfasstAm,
      film.fsk ?? null,
      film.laufzeitMinuten ?? null,
      film.barcode ?? null,
      film.regisseur ?? null,
      film.darsteller ?? null,
      film.handlung ?? null,
      film.originaltitel ?? null,
      film.jahr ?? null,
      film.genre ?? null,
      film.produktionsland ?? null,
      film.sprache ?? null,
      film.imdbBewertung ?? null,
      film.ausgeliehenAn ?? null,
      film.ausgeliehenAm ?? null,
      film.zuletztGeaendert,
      film.geloeschtAm ?? null,
      film.typ,
      film.staffel ?? null,
    ],
  )
}

// Schreibt eine ganze Liste von Filmen roh in die Datenbank (siehe
// filmUpsertRoh) und speichert danach EINMAL gesammelt - beim Sync
// mehrerer Filme spart das gegenüber einem Speichervorgang pro Film
// unnötige Schreibzugriffe auf die OPFS-Datei.
export async function filmeSyncStapelSchreiben(filme: Film[]): Promise<void> {
  const db = await oeffneDatenbank()
  for (const film of filme) {
    filmUpsertRoh(db, film)
  }
  await sichereAenderungen()
}

// Ersetzt die GESAMTE lokale Sammlung durch den Inhalt einer Sicherungsdatei
// (Ausbaustufe 4, Wiederherstellung aus der ZIP-Datensicherung). Anders als
// filmeSyncStapelSchreiben() (die einzelne Datensätze anhand ihres
// Zeitstempels mit dem lokalen Bestand ZUSAMMENFÜHRT) werden hier zunächst
// ALLE bestehenden Zeilen entfernt - bewusst so, weil diese Funktion für den
// Ernstfall gedacht ist (Totalverlust oder Beschädigung der lokalen
// Datenbank): Eine intelligente Zusammenführung würde sich auf die
// Zeitstempel der ggf. gerade beschädigten lokalen Daten verlassen, was
// genau im Fehlerfall trügerisch sein kann.
//
// "erfasstAm" jedes Films wird unverändert aus der Sicherung übernommen -
// das ist der Zeitpunkt der ursprünglichen Erfassung und u. a. Grundlage für
// die Sortierung (siehe FilmListe.tsx), der darf sich durch eine
// Wiederherstellung nicht ändern. "zuletztGeaendert" wird dagegen bewusst
// auf den Zeitpunkt der Wiederherstellung gesetzt, ein rein technisches
// Feld ausschließlich für den OneDrive-Sync: Nur so gilt der wiederhergestellte
// Stand beim nächsten Sync zuverlässig als der NEUESTE und überschreibt
// einen möglicherweise ebenfalls fehlerhaften OneDrive-Stand, statt selbst
// wieder von dort überschrieben zu werden.
export async function filmeAusSicherungWiederherstellen(filme: Film[]): Promise<void> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  db.run('DELETE FROM filme')
  for (const film of filme) {
    filmUpsertRoh(db, { ...film, zuletztGeaendert: jetzt })
  }

  await sichereAenderungen()
}

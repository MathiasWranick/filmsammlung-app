import { oeffneDatenbank, sichereAenderungen } from './database'

export type Format = 'DVD' | 'Blu-ray' | '4K UHD' | 'Sonstiges'

export const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

export interface Film {
  id: string
  titel: string
  format: Format
  fassung?: string
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
  ausgeliehenStatus: 'alle' | 'verliehen' | 'nicht_verliehen'
  omdbUnvollstaendig: boolean
}

interface FilmAnlegenEingabe {
  id: string
  titel: string
  format: Format
  fassung?: string
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
    fotoDateiname: eingabe.fotoDateiname,
    fotoRueckseiteDateiname: eingabe.fotoRueckseiteDateiname,
    erfasstAm: jetzt,
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
       originaltitel, jahr, genre, produktionsland, sprache, imdb_bewertung
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
           ausgeliehen_an, ausgeliehen_am
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
  }))
}

export interface FilmAktualisierenEingabe {
  id: string
  titel: string
  format: Format
  fassung?: string
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
       genre = ?, produktionsland = ?, sprache = ?, imdb_bewertung = ?, zuletzt_geaendert = ?
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

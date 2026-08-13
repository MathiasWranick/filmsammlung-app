import { oeffneDatenbank, sichereAenderungen } from './database'

export type Format = 'DVD' | 'Blu-ray' | '4K UHD' | 'Sonstiges'

export interface Film {
  id: string
  titel: string
  format: Format
  fotoDateiname: string
  erfasstAm: string
}

interface FilmAnlegenEingabe {
  id: string
  titel: string
  format: Format
  fotoDateiname: string
}

export async function filmAnlegen(eingabe: FilmAnlegenEingabe): Promise<Film> {
  const db = await oeffneDatenbank()
  const jetzt = new Date().toISOString()

  const film: Film = {
    id: eingabe.id,
    titel: eingabe.titel.trim(),
    format: eingabe.format,
    fotoDateiname: eingabe.fotoDateiname,
    erfasstAm: jetzt,
  }

  db.run(
    `INSERT INTO filme (id, titel, format, foto_dateiname, erfasst_am, zuletzt_geaendert)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [film.id, film.titel, film.format, film.fotoDateiname, film.erfasstAm, jetzt],
  )

  await sichereAenderungen()
  return film
}

export async function filmeLaden(): Promise<Film[]> {
  const db = await oeffneDatenbank()
  const ergebnis = db.exec(`
    SELECT id, titel, format, foto_dateiname, erfasst_am
    FROM filme
    WHERE geloescht_am IS NULL
    ORDER BY erfasst_am DESC
  `)

  if (ergebnis.length === 0) return []

  return ergebnis[0].values.map((zeile) => ({
    id: String(zeile[0]),
    titel: String(zeile[1]),
    format: zeile[2] as Format,
    fotoDateiname: String(zeile[3]),
    erfasstAm: String(zeile[4]),
  }))
}

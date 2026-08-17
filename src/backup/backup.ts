// Datensicherung als ZIP-Datei mit den Filmdaten (CSV + JSON) und allen
// Fotos - unabhängig vom OneDrive-Sync (Ausbaustufe 2, Version 1.18). Ziel:
// auch bei einem kompletten Verlust der OneDrive-Daten den zuletzt
// gesicherten Stand wiederherstellen zu können. Die Wiederherstellung
// (Import, seit Ausbaustufe 4) nutzt dafür gezielt die JSON-Datei aus der
// ZIP - sie entspricht 1:1 dem internen Film-Typ und lässt sich dadurch
// ohne Formatumbau/Rateraten wieder einlesen (im Unterschied zur CSV, die
// in erster Linie für die Ansicht/Bearbeitung in Excel gedacht ist).

import JSZip from 'jszip'
import { filmeAusSicherungWiederherstellen, filmeLaden, type Film } from '../db/filme'
import { fotoAlsDateiLaden, fotoRohSpeichern } from '../db/fotos'

// Spaltenreihenfolge und -beschriftung für die CSV-Datei. Die ID ist mit
// dabei, obwohl sie im Formular nirgends sichtbar ist - sie ist die
// eindeutige Verknüpfung zu den Foto-Dateinamen und wichtig für einen
// späteren Import.
const CSV_SPALTEN: { titel: string; wert: (film: Film) => string }[] = [
  { titel: 'ID', wert: (f) => f.id },
  { titel: 'Titel', wert: (f) => f.titel },
  { titel: 'Format', wert: (f) => f.format },
  { titel: 'Fassung', wert: (f) => f.fassung ?? '' },
  { titel: 'Typ', wert: (f) => f.typ },
  { titel: 'Staffel', wert: (f) => f.staffel ?? '' },
  { titel: 'FSK', wert: (f) => f.fsk ?? '' },
  { titel: 'Laufzeit (Minuten)', wert: (f) => (f.laufzeitMinuten !== undefined ? String(f.laufzeitMinuten) : '') },
  { titel: 'Regisseur', wert: (f) => f.regisseur ?? '' },
  { titel: 'Darsteller', wert: (f) => f.darsteller ?? '' },
  { titel: 'Handlung', wert: (f) => f.handlung ?? '' },
  { titel: 'Originaltitel', wert: (f) => f.originaltitel ?? '' },
  { titel: 'Jahr', wert: (f) => (f.jahr !== undefined ? String(f.jahr) : '') },
  { titel: 'Genre', wert: (f) => f.genre ?? '' },
  { titel: 'Produktionsland', wert: (f) => f.produktionsland ?? '' },
  { titel: 'Sprache', wert: (f) => f.sprache ?? '' },
  { titel: 'IMDb-Bewertung', wert: (f) => f.imdbBewertung ?? '' },
  { titel: 'Barcode', wert: (f) => f.barcode ?? '' },
  { titel: 'Ausgeliehen an', wert: (f) => f.ausgeliehenAn ?? '' },
  { titel: 'Ausgeliehen am', wert: (f) => f.ausgeliehenAm ?? '' },
  { titel: 'Erfasst am', wert: (f) => f.erfasstAm },
  { titel: 'Zuletzt geändert', wert: (f) => f.zuletztGeaendert },
  { titel: 'Foto Vorderseite', wert: (f) => f.fotoDateiname },
  { titel: 'Foto Rückseite', wert: (f) => f.fotoRueckseiteDateiname ?? '' },
]

// Ein CSV-Feld muss in Anführungszeichen gesetzt werden, sobald es ein
// Komma, Anführungszeichen oder einen Zeilenumbruch enthält (z. B. die
// Handlung) - enthaltene Anführungszeichen werden dabei verdoppelt, wie im
// CSV-Format (RFC 4180) üblich, damit die Datei sich in Excel & Co.
// korrekt öffnen lässt.
function csvFeld(wert: string): string {
  if (wert.includes(',') || wert.includes('"') || wert.includes('\n')) {
    return `"${wert.replace(/"/g, '""')}"`
  }
  return wert
}

function csvErzeugen(filme: Film[]): string {
  const kopfzeile = CSV_SPALTEN.map((spalte) => csvFeld(spalte.titel)).join(',')
  const zeilen = filme.map((film) => CSV_SPALTEN.map((spalte) => csvFeld(spalte.wert(film))).join(','))
  // BOM (Byte Order Mark) am Anfang, damit Excel die Datei zuverlässig als
  // UTF-8 erkennt und Umlaute (ä, ö, ü) korrekt anzeigt statt sie zu
  // verstümmeln - ein bekanntes Excel-Spezifikum, harmlos für alle anderen
  // Programme.
  return '﻿' + [kopfzeile, ...zeilen].join('\r\n')
}

function jsonErzeugen(filme: Film[]): string {
  return JSON.stringify(filme, null, 2)
}

function datumFuerDateiname(): string {
  const jetzt = new Date()
  const zweistellig = (zahl: number) => String(zahl).padStart(2, '0')
  return `${jetzt.getFullYear()}-${zweistellig(jetzt.getMonth() + 1)}-${zweistellig(jetzt.getDate())}`
}

export interface SicherungsErgebnis {
  anzahlFilme: number
  anzahlFotos: number
  dateiname: string
}

// Erstellt die Sicherung (Filmdaten als CSV + JSON, alle Fotos im
// Unterordner "fotos/") und löst direkt den Browser-Download aus - über
// einen kurzzeitig erzeugten, unsichtbaren Download-Link, das gängige
// Muster für clientseitig erzeugte Dateien ohne eigenen Server.
export async function sicherungHerunterladen(): Promise<SicherungsErgebnis> {
  const filme = await filmeLaden()

  const zip = new JSZip()
  zip.file('filme.csv', csvErzeugen(filme), { compression: 'DEFLATE' })
  zip.file('filme.json', jsonErzeugen(filme), { compression: 'DEFLATE' })

  const fotoOrdner = zip.folder('fotos')
  const fotoDateinamen = new Set<string>()
  for (const film of filme) {
    if (film.fotoDateiname) fotoDateinamen.add(film.fotoDateiname)
    if (film.fotoRueckseiteDateiname) fotoDateinamen.add(film.fotoRueckseiteDateiname)
  }

  for (const dateiname of fotoDateinamen) {
    try {
      const datei = await fotoAlsDateiLaden(dateiname)
      // Fotos sind bereits als JPEG/PNG komprimiert - erneutes Komprimieren
      // (DEFLATE) würde kaum etwas sparen, aber unnötig Rechenzeit kosten.
      fotoOrdner?.file(dateiname, datei, { compression: 'STORE' })
    } catch (fehlerObjekt) {
      // Ein einzelnes fehlendes Foto soll die gesamte Sicherung nicht
      // abbrechen (z. B. falls ein Datensatz aus einem OneDrive-Sync
      // stammt, dessen Foto lokal noch nicht heruntergeladen wurde).
      console.error(`Foto "${dateiname}" konnte nicht gesichert werden:`, fehlerObjekt)
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const dateiname = `filmsammlung-sicherung-${datumFuerDateiname()}.zip`

  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  return { anzahlFilme: filme.length, anzahlFotos: fotoDateinamen.size, dateiname }
}

export interface WiederherstellungsErgebnis {
  anzahlFilme: number
  anzahlFotosWiederhergestellt: number
  anzahlFotosFehlend: number
}

// Prüft nur die für den Betrieb der App unverzichtbaren Felder - reicht, um
// eine offensichtlich falsche/fremde Datei zurückzuweisen, ohne bei jedem
// kleinen Formatdetail pedantisch zu sein. Erkennt nebenbei auch eine
// Sicherung aus einer sehr alten App-Version (vor "Typ" in Version 1.19)
// als nicht unterstützt, statt sie unvollständig zu importieren.
function istGueltigerFilm(wert: unknown): wert is Film {
  if (!wert || typeof wert !== 'object') return false
  const f = wert as Record<string, unknown>
  return (
    typeof f.id === 'string' &&
    typeof f.titel === 'string' &&
    typeof f.format === 'string' &&
    typeof f.typ === 'string' &&
    typeof f.fotoDateiname === 'string' &&
    typeof f.erfasstAm === 'string' &&
    typeof f.zuletztGeaendert === 'string'
  )
}

// Liest eine zuvor über sicherungHerunterladen() erzeugte ZIP-Datei ein und
// ersetzt damit die komplette lokale Sammlung (siehe
// filmeAusSicherungWiederherstellen in db/filme.ts für die Begründung,
// warum bewusst ersetzt statt mit dem lokalen Bestand zusammengeführt
// wird). Fehlende einzelne Fotos brechen die Wiederherstellung nicht ab
// (spiegelbildlich zu sicherungHerunterladen) - der betroffene Film bleibt
// dann eben vorerst ohne dieses Foto.
export async function sicherungWiederherstellen(zipDatei: File): Promise<WiederherstellungsErgebnis> {
  const zip = await JSZip.loadAsync(zipDatei)

  const jsonEintrag = zip.file('filme.json')
  if (!jsonEintrag) {
    throw new Error('Die Datei enthält keine "filme.json" - ist das wirklich eine Filmsammlung-Sicherung?')
  }

  const geparst: unknown = JSON.parse(await jsonEintrag.async('string'))
  if (!Array.isArray(geparst) || !geparst.every(istGueltigerFilm)) {
    throw new Error('Der Inhalt der Sicherungsdatei hat nicht das erwartete Format.')
  }
  const filme = geparst as Film[]

  let anzahlFotosWiederhergestellt = 0
  let anzahlFotosFehlend = 0
  const fotoDateinamen = new Set<string>()
  for (const film of filme) {
    if (film.fotoDateiname) fotoDateinamen.add(film.fotoDateiname)
    if (film.fotoRueckseiteDateiname) fotoDateinamen.add(film.fotoRueckseiteDateiname)
  }

  for (const dateiname of fotoDateinamen) {
    const fotoEintrag = zip.file(`fotos/${dateiname}`)
    if (!fotoEintrag) {
      // Fehlte schon in der Sicherung selbst (z. B. weil damals ein Sync
      // noch ausstand, siehe sicherungHerunterladen) - kann hier nicht
      // nachgeholt werden.
      anzahlFotosFehlend += 1
      continue
    }
    try {
      const blob = await fotoEintrag.async('blob')
      await fotoRohSpeichern(dateiname, blob)
      anzahlFotosWiederhergestellt += 1
    } catch (fehlerObjekt) {
      console.error(`Foto "${dateiname}" konnte nicht wiederhergestellt werden:`, fehlerObjekt)
      anzahlFotosFehlend += 1
    }
  }

  await filmeAusSicherungWiederherstellen(filme)

  return { anzahlFilme: filme.length, anzahlFotosWiederhergestellt, anzahlFotosFehlend }
}

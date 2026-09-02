// Ermittelt den tatsächlichen Foto-Speicherbedarf in OneDrive und räumt bei
// Bedarf nicht mehr referenzierte ("verwaiste") Fotos auf (Version 1.51).
//
// Zwei Anlässe dafür: Erstens die seit Version 1.16 bewusst akzeptierte,
// bislang nie behobene Einschränkung, dass beim Ersetzen eines Fotos die
// alte Datei in OneDrive liegen bleibt (lokal wird sie dagegen aufgeräumt,
// siehe fotoLoeschen in db/fotos.ts). Zweitens die neue Bestands-
// Verkleinerung (siehe fotosVerkleinern.ts), die auf einen Schlag für einen
// Großteil der Sammlung ein neues, kleineres Foto anlegt - und damit ebenso
// viele veraltete, nun verwaiste Originale in OneDrive hinterlässt.
//
// Die Prüfung selbst ist rein lesend. Ob tatsächlich gelöscht wird,
// entscheidet der Nutzer bewusst separat (siehe Speicherwartung.tsx) - erst
// nachdem er die Übersicht (Anzahl/Größe) gesehen hat.

import { filmeFuerSyncLaden } from '../db/filme'
import { fotosOrdnerAuflisten, fotoInOneDriveLoeschen } from '../sync/graph'

export interface OneDriveUebersicht {
  anzahlReferenziert: number
  groesseReferenziertBytes: number
  verwaisteDateien: string[]
  groesseVerwaistBytes: number
}

// Baut die Menge aller Dateinamen, die aktuell noch von einem Film
// referenziert werden. filmeFuerSyncLaden() liefert bewusst AUCH bereits
// gelöschte Filme (als "Grabstein", siehe Kommentar dort) - deren Fotos
// zählen hier absichtlich NICHT mehr als referenziert, sie sind ja nicht
// mehr sichtbar und dürfen mit aufgeräumt werden. Die lokale Miniatur-
// Ansicht (siehe fotoMiniaturDateiname in db/fotos.ts) wird nie nach
// OneDrive hochgeladen (rein lokale, je Gerät eigenständig erzeugte
// Optimierung, siehe fotoMiniaturLaden) und taucht deshalb hier bewusst gar
// nicht erst auf.
async function referenzierteDateinamen(): Promise<Set<string>> {
  const filme = await filmeFuerSyncLaden()
  const referenziert = new Set<string>()
  for (const film of filme) {
    if (film.geloeschtAm) continue
    if (film.fotoDateiname) referenziert.add(film.fotoDateiname)
    if (film.fotoRueckseiteDateiname) referenziert.add(film.fotoRueckseiteDateiname)
  }
  return referenziert
}

// Vergleicht den tatsächlichen OneDrive-Ordnerinhalt mit den aktuell
// referenzierten Dateinamen und liefert eine Übersicht - u. a. die Größe
// der referenzierten Fotos (das ist genau die Datenmenge, die ein Gerät
// beim allerersten Sync/Wiederherstellen aus OneDrive herunterladen müsste)
// sowie Liste und Größe der verwaisten, nicht mehr referenzierten Dateien.
export async function oneDriveSpeicherPruefen(): Promise<OneDriveUebersicht> {
  const [referenziert, dateien] = await Promise.all([referenzierteDateinamen(), fotosOrdnerAuflisten()])

  let anzahlReferenziert = 0
  let groesseReferenziertBytes = 0
  const verwaisteDateien: string[] = []
  let groesseVerwaistBytes = 0

  for (const datei of dateien) {
    if (referenziert.has(datei.name)) {
      anzahlReferenziert += 1
      groesseReferenziertBytes += datei.groesseBytes
    } else {
      verwaisteDateien.push(datei.name)
      groesseVerwaistBytes += datei.groesseBytes
    }
  }

  return { anzahlReferenziert, groesseReferenziertBytes, verwaisteDateien, groesseVerwaistBytes }
}

export interface AufraeumErgebnis {
  anzahlGeloescht: number
  anzahlFehlgeschlagen: number
}

// Löscht die übergebenen, zuvor per oneDriveSpeicherPruefen() ermittelten
// verwaisten Dateien tatsächlich - bewusst ein separater, explizit
// aufzurufender Schritt statt Teil der Prüfung, damit in der Oberfläche
// immer erst die Übersicht gezeigt und bestätigt werden kann, bevor
// irgendetwas gelöscht wird. Eine einzelne fehlgeschlagene Löschung bricht
// den Durchlauf nicht ab (gleiches Prinzip wie bei der Bestands-
// Verkleinerung und der Datensicherung).
export async function verwaisteOneDriveFotosLoeschen(dateinamen: string[]): Promise<AufraeumErgebnis> {
  let anzahlGeloescht = 0
  let anzahlFehlgeschlagen = 0

  for (const dateiname of dateinamen) {
    try {
      await fotoInOneDriveLoeschen(dateiname)
      anzahlGeloescht += 1
    } catch (fehlerObjekt) {
      console.error(`"${dateiname}" konnte in OneDrive nicht gelöscht werden:`, fehlerObjekt)
      anzahlFehlgeschlagen += 1
    }
  }

  return { anzahlGeloescht, anzahlFehlgeschlagen }
}

// Fotos werden bewusst NICHT in der SQLite-Datenbank gespeichert, sondern
// als eigene Dateien im privaten Browser-Speicher (OPFS). Das hält die
// Datenbank klein und schnell, auch bei einer großen Sammlung.

import { bildVerkleinern } from '../bild/verkleinern'
import { protokolliertSchreiben } from './speicherDiagnose'

export type FotoSeite = 'vorderseite' | 'rueckseite'

// Lange Kante der kleinen Miniaturansicht (siehe fotoMiniaturSpeichern
// unten) - bewusst deutlich kleiner als die reguläre Anzeigegröße, weil sie
// ausschließlich für die kompakte Kachel in der Filmliste gedacht ist.
const MINIATUR_MAX_KANTE = 400

async function fotosOrdner(): Promise<FileSystemDirectoryHandle> {
  const wurzel = await navigator.storage.getDirectory()
  return wurzel.getDirectoryHandle('fotos', { create: true })
}

function dateiEndung(datei: File): string {
  const teile = datei.name.split('.')
  return teile.length > 1 ? teile[teile.length - 1] : 'jpg'
}

// Speichert ein Foto (Vorder- oder Rückseite) unter einem Dateinamen, der
// auf die technische ID des Films, die Seite und einen Zeitstempel verweist,
// und gibt diesen Dateinamen zum Ablegen in der Datenbank zurück. Der
// Zeitstempel sorgt dafür, dass beim späteren Ersetzen eines Fotos (z. B.
// beim Bearbeiten mit einem Cover aus einer externen Quelle) garantiert ein
// neuer Dateiname entsteht - nur so bemerkt die Filmliste zuverlässig, dass
// sich das Foto geändert hat und lädt es neu, statt eine ggf. bereits im
// Browser zwischengespeicherte alte Version weiter anzuzeigen.
export async function fotoSpeichern(filmId: string, seite: FotoSeite, datei: File): Promise<string> {
  const dateiname = `${filmId}-${seite}-${Date.now()}.${dateiEndung(datei)}`
  await protokolliertSchreiben(`Foto speichern (${dateiname}, ${datei.size} Byte)`, async () => {
    const ordner = await fotosOrdner()
    const dateiHandle = await ordner.getFileHandle(dateiname, { create: true })
    const schreibStrom = await dateiHandle.createWritable()
    await schreibStrom.write(datei)
    await schreibStrom.close()
  })
  return dateiname
}

// Lädt ein gespeichertes Foto und liefert eine im Browser anzeigbare
// Adresse dafür zurück (mit URL.revokeObjectURL wieder freigeben, sobald
// sie nicht mehr gebraucht wird).
export async function fotoLaden(dateiname: string): Promise<string> {
  const ordner = await fotosOrdner()
  const dateiHandle = await ordner.getFileHandle(dateiname)
  const datei = await dateiHandle.getFile()
  return URL.createObjectURL(datei)
}

// Löscht ein gespeichertes Foto, z. B. die alte Version nach dem Ersetzen
// durch ein neues Cover. Fehlt die Datei bereits (aus welchem Grund auch
// immer), ist das kein Problem - dann gibt es einfach nichts zu löschen.
export async function fotoLoeschen(dateiname: string): Promise<void> {
  try {
    const ordner = await fotosOrdner()
    await ordner.removeEntry(dateiname)
  } catch {
    // Datei existierte nicht (mehr) - nichts zu tun.
  }
}

// Leitet aus dem Dateinamen des vollständigen Fotos den Dateinamen der
// zugehörigen Miniaturansicht ab (Version 1.36, siehe fotoMiniaturSpeichern
// unten). Bewusst ohne eigenes Feld in der Datenbank/im Sync-Datensatz -
// der Name lässt sich aus dem ohnehin vorhandenen fotoDateiname ableiten,
// das spart eine Datenbankänderung samt Migration.
export function fotoMiniaturDateiname(fotoDateiname: string): string {
  return fotoDateiname.replace(/(\.[^./]+)$/, '-miniatur$1')
}

// Erzeugt zusätzlich zum vollständigen Foto eine kleine Miniaturansicht und
// speichert sie unter dem davon abgeleiteten Dateinamen. Wird nur für das
// Vorderseiten-Foto aufgerufen, da nur dieses als Kachel in der Filmliste
// angezeigt wird (siehe FilmListe.tsx) - für die Rückseite und die
// Detailansicht/Bearbeitung wird weiterhin das vollständige Foto geladen.
export async function fotoMiniaturSpeichern(fotoDateiname: string, datei: File): Promise<void> {
  const miniatur = await bildVerkleinern(datei, MINIATUR_MAX_KANTE, 0.75)
  const miniaturDateiname = fotoMiniaturDateiname(fotoDateiname)
  await protokolliertSchreiben(`Miniaturansicht speichern (${miniaturDateiname}, ${miniatur.size} Byte)`, async () => {
    const ordner = await fotosOrdner()
    const dateiHandle = await ordner.getFileHandle(miniaturDateiname, { create: true })
    const schreibStrom = await dateiHandle.createWritable()
    await schreibStrom.write(miniatur)
    await schreibStrom.close()
  })
}

// Lädt bevorzugt die kleine Miniaturansicht eines Fotos (für die Kachel in
// der Filmliste). Existiert sie (noch) nicht - z. B. bei Fotos aus einer
// Version vor 1.36, oder weil sie per OneDrive-Sync von einem anderen Gerät
// übernommen wurde, das die Miniatur nicht mit hochgeladen hat (siehe
// Architekturkonzept, Changelog 1.36) -, wird automatisch auf das
// vollständige Foto ausgewichen. Damit funktioniert die Filmliste in jedem
// Fall korrekt, auch wenn die Miniatur (noch) fehlt.
export async function fotoMiniaturLaden(fotoDateiname: string): Promise<string> {
  try {
    return await fotoLaden(fotoMiniaturDateiname(fotoDateiname))
  } catch {
    return await fotoLaden(fotoDateiname)
  }
}

// Löscht ein vollständiges Foto zusammen mit seiner Miniaturansicht (falls
// vorhanden) - z. B. wenn beim Bearbeiten das Vorderseiten-Foto durch ein
// neues ersetzt wird. fotoLoeschen ist bereits tolerant gegenüber fehlenden
// Dateien, ein Aufruf für eine (noch) nicht existierende Miniatur ist daher
// unproblematisch.
export async function fotoMitMiniaturLoeschen(fotoDateiname: string): Promise<void> {
  await fotoLoeschen(fotoDateiname)
  await fotoLoeschen(fotoMiniaturDateiname(fotoDateiname))
}

// Lädt ein gespeichertes Foto als rohe Datei (nicht als anzeigbare Adresse
// wie fotoLaden) - wird beim OneDrive-Sync gebraucht, um die Bilddaten
// unverändert zu Microsoft Graph hochzuladen.
export async function fotoAlsDateiLaden(dateiname: string): Promise<File> {
  const ordner = await fotosOrdner()
  const dateiHandle = await ordner.getFileHandle(dateiname)
  return dateiHandle.getFile()
}

// Prüft nur, ob ein Foto lokal vorhanden ist, ohne es zu laden - genügt
// beim Sync, um zu entscheiden, ob ein von einem anderen Gerät bekanntes
// Foto überhaupt erst heruntergeladen werden muss (siehe fotoExistiertLokal
// in graph.ts für die entsprechende Prüfung auf der OneDrive-Seite).
export async function fotoExistiertLokal(dateiname: string): Promise<boolean> {
  try {
    const ordner = await fotosOrdner()
    await ordner.getFileHandle(dateiname)
    return true
  } catch {
    return false
  }
}

// Speichert vom OneDrive-Sync heruntergeladene Bilddaten unverändert unter
// dem übergebenen (vom anderen Gerät stammenden) Dateinamen - im
// Unterschied zu fotoSpeichern() wird hier bewusst KEIN neuer Dateiname mit
// eigenem Zeitstempel erzeugt, weil der Dateiname ja schon eindeutig ist
// und unverändert in der Datenbank verlinkt werden muss.
export async function fotoRohSpeichern(dateiname: string, daten: Blob): Promise<void> {
  await protokolliertSchreiben(`Sync - Foto vom OneDrive übernehmen (${dateiname}, ${daten.size} Byte)`, async () => {
    const ordner = await fotosOrdner()
    const dateiHandle = await ordner.getFileHandle(dateiname, { create: true })
    const schreibStrom = await dateiHandle.createWritable()
    await schreibStrom.write(daten)
    await schreibStrom.close()
  })
}

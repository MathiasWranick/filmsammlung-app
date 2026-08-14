// Fotos werden bewusst NICHT in der SQLite-Datenbank gespeichert, sondern
// als eigene Dateien im privaten Browser-Speicher (OPFS). Das hält die
// Datenbank klein und schnell, auch bei einer großen Sammlung.

export type FotoSeite = 'vorderseite' | 'rueckseite'

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
  const ordner = await fotosOrdner()
  const dateiHandle = await ordner.getFileHandle(dateiname, { create: true })
  const schreibStrom = await dateiHandle.createWritable()
  await schreibStrom.write(datei)
  await schreibStrom.close()
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
  const ordner = await fotosOrdner()
  const dateiHandle = await ordner.getFileHandle(dateiname, { create: true })
  const schreibStrom = await dateiHandle.createWritable()
  await schreibStrom.write(daten)
  await schreibStrom.close()
}

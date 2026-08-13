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
// auf die technische ID des Films und die Seite verweist, und gibt diesen
// Dateinamen zum Ablegen in der Datenbank zurück.
export async function fotoSpeichern(filmId: string, seite: FotoSeite, datei: File): Promise<string> {
  const dateiname = `${filmId}-${seite}.${dateiEndung(datei)}`
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

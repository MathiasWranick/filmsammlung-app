// Verkleinert ein Foto client-seitig per <canvas>, bevor es weiterverwendet
// wird (Version 1.36). Hintergrund: Moderne Handykameras liefern - vor
// allem bei Nutzung des Zooms - sehr große Fotos (teils mehrere zehn
// Megapixel, mehrere MB pro Datei). Das kostet nicht nur unnötig
// Speicherplatz und Sync-Datenvolumen, sondern hält auch viel Arbeitsspeicher
// belegt, solange die Seite geöffnet ist. Das kann so weit gehen, dass
// Android den im Hintergrund liegenden Browser-Tab beendet, wenn die native
// Kamera-App selbst gerade viel Speicher braucht - beim Zurückkehren wirkt
// die App dann wie neu gestartet, inklusive Verlust des gerade geöffneten
// "Film hinzufügen"-Formulars (siehe Architekturkonzept, Changelog 1.36).
// Für Bildschirmanzeige, KI-Erkennung und OMDb-Abgleich reicht eine deutlich
// kleinere Auflösung völlig aus - fürs Drucken waren die Fotos ohnehin nie
// gedacht.
//
// imageOrientation: 'from-image' sorgt dafür, dass ein Foto, das die Kamera
// im Hochformat mit entsprechendem EXIF-Vermerk aufgenommen hat, auch nach
// der Verkleinerung richtig herum steht (createImageBitmap richtet sich
// sonst nach den rohen Pixel-Dimensionen und ignoriert diesen Vermerk).
export async function bildVerkleinern(datei: File, maxKante: number, qualitaet = 0.85): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(datei, { imageOrientation: 'from-image' })
  } catch (fehlerObjekt) {
    // Sollte praktisch nie vorkommen (z. B. beschädigte Bilddatei) - dann
    // lieber mit dem unveränderten Original weitermachen, als das Anlegen
    // des Films komplett zu verhindern.
    console.error('Foto konnte nicht verkleinert werden, verwende Original:', fehlerObjekt)
    return datei
  }

  try {
    const skalierung = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height))
    const zielBreite = Math.max(1, Math.round(bitmap.width * skalierung))
    const zielHoehe = Math.max(1, Math.round(bitmap.height * skalierung))

    const canvas = document.createElement('canvas')
    canvas.width = zielBreite
    canvas.height = zielHoehe
    const kontext = canvas.getContext('2d')
    if (!kontext) return datei

    kontext.drawImage(bitmap, 0, 0, zielBreite, zielHoehe)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualitaet))
    if (!blob) return datei

    const dateinameOhneEndung = datei.name.replace(/\.[^./]+$/, '')
    return new File([blob], `${dateinameOhneEndung}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

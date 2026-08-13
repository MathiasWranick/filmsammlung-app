import { createWorker } from 'tesseract.js'

// Erkennt den Text auf einem Foto (z. B. der Rückseite einer DVD/Blu-ray-Hülle).
// Beim allerersten Aufruf lädt der Browser die Sprachpakete für Deutsch und
// Englisch aus dem Internet nach (einmalig, danach lokal zwischengespeichert).
// Ab dann funktioniert die Texterkennung auch offline.
export async function erkenneText(bild: File): Promise<string> {
  const worker = await createWorker('deu+eng')
  try {
    const { data } = await worker.recognize(bild)
    return data.text
  } finally {
    await worker.terminate()
  }
}

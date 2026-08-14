// Schlanke Anbindung an die Microsoft Graph API - beschränkt auf genau die
// Aufrufe, die der OneDrive-Sync braucht (Ausbaustufe 1, Version 1.16).
// Alle Pfade beziehen sich auf den App-Ordner der Anwendung
// ("/me/drive/special/approot:/...") statt auf die gesamte OneDrive-Ablage
// des Nutzers - das ist die praktische Auswirkung der bei der
// App-Registrierung gewählten Berechtigung "Files.ReadWrite.AppFolder"
// (siehe Architekturkonzept, Abschnitt 3.3): Die App sieht und verändert
// ausschließlich ihren eigenen, für den Nutzer unter "Apps/Filmsammlung"
// sichtbaren Ordner.

import { zugriffstokenHolen } from '../auth/msal'

const GRAPH_BASIS_URL = 'https://graph.microsoft.com/v1.0'

async function graphAnfrage(pfad: string, optionen: RequestInit = {}): Promise<Response> {
  const token = await zugriffstokenHolen()
  return fetch(`${GRAPH_BASIS_URL}${pfad}`, {
    ...optionen,
    headers: { ...optionen.headers, Authorization: `Bearer ${token}` },
  })
}

// Liest die zentrale Sync-Datei ("filme.json") aus dem App-Ordner. Gibt
// "null" zurück, wenn die Datei noch nicht existiert (z. B. beim allerersten
// Sync von einem neuen Gerät aus) - das ist kein Fehler, sondern der
// normale Ausgangszustand.
export async function syncDatenLesen(): Promise<unknown | null> {
  const antwort = await graphAnfrage('/me/drive/special/approot:/filme.json:/content')
  if (antwort.status === 404) return null
  if (!antwort.ok) throw new Error(`OneDrive-Lesezugriff fehlgeschlagen (Fehlercode ${antwort.status}).`)
  return antwort.json()
}

// Schreibt die zentrale Sync-Datei komplett neu - für die relativ kleine
// JSON-Datei (nur Filmdaten, keine Fotos) genügt ein einfaches PUT, ohne
// die Upload-Session-Logik der Foto-Funktionen weiter unten.
export async function syncDatenSchreiben(daten: unknown): Promise<void> {
  const antwort = await graphAnfrage('/me/drive/special/approot:/filme.json:/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten),
  })
  if (!antwort.ok) throw new Error(`OneDrive-Schreibzugriff fehlgeschlagen (Fehlercode ${antwort.status}).`)
}

// Prüft nur, ob ein Foto mit diesem Dateinamen bereits in OneDrive liegt,
// ohne es herunterzuladen - dank der seit Version 1.13 zeitstempel-eindeutigen
// Dateinamen (siehe fotos.ts) bedeutet "gleicher Dateiname" automatisch
// "gleicher Inhalt", ein erneutes Hochladen ist dann überflüssig.
export async function fotoExistiertInOneDrive(dateiname: string): Promise<boolean> {
  const antwort = await graphAnfrage(`/me/drive/special/approot:/fotos/${encodeURIComponent(dateiname)}`)
  return antwort.ok
}

// Lädt ein Foto aus dem App-Ordner herunter.
export async function fotoHerunterladen(dateiname: string): Promise<Blob> {
  const antwort = await graphAnfrage(`/me/drive/special/approot:/fotos/${encodeURIComponent(dateiname)}:/content`)
  if (!antwort.ok) throw new Error(`Foto-Download fehlgeschlagen (Fehlercode ${antwort.status}).`)
  return antwort.blob()
}

// Lädt ein Foto hoch - bewusst über eine "Upload-Session" statt eines
// einfachen PUT-Aufrufs, weil Graph ein direktes PUT auf 4 MB begrenzt und
// Fotos direkt von einer Handykamera das regelmäßig überschreiten. Die
// Upload-Session liefert eine vorautorisierte Adresse zurück, an die die
// Datei anschließend mit einem gewöhnlichen "fetch" (ohne eigenen
// Authorization-Header) geschickt wird.
export async function fotoHochladen(dateiname: string, datei: Blob): Promise<void> {
  const sitzungsAntwort = await graphAnfrage(
    `/me/drive/special/approot:/fotos/${encodeURIComponent(dateiname)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    },
  )
  if (!sitzungsAntwort.ok) {
    throw new Error(`Foto-Upload (Sitzung einrichten) fehlgeschlagen (Fehlercode ${sitzungsAntwort.status}).`)
  }
  const sitzung = (await sitzungsAntwort.json()) as { uploadUrl: string }

  // Wichtig: KEIN eigener Content-Length-Header - Browser verwalten diesen
  // automatisch und verbieten Skripten, ihn selbst zu setzen. Nur
  // Content-Range wird explizit angegeben (hier wird die komplette Datei
  // in einem Stück übertragen, da Handyfotos für eine einzelne
  // Upload-Session ausreichend klein sind).
  const hochladenAntwort = await fetch(sitzung.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes 0-${datei.size - 1}/${datei.size}` },
    body: datei,
  })
  if (!hochladenAntwort.ok) throw new Error(`Foto-Upload fehlgeschlagen (Fehlercode ${hochladenAntwort.status}).`)
}

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

// Wie graphAnfrage, aber für eine bereits vollständige URL statt eines
// relativen Pfads - gebraucht für die Seiten 2+ einer paginierten Antwort
// (siehe fotosOrdnerAuflisten unten), deren "@odata.nextLink" von Microsoft
// Graph bereits als vollständige URL geliefert wird.
async function graphAnfrageAbsolut(url: string): Promise<Response> {
  const token = await zugriffstokenHolen()
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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

export interface OneDriveFotoEintrag {
  name: string
  groesseBytes: number
}

// Listet ALLE Dateien im Foto-Ordner des App-Ordners auf (Version 1.51) -
// im Unterschied zu den obigen Funktionen, die gezielt einzelne, bereits
// bekannte Dateinamen ansprechen, wird hier erstmals der komplette
// Ordnerinhalt abgefragt. Gebraucht für die neue Speicherübersicht/
// Aufräum-Funktion (siehe wartung/oneDriveAufraeumen.ts), die verwaiste,
// nicht mehr referenzierte Fotos erkennen soll. Microsoft Graph liefert
// Ordnerinhalte seitenweise (siehe "$top", hier bewusst niedrig gehalten
// nur als Hinweis an Graph, keine feste Grenze) - deshalb wird dem
// "@odata.nextLink" der Antwort gefolgt, bis wirklich alle Seiten gelesen
// sind.
export async function fotosOrdnerAuflisten(): Promise<OneDriveFotoEintrag[]> {
  const eintraege: OneDriveFotoEintrag[] = []
  let naechsteUrl: string | null = null
  let ersteAnfrage = true

  while (ersteAnfrage || naechsteUrl) {
    const antwort: Response = ersteAnfrage
      ? await graphAnfrage('/me/drive/special/approot:/fotos:/children?$select=name,size&$top=200')
      : await graphAnfrageAbsolut(naechsteUrl as string)
    ersteAnfrage = false

    // Der Foto-Ordner existiert noch gar nicht - z. B. eine brandneue
    // Sammlung ohne einen einzigen bereits hochgeladenen Film. Dann gibt es
    // schlicht nichts aufzulisten, kein Fehlerfall.
    if (antwort.status === 404) return eintraege
    if (!antwort.ok) throw new Error(`OneDrive-Ordnerabfrage fehlgeschlagen (Fehlercode ${antwort.status}).`)

    const seite = (await antwort.json()) as {
      value: { name: string; size: number }[]
      '@odata.nextLink'?: string
    }
    for (const eintrag of seite.value) {
      eintraege.push({ name: eintrag.name, groesseBytes: eintrag.size })
    }
    naechsteUrl = seite['@odata.nextLink'] ?? null
  }

  return eintraege
}

// Löscht eine einzelne Datei aus dem Foto-Ordner - gebraucht von der
// Aufräum-Funktion für verwaiste Fotos (Version 1.51, siehe
// wartung/oneDriveAufraeumen.ts). Microsoft Graph verschiebt gelöschte
// Dateien standardmäßig in den regulären OneDrive-Papierkorb (wie beim
// Löschen über die OneDrive-Weboberfläche) - nichts geht damit sofort
// unwiderruflich verloren. Eine bereits fehlende Datei (Fehlercode 404,
// z. B. bei einem zweiten Versuch nach einem zwischenzeitlichen Teilerfolg)
// gilt hier bewusst nicht als Fehler - das Ziel (Datei ist weg) ist ja
// bereits erreicht.
export async function fotoInOneDriveLoeschen(dateiname: string): Promise<void> {
  const antwort = await graphAnfrage(`/me/drive/special/approot:/fotos/${encodeURIComponent(dateiname)}`, {
    method: 'DELETE',
  })
  if (!antwort.ok && antwort.status !== 404) {
    throw new Error(`Löschen von "${dateiname}" in OneDrive fehlgeschlagen (Fehlercode ${antwort.status}).`)
  }
}

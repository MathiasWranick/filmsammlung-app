// Anbindung an die OMDb-REST-API (https://www.omdbapi.com) zur Ergänzung
// von Datenlücken, die weder Foto/KI-Bilderkennung noch manuelle Eingabe
// geliefert haben. Liefert ausschließlich Text-Metadaten (kein Poster,
// siehe Architekturkonzept) und überschreibt nie bereits vorhandene Werte -
// das entscheidet die aufrufende Stelle im Formular.

export interface OmdbFehler extends Error {
  code: 'kein_api_key' | 'offline' | 'ungueltiger_key' | 'unbekannt'
}

function erstelleFehler(code: OmdbFehler['code'], meldung: string): OmdbFehler {
  const fehler = new Error(meldung) as OmdbFehler
  fehler.code = code
  return fehler
}

export interface OmdbKandidat {
  imdbId: string
  titel: string
  jahr: string
}

export interface OmdbErgebnis {
  originaltitel?: string
  jahr?: number
  genre?: string
  produktionsland?: string
  sprache?: string
  imdbBewertung?: string
  regisseur?: string
  darsteller?: string
  handlung?: string
  laufzeitMinuten?: number
}

function apiKeyOderFehler(): string {
  const apiKey = import.meta.env.VITE_OMDB_API_KEY
  if (!apiKey) {
    throw erstelleFehler('kein_api_key', 'Die OMDb-Ergänzung ist nicht eingerichtet (fehlender API-Schlüssel).')
  }
  return apiKey
}

async function omdbAnfrage(parameter: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = apiKeyOderFehler()
  const suchParameter = new URLSearchParams({ ...parameter, apikey: apiKey })

  let antwort: Response
  try {
    antwort = await fetch(`https://www.omdbapi.com/?${suchParameter.toString()}`)
  } catch {
    throw erstelleFehler(
      'offline',
      'Keine Internetverbindung. Die OMDb-Ergänzung braucht eine bestehende Verbindung, die Filmdaten können aber auch manuell eingegeben werden.',
    )
  }

  if (antwort.status === 401) {
    // OMDb meldet einen ungültigen/fehlenden Schlüssel uneinheitlich: mal als
    // HTTP 401 (wie hier), mal als HTTP 200 mit Fehlertext im JSON (siehe
    // Prüfung weiter unten) - beide Fälle werden deshalb separat behandelt.
    // Häufigste Ursache bei einem neu erstellten, kostenlosen Schlüssel: Der
    // Schlüssel muss erst über den Aktivierungslink in der Bestätigungs-E-Mail
    // von OMDb freigeschaltet werden, bevor er funktioniert.
    throw erstelleFehler(
      'ungueltiger_key',
      'Der OMDb-API-Schlüssel wird nicht akzeptiert (Fehlercode 401). Meist liegt das daran, dass ein neuer, kostenloser Schlüssel erst über den Aktivierungslink in der Bestätigungs-E-Mail von OMDb freigeschaltet werden muss - bitte Posteingang/Spam-Ordner prüfen. Falls der Schlüssel bereits aktiviert ist, bitte prüfen, ob das Repository-Secret OMDB_API_KEY korrekt hinterlegt ist.',
    )
  }

  if (!antwort.ok) {
    throw erstelleFehler(
      'unbekannt',
      `Die OMDb-Ergänzung ist fehlgeschlagen (Fehlercode ${antwort.status}). Die Daten können manuell eingegeben werden.`,
    )
  }

  const daten = (await antwort.json()) as Record<string, unknown>

  if (daten.Response === 'False' && daten.Error === 'Invalid API key!') {
    throw erstelleFehler(
      'ungueltiger_key',
      'Der OMDb-API-Schlüssel wird nicht akzeptiert. Meist liegt das daran, dass ein neuer, kostenloser Schlüssel erst über den Aktivierungslink in der Bestätigungs-E-Mail von OMDb freigeschaltet werden muss - bitte Posteingang/Spam-Ordner prüfen. Falls der Schlüssel bereits aktiviert ist, bitte prüfen, ob das Repository-Secret OMDB_API_KEY korrekt hinterlegt ist.',
    )
  }

  return daten
}

function ohneNa(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined
  return wert && wert !== 'N/A' ? wert : undefined
}

function detailsUmwandeln(daten: Record<string, unknown>): OmdbErgebnis {
  const laufzeitText = ohneNa(daten.Runtime)
  const laufzeitZahl = laufzeitText ? Number.parseInt(laufzeitText, 10) : undefined

  return {
    originaltitel: ohneNa(daten.Title),
    jahr: ohneNa(daten.Year) ? Number.parseInt(String(daten.Year), 10) : undefined,
    genre: ohneNa(daten.Genre),
    produktionsland: ohneNa(daten.Country),
    sprache: ohneNa(daten.Language),
    imdbBewertung: ohneNa(daten.imdbRating),
    regisseur: ohneNa(daten.Director),
    darsteller: ohneNa(daten.Actors),
    handlung: ohneNa(daten.Plot),
    laufzeitMinuten: laufzeitZahl && !Number.isNaN(laufzeitZahl) ? laufzeitZahl : undefined,
  }
}

// Sucht direkt nach einem eindeutigen Treffer für den angegebenen Titel.
// Liefert null, wenn OMDb keinen eindeutigen Treffer findet (dann lohnt
// sich ein Versuch mit sucheKandidaten für eine Trefferliste).
export async function sucheEindeutig(titel: string): Promise<OmdbErgebnis | null> {
  const daten = await omdbAnfrage({ t: titel })
  if (daten.Response === 'False') return null
  return detailsUmwandeln(daten)
}

// Liefert eine Liste möglicher Treffer, aus der der Nutzer den richtigen
// Film auswählen kann (z. B. bei mehrdeutigen oder ungenauen Titeln).
export async function sucheKandidaten(titel: string): Promise<OmdbKandidat[]> {
  const daten = await omdbAnfrage({ s: titel })
  if (daten.Response === 'False' || !Array.isArray(daten.Search)) return []

  return (daten.Search as Record<string, unknown>[]).map((eintrag) => ({
    imdbId: String(eintrag.imdbID),
    titel: String(eintrag.Title),
    jahr: String(eintrag.Year),
  }))
}

// Lädt die vollständigen Details zu einem per sucheKandidaten ausgewählten
// Film anhand seiner IMDb-ID.
export async function ladeDetails(imdbId: string): Promise<OmdbErgebnis> {
  const daten = await omdbAnfrage({ i: imdbId })
  return detailsUmwandeln(daten)
}

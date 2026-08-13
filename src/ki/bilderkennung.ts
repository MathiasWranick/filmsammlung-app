// Bilderkennung der Cover-Fotos über die Gemini-API (Google). Ersetzt den
// früheren Tesseract.js-Ansatz: Statt nur Text zu erkennen, versteht das
// KI-Modell den Bildinhalt und liefert direkt strukturierte Vorschläge für
// die Formularfelder. Alle Vorschläge bleiben im Formular editierbar.
//
// Benötigt Internet (die Anfrage geht direkt aus dem Browser an Google) und
// einen API-Schlüssel, der beim Bauen der App über die Umgebungsvariable
// VITE_GEMINI_API_KEY eingebunden wird (siehe GitHub-Actions-Workflow).

// Aktuell verwendetes Modell. Falls Google dieses Modell irgendwann
// einstellt, reicht es, hier den Modellnamen auszutauschen.
const GEMINI_MODELL = 'gemini-3.5-flash-lite'

export interface KiErkennungsErgebnis {
  titel?: string
  regisseur?: string
  darsteller?: string
  laufzeitMinuten?: number
  fsk?: string
  barcode?: string
  handlung?: string
}

export type ErkennungsFehlerCode = 'kein_api_key' | 'offline' | 'kontingent_aufgebraucht' | 'unbekannt'

export class ErkennungsFehler extends Error {
  code: ErkennungsFehlerCode

  constructor(code: ErkennungsFehlerCode, meldung: string) {
    super(meldung)
    this.code = code
  }
}

const PROMPT = `Du bekommst ein oder zwei Fotos einer Film-Hülle (Vorderseite und/oder Rückseite einer DVD/Blu-ray-Hülle). Ermittle daraus folgende Angaben zum Film und antworte ausschließlich als JSON-Objekt mit genau diesen Feldern:

- titel: Der deutsche Filmtitel. Steht auf der Hülle meist nur der englische Originaltitel, ergänze wenn möglich den in Deutschland gebräuchlichen deutschen Verleihtitel anhand deines Filmwissens. Wenn du dir nicht sicher bist, nimm den Titel, der auf der Hülle steht.
- regisseur: Name des Regisseurs, falls erkennbar.
- darsteller: Die wichtigsten Hauptdarsteller, durch Komma getrennt, falls erkennbar.
- laufzeitMinuten: Laufzeit in Minuten als Zahl, falls angegeben (z. B. aus "Laufzeit: ca. 123 Min.").
- fsk: Die deutsche FSK-Alterskennzeichnung als Zahl (0, 6, 12, 16 oder 18), falls ein FSK-Logo oder eine entsprechende Angabe erkennbar ist.
- barcode: Die Ziffernfolge des EAN/Barcodes, falls lesbar.
- handlung: Eine kurze Zusammenfassung der Handlung (2-3 Sätze), falls ein Klappentext vorhanden ist.

Lasse ein Feld weg oder gib einen leeren String zurück, wenn du dir bei einer Angabe nicht ausreichend sicher bist. Erfinde keine Angaben.`

const ANTWORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: { type: 'STRING' },
    regisseur: { type: 'STRING' },
    darsteller: { type: 'STRING' },
    laufzeitMinuten: { type: 'INTEGER' },
    fsk: { type: 'STRING' },
    barcode: { type: 'STRING' },
    handlung: { type: 'STRING' },
  },
}

async function dateiZuBase64(datei: File): Promise<string> {
  const buffer = await datei.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binaer = ''
  const chunkGroesse = 0x8000
  for (let i = 0; i < bytes.length; i += chunkGroesse) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + chunkGroesse))
  }
  return btoa(binaer)
}

function bildTeil(base64: string, mimeType: string) {
  return { inline_data: { mime_type: mimeType, data: base64 } }
}

// Erkennt die Filmdaten anhand des Vorderseiten-Fotos (Pflicht) und
// optional des Rückseiten-Fotos (liefert meist die meisten Detailangaben).
export async function erkenneFilmdaten(
  vorderseite: File,
  rueckseite: File | null,
): Promise<KiErkennungsErgebnis> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new ErkennungsFehler(
      'kein_api_key',
      'Die KI-Erkennung ist nicht eingerichtet (fehlender API-Schlüssel).',
    )
  }

  const bildTeile = [bildTeil(await dateiZuBase64(vorderseite), vorderseite.type || 'image/jpeg')]
  if (rueckseite) {
    bildTeile.push(bildTeil(await dateiZuBase64(rueckseite), rueckseite.type || 'image/jpeg'))
  }

  const anfrageKoerper = {
    contents: [
      {
        parts: [{ text: PROMPT }, ...bildTeile],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: ANTWORT_SCHEMA,
    },
  }

  let antwort: Response
  try {
    antwort = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(anfrageKoerper),
      },
    )
  } catch {
    // fetch() wirft bei fehlender Internetverbindung eine Exception, statt
    // eine Antwort mit Fehlercode zu liefern.
    throw new ErkennungsFehler(
      'offline',
      'Keine Internetverbindung. Die KI-Erkennung braucht eine bestehende Verbindung, die Filmdaten können aber auch manuell eingegeben werden.',
    )
  }

  if (antwort.status === 429) {
    throw new ErkennungsFehler(
      'kontingent_aufgebraucht',
      'Das kostenlose Tages-Kontingent für die KI-Erkennung ist aufgebraucht. Bitte später erneut versuchen (Kontingent wird täglich zurückgesetzt) oder die Daten manuell eingeben.',
    )
  }

  if (!antwort.ok) {
    throw new ErkennungsFehler(
      'unbekannt',
      `Die KI-Erkennung ist fehlgeschlagen (Fehlercode ${antwort.status}). Die Daten können manuell eingegeben werden.`,
    )
  }

  const daten = await antwort.json()
  const text: string | undefined = daten?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new ErkennungsFehler(
      'unbekannt',
      'Die KI-Erkennung hat keine auswertbare Antwort geliefert. Die Daten können manuell eingegeben werden.',
    )
  }

  try {
    return JSON.parse(text) as KiErkennungsErgebnis
  } catch {
    throw new ErkennungsFehler(
      'unbekannt',
      'Die Antwort der KI-Erkennung konnte nicht gelesen werden. Die Daten können manuell eingegeben werden.',
    )
  }
}

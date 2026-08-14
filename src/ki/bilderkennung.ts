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
//
// Hinweis aus dem ersten Praxistest (Stufe 0.2): Mit dem günstigeren
// "flash-lite"-Modell wurde zuverlässig nur der Titel erkannt, obwohl die
// übrigen Angaben auf dem Rückseiten-Foto gut lesbar waren - vermutlich zu
// schwach für das genaue Lesen von Detailtext im Bild. "flash" (statt
// "flash-lite") ist im Vergleich immer noch sehr günstig, aber deutlich
// leistungsfähiger bei dieser Art Detailerkennung.
const GEMINI_MODELL = 'gemini-3.5-flash'

export interface KiErkennungsErgebnis {
  titel?: string
  format?: string
  fassung?: string
  regisseur?: string
  darsteller?: string
  laufzeitMinuten?: number
  fsk?: string
  barcode?: string
  handlung?: string
}

export type ErkennungsFehlerCode =
  | 'kein_api_key'
  | 'offline'
  | 'kontingent_aufgebraucht'
  | 'modell_nicht_gefunden'
  | 'dienst_ueberlastet'
  | 'unbekannt'

export class ErkennungsFehler extends Error {
  code: ErkennungsFehlerCode

  constructor(code: ErkennungsFehlerCode, meldung: string) {
    super(meldung)
    this.code = code
  }
}

const PROMPT = `Du bekommst ein oder zwei Fotos einer Film-Hülle (Vorderseite und/oder Rückseite einer DVD/Blu-ray-Hülle). Lies beide Fotos gründlich und vollständig, auch kleiner gedruckten Text (Besetzungsliste, technische Angaben, Klappentext). Ermittle daraus folgende Angaben zum Film und antworte ausschließlich als JSON-Objekt mit genau diesen Feldern. Versuche aktiv, jedes Feld auszufüllen, wenn die Information irgendwo auf einem der Fotos zu finden ist - nutze nicht vorschnell einen leeren Wert.

- titel: Der deutsche Filmtitel. Steht auf der Hülle meist nur der englische Originaltitel, ergänze in dem Fall den in Deutschland gebräuchlichen deutschen Verleihtitel anhand deines Filmwissens. Steht bereits ein deutscher Titel groß auf dem Cover, nimm genau diesen.
- format: Das Medienformat, erkennbar an Logo und/oder Aufdruck auf der Hülle (z. B. "DVD"-Logo, "Blu-ray Disc"-Logo, "4K Ultra HD"/"4K UHD"-Logo). Antworte mit genau einem der folgenden Werte: "DVD", "Blu-ray", "4K UHD" oder "Sonstiges".
- fassung: Falls auf der Hülle eine besondere Fassung/Edition vermerkt ist (z. B. "Director's Cut", "Extended Version", "Final Cut", "Kinofassung", "Steelbook", "Mediabook", "Uncut"), gib genau diesen Aufdruck wieder. Steht nichts dergleichen auf der Hülle, handelt es sich um eine gewöhnliche Standard-Fassung ohne besonderen Aufdruck - dann leeren String zurückgeben, nicht "Kinofassung" oder Ähnliches erfinden.
- regisseur: Name des Regisseurs/der Regisseurin, steht meist im Kleingedruckten der Rückseite (z. B. bei "Regie" oder "Buch, Produktion und Regie").
- darsteller: Die wichtigsten Hauptdarsteller aus der Besetzungsliste, durch Komma getrennt.
- laufzeitMinuten: Laufzeit in Minuten als Zahl, steht meist bei "Laufzeit: ca. X Min.". Falls nicht angegeben, 0 zurückgeben.
- fsk: Die deutsche FSK-Alterskennzeichnung als Zahl (0, 6, 12, 16 oder 18) aus dem runden FSK-Logo (z. B. "FSK ab 12 freigegeben"). Falls kein FSK-Logo zu sehen ist, leeren String zurückgeben.
- barcode: Die Ziffernfolge des EAN/Barcodes unter dem gedruckten Strichcode, meist 13 Ziffern. Falls nicht lesbar, leeren String zurückgeben.
- handlung: Eine kurze Zusammenfassung des Klappentexts (2-3 Sätze) in eigenen Worten. Falls kein Klappentext vorhanden ist, leeren String zurückgeben.

Erfinde keine Angaben, die auf den Fotos nicht zu finden sind und die du auch nicht aus gesichertem Filmwissen ergänzen kannst - aber wäge das bewusst ab: Angaben, die auf dem Foto lesbar sind, sollen nicht aus übertriebener Vorsicht weggelassen werden.`

const ANTWORT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: { type: 'STRING' },
    format: { type: 'STRING', enum: ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges'] },
    fassung: { type: 'STRING' },
    regisseur: { type: 'STRING' },
    darsteller: { type: 'STRING' },
    laufzeitMinuten: { type: 'INTEGER' },
    fsk: { type: 'STRING' },
    barcode: { type: 'STRING' },
    handlung: { type: 'STRING' },
  },
  // "required" zwingt das Modell, für jedes Feld aktiv einen Wert zu
  // liefern (und sei es ein leerer String/0), statt Felder bei Unsicherheit
  // einfach ganz aus der Antwort wegzulassen. Das hat sich im ersten
  // Praxistest als wahrscheinlichste Ursache dafür gezeigt, dass nur der
  // Titel erkannt wurde.
  required: ['titel', 'format', 'fassung', 'regisseur', 'darsteller', 'laufzeitMinuten', 'fsk', 'barcode', 'handlung'],
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

// Erkennt die Filmdaten anhand des Vorderseiten- und Rückseiten-Fotos. Die
// meisten Detailangaben (Regisseur, Darsteller, Laufzeit, Barcode,
// Handlung) stehen praktisch nur auf der Rückseite - das Rückseiten-Foto
// ist im Formular deshalb ebenfalls Pflicht, auch wenn diese Funktion es
// technisch weiterhin optional entgegennimmt.
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

  // Bei Überlastung auf Google-Seite (503/500) lohnt sich ein automatischer,
  // kurz verzögerter erneuter Versuch, bevor der Nutzer eine Fehlermeldung
  // sieht - laut Googles eigener Empfehlung für diesen Fehlertyp ("retry
  // with exponential backoff"). Andere Fehler (offline, Kontingent, falsches
  // Modell) werden dagegen durch einen Retry nicht besser und schlagen daher
  // sofort durch.
  const WARTEZEITEN_MS = [0, 2000, 5000]

  let antwort: Response | null = null
  for (let versuch = 0; versuch < WARTEZEITEN_MS.length; versuch++) {
    if (WARTEZEITEN_MS[versuch] > 0) {
      await new Promise((resolve) => setTimeout(resolve, WARTEZEITEN_MS[versuch]))
    }

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
      // eine Antwort mit Fehlercode zu liefern. Ein Retry hilft hier nicht.
      throw new ErkennungsFehler(
        'offline',
        'Keine Internetverbindung. Die KI-Erkennung braucht eine bestehende Verbindung, die Filmdaten können aber auch manuell eingegeben werden.',
      )
    }

    const istUeberlastet = antwort.status === 503 || antwort.status === 500
    const weitereVersucheUebrig = versuch < WARTEZEITEN_MS.length - 1
    if (istUeberlastet && weitereVersucheUebrig) {
      continue
    }
    break
  }

  // Nach der Schleife ist antwort garantiert gesetzt (mindestens ein
  // Versuch läuft immer durch, offline wirft vorher schon eine Exception).
  antwort = antwort as Response

  if (antwort.status === 429) {
    throw new ErkennungsFehler(
      'kontingent_aufgebraucht',
      'Das kostenlose Tages-Kontingent für die KI-Erkennung ist aufgebraucht. Bitte später erneut versuchen (Kontingent wird täglich zurückgesetzt) oder die Daten manuell eingeben.',
    )
  }

  if (antwort.status === 404) {
    // Google hat das verwendete Modell abgekündigt/abgeschaltet, oder der
    // Modellname im Code ist aus einem anderen Grund ungültig. Google
    // kündigt Modell-Abschaltungen vorher an, daher ist das kein
    // plötzliches Ereignis - der Modellname in bilderkennung.ts muss dann
    // aber auf ein aktuelles Modell aktualisiert werden.
    throw new ErkennungsFehler(
      'modell_nicht_gefunden',
      'Das verwendete KI-Modell ist nicht mehr verfügbar (vermutlich von Google eingestellt). Die App muss dafür aktualisiert werden - bitte Bescheid geben. Die Daten können bis dahin manuell eingegeben werden.',
    )
  }

  if (antwort.status === 503 || antwort.status === 500) {
    // Kein Fehler in unserer App, sondern eine vorübergehende Überlastung
    // auf Google-Seite (das Modell bekommt gerade mehr Anfragen, als es
    // verarbeiten kann). Mehrere automatische Versuche sind bereits
    // gescheitert (siehe oben) - das deutet auf eine länger anhaltende
    // Überlastung hin, nicht nur einen kurzen Ausreißer.
    throw new ErkennungsFehler(
      'dienst_ueberlastet',
      'Die Gemini-KI ist auch nach mehreren automatischen Versuchen gerade überlastet (Problem bei Google, kein Fehler in der App). Das kann bei sehr gefragten Modellen auch mal länger als ein paar Sekunden dauern. Bitte in ein paar Minuten erneut versuchen oder die Daten manuell eingeben.',
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

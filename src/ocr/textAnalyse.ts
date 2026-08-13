// Wertet den von der Texterkennung gelieferten Rohtext aus und versucht,
// daraus sinnvolle Vorschläge für die Formularfelder abzuleiten. Die
// Erkennung ist bewusst einfach gehalten (Heuristiken statt komplexer
// Regeln) - alle Vorschläge bleiben im Formular editierbar, falls die
// automatische Erkennung daneben liegt.

export interface TextAnalyseErgebnis {
  titelVorschlag?: string
  fsk?: string
  laufzeitMinuten?: number
  barcode?: string
}

const FSK_MUSTER = /FSK\s*(?:ab\s*)?(0|6|12|16|18)/i
const LAUFZEIT_MUSTER = /(?:Laufzeit|Spielzeit)[^\d]{0,10}(\d{2,3})\s*Min/i
const BARCODE_MUSTER = /\b(\d{12,13})\b/

// Sucht die erste Zeile mit "richtigem" Text (mehr als nur ein paar
// Zeichen, nicht nur Ziffern) - das ist bei den meisten Hüllen der Titel,
// da er meist groß und als Erstes aufgedruckt ist.
function ersteSinnvolleZeile(zeilen: string[]): string | undefined {
  for (const zeile of zeilen) {
    const bereinigt = zeile.trim()
    if (bereinigt.length < 3) continue
    if (/^\d+$/.test(bereinigt)) continue
    return bereinigt
  }
  return undefined
}

export function analysiereText(rohtext: string): TextAnalyseErgebnis {
  const zeilen = rohtext
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0)

  const ergebnis: TextAnalyseErgebnis = {}

  const titel = ersteSinnvolleZeile(zeilen)
  if (titel) ergebnis.titelVorschlag = titel

  const fskTreffer = rohtext.match(FSK_MUSTER)
  if (fskTreffer) ergebnis.fsk = fskTreffer[1]

  const laufzeitTreffer = rohtext.match(LAUFZEIT_MUSTER)
  if (laufzeitTreffer) ergebnis.laufzeitMinuten = Number(laufzeitTreffer[1])

  const barcodeTreffer = rohtext.match(BARCODE_MUSTER)
  if (barcodeTreffer) ergebnis.barcode = barcodeTreffer[1]

  return ergebnis
}

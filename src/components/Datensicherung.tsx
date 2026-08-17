import { useRef, useState } from 'react'
import { sicherungHerunterladen, type WiederherstellungsErgebnis } from '../backup/backup'

interface Props {
  // Die eigentliche Wiederherstellungslogik (ZIP einlesen, lokale Datenbank
  // ersetzen) sowie das anschließende Neuladen der Filmliste und Anstoßen
  // eines Syncs leben bewusst in App.tsx, nicht hier - genau wie bei den
  // übrigen Änderungsfunktionen (Anlegen, Bearbeiten, Löschen), die dieser
  // Komponente ebenfalls nur als Props durchgereicht werden.
  onWiederherstellen: (zipDatei: File) => Promise<WiederherstellungsErgebnis>
}

// Eigenständige Datensicherung (Ausbaustufe 2, Version 1.18, seit
// Ausbaustufe 4 inklusive Wiederherstellung) - bewusst unabhängig von der
// Microsoft-Anmeldung/dem OneDrive-Sync: Die ZIP-Datei (Filmdaten als CSV +
// JSON, plus alle Fotos) ist eine zusätzliche, vom OneDrive-Konto
// unabhängige Sicherungskopie, die sich z. B. auch woanders ablegen lässt -
// und aus der sich die Sammlung notfalls auch dann wiederherstellen lässt,
// wenn sowohl das Gerät als auch der OneDrive-Stand nicht mehr verlässlich
// sind (ist nur Ersteres der Fall, holt sich die App den aktuellen Bestand
// bereits automatisch aus OneDrive zurück, siehe Architekturkonzept 3.3).
function Datensicherung({ onWiederherstellen }: Props) {
  const [wirdErstellt, setWirdErstellt] = useState(false)
  const [wirdWiederhergestellt, setWirdWiederhergestellt] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const dateiEingabeRef = useRef<HTMLInputElement>(null)

  async function herunterladenHandler() {
    setFehler(null)
    setHinweis(null)
    setWirdErstellt(true)
    try {
      const ergebnis = await sicherungHerunterladen()
      setHinweis(
        `"${ergebnis.dateiname}" heruntergeladen (${ergebnis.anzahlFilme} Film(e), ${ergebnis.anzahlFotos} Foto(s)).`,
      )
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Die Datensicherung ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdErstellt(false)
    }
  }

  async function wiederherstellenStarten(zipDatei: File) {
    // Deutliche Warnung, da dies unwiderruflich die komplette aktuelle
    // Sammlung ersetzt (siehe filmeAusSicherungWiederherstellen in
    // db/filme.ts) - bewusst als einfacher Bestätigungsdialog statt eines
    // eigenen Overlays, wie auch schon beim Löschen eines einzelnen Films.
    const bestaetigt = window.confirm(
      'Achtung: Dies ersetzt deine gesamte aktuell gespeicherte Filmsammlung durch den Stand dieser Sicherungsdatei. ' +
        'Das kann nicht rückgängig gemacht werden (außer über eine weitere, neuere Sicherung). Wirklich fortfahren?',
    )
    if (!bestaetigt) return

    setFehler(null)
    setHinweis(null)
    setWirdWiederhergestellt(true)
    try {
      const ergebnis = await onWiederherstellen(zipDatei)
      let text = `Wiederhergestellt: ${ergebnis.anzahlFilme} Film(e), ${ergebnis.anzahlFotosWiederhergestellt} Foto(s).`
      if (ergebnis.anzahlFotosFehlend > 0) {
        text += ` ${ergebnis.anzahlFotosFehlend} Foto(s) fehlten bereits in der Sicherungsdatei.`
      }
      setHinweis(text)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      const nachricht = fehlerObjekt instanceof Error ? fehlerObjekt.message : null
      setFehler(nachricht ?? 'Die Wiederherstellung ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdWiederhergestellt(false)
    }
  }

  return (
    <div className="datensicherung">
      <button type="button" className="sek-btn" onClick={herunterladenHandler} disabled={wirdErstellt || wirdWiederhergestellt}>
        {wirdErstellt ? 'Sicherung wird erstellt …' : 'Datensicherung herunterladen (ZIP)'}
      </button>

      <button
        type="button"
        className="sek-btn"
        onClick={() => dateiEingabeRef.current?.click()}
        disabled={wirdErstellt || wirdWiederhergestellt}
      >
        {wirdWiederhergestellt ? 'Wird wiederhergestellt …' : 'Aus Sicherung wiederherstellen (ZIP) …'}
      </button>
      <input
        ref={dateiEingabeRef}
        type="file"
        accept=".zip"
        onChange={(ereignis) => {
          const zipDatei = ereignis.target.files?.[0]
          // Eingabe sofort zurücksetzen, damit sich dieselbe Datei bei
          // einem erneuten Versuch wieder auswählen lässt - der Browser
          // löst "onChange" sonst kein zweites Mal für dieselbe Datei aus.
          ereignis.target.value = ''
          if (zipDatei) wiederherstellenStarten(zipDatei)
        }}
        style={{ display: 'none' }}
      />

      {hinweis && <span className="hint">{hinweis}</span>}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default Datensicherung

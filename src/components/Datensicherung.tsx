import { useState } from 'react'
import { sicherungHerunterladen } from '../backup/backup'

// Eigenständige Datensicherung (Ausbaustufe 2, Version 1.18) - bewusst
// unabhängig von der Microsoft-Anmeldung/dem OneDrive-Sync: Die
// heruntergeladene ZIP-Datei (Filmdaten als CSV + JSON, plus alle Fotos)
// ist eine zusätzliche, vom OneDrive-Konto unabhängige Sicherungskopie,
// die sich z. B. auch woanders ablegen lässt.
function Datensicherung() {
  const [wirdErstellt, setWirdErstellt] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

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

  return (
    <div className="datensicherung">
      <button type="button" onClick={herunterladenHandler} disabled={wirdErstellt}>
        {wirdErstellt ? 'Sicherung wird erstellt …' : 'Datensicherung herunterladen (ZIP)'}
      </button>
      {hinweis && <span className="hint">{hinweis}</span>}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default Datensicherung

import { useState } from 'react'
import { verleihKatalogHerunterladen } from '../share/verleihKatalog'

// "Sammlung teilen" (Version 1.39, Nutzer-Spin-Off-Idee) - erzeugt einen
// eigenständigen HTML-Schnappschuss der Sammlung (siehe share/verleihKatalog.ts
// für die Begründung) und löst dessen Download aus. Bewusst als eigene,
// kleine Komponente statt Teil von Datensicherung.tsx: Unterschiedlicher
// Zweck (Weitergabe an Dritte vs. eigene Notfall-Sicherung) und
// unterschiedliche Feldauswahl - beides zu vermischen würde die im Grunde
// einfache Datensicherung unnötig verkomplizieren.
function VerleihKatalog() {
  const [wirdErstellt, setWirdErstellt] = useState(false)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function herunterladenHandler() {
    setFehler(null)
    setHinweis(null)
    setWirdErstellt(true)
    try {
      const ergebnis = await verleihKatalogHerunterladen()
      setHinweis(`"${ergebnis.dateiname}" heruntergeladen (${ergebnis.anzahlFilme} Film(e)).`)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Der Verleih-Katalog konnte nicht erstellt werden. Bitte nochmal versuchen.')
    } finally {
      setWirdErstellt(false)
    }
  }

  return (
    <div className="verleih-katalog">
      <button type="button" className="sek-btn" onClick={herunterladenHandler} disabled={wirdErstellt}>
        {wirdErstellt ? 'Katalog wird erstellt …' : 'Sammlung teilen (HTML) herunterladen'}
      </button>
      {hinweis && <span className="hint">{hinweis}</span>}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default VerleihKatalog

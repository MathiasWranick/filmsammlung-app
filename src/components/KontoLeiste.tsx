import { useEffect, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { anmelden, abmelden, angemeldetesKontoLaden } from '../auth/msal'

// Zeigt den Microsoft-Anmeldestatus an und bietet An-/Abmelden. Reiner
// erster Baustein von Ausbaustufe 1 (Version 1.15): Hier passiert bewusst
// noch KEIN OneDrive-Zugriff, nur die Anmeldung selbst - die eigentliche
// Synchronisation folgt als nächster, separater Schritt, sobald die
// Anmeldung zuverlässig funktioniert.
function KontoLeiste() {
  const [konto, setKonto] = useState<AccountInfo | null>(null)
  const [pruefungAbgeschlossen, setPruefungAbgeschlossen] = useState(false)
  const [anmeldungLaeuft, setAnmeldungLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Beim Laden der App prüfen, ob bereits eine gültige Anmeldung aus einer
  // früheren Sitzung im Browser-Speicher vorliegt (dank localStorage-Cache
  // in msal.ts) - ohne dass sich dafür ein Anmelde-Fenster öffnet.
  useEffect(() => {
    angemeldetesKontoLaden()
      .then(setKonto)
      .catch((fehlerObjekt) => console.error(fehlerObjekt))
      .finally(() => setPruefungAbgeschlossen(true))
  }, [])

  async function anmeldenHandler() {
    setFehler(null)
    setAnmeldungLaeuft(true)
    try {
      const kontoErgebnis = await anmelden()
      setKonto(kontoErgebnis)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Die Anmeldung ist fehlgeschlagen oder wurde abgebrochen. Bitte nochmal versuchen.')
    } finally {
      setAnmeldungLaeuft(false)
    }
  }

  async function abmeldenHandler() {
    setFehler(null)
    try {
      await abmelden()
      setKonto(null)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Die Abmeldung ist fehlgeschlagen.')
    }
  }

  // Bis die erste Prüfung durch ist, lieber nichts anzeigen als kurz
  // fälschlich den Anmelden-Button aufblitzen zu lassen.
  if (!pruefungAbgeschlossen) return null

  return (
    <div className="konto-leiste">
      {konto ? (
        <>
          <span className="hint">Angemeldet als {konto.username}</span>
          <button type="button" onClick={abmeldenHandler}>
            Abmelden
          </button>
        </>
      ) : (
        <button type="button" onClick={anmeldenHandler} disabled={anmeldungLaeuft}>
          {anmeldungLaeuft ? 'Wird angemeldet …' : 'Mit Microsoft anmelden (für OneDrive-Sync)'}
        </button>
      )}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default KontoLeiste

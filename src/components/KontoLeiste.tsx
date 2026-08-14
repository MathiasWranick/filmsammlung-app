import { useEffect, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { anmelden, abmelden, angemeldetesKontoLaden } from '../auth/msal'
import { synchronisieren } from '../sync/sync'

interface Props {
  // Wird nach einem erfolgreichen Sync aufgerufen, damit App.tsx die
  // Filmliste neu aus der (jetzt ggf. veränderten) Datenbank lädt - ohne
  // dass KontoLeiste selbst etwas über die Filmliste wissen muss.
  onSyncAbgeschlossen: () => void
}

// Zeigt den Microsoft-Anmeldestatus an, bietet An-/Abmelden und - sobald
// angemeldet - den manuellen Sync-Knopf (Version 1.16). Ein automatischer
// Sync (z. B. beim App-Start oder nach jeder Änderung) ist bewusst noch
// nicht eingebaut - erst soll sich diese manuelle Variante im echten
// Gebrauch bewähren, bevor daraus ein automatischer Hintergrundvorgang
// wird.
function KontoLeiste({ onSyncAbgeschlossen }: Props) {
  const [konto, setKonto] = useState<AccountInfo | null>(null)
  const [pruefungAbgeschlossen, setPruefungAbgeschlossen] = useState(false)
  const [anmeldungLaeuft, setAnmeldungLaeuft] = useState(false)
  const [syncLaeuft, setSyncLaeuft] = useState(false)
  const [syncHinweis, setSyncHinweis] = useState<string | null>(null)
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

  async function synchronisierenHandler() {
    setFehler(null)
    setSyncHinweis(null)
    setSyncLaeuft(true)
    try {
      const ergebnis = await synchronisieren()
      setSyncHinweis(
        ergebnis.anzahlAktualisiert > 0
          ? `Sync abgeschlossen - ${ergebnis.anzahlAktualisiert} Film(e) lokal aktualisiert.`
          : 'Sync abgeschlossen - alles bereits aktuell.',
      )
      onSyncAbgeschlossen()
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Die Synchronisierung ist fehlgeschlagen. Bitte später erneut versuchen.')
    } finally {
      setSyncLaeuft(false)
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
          <button type="button" onClick={synchronisierenHandler} disabled={syncLaeuft}>
            {syncLaeuft ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
          </button>
          <button type="button" onClick={abmeldenHandler}>
            Abmelden
          </button>
        </>
      ) : (
        <button type="button" onClick={anmeldenHandler} disabled={anmeldungLaeuft}>
          {anmeldungLaeuft ? 'Wird angemeldet …' : 'Mit Microsoft anmelden (für OneDrive-Sync)'}
        </button>
      )}
      {syncHinweis && <span className="hint">{syncHinweis}</span>}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default KontoLeiste

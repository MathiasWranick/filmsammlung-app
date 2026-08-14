import type { AccountInfo } from '@azure/msal-browser'

interface Props {
  konto: AccountInfo | null
  pruefungAbgeschlossen: boolean
  anmeldungLaeuft: boolean
  syncLaeuft: boolean
  syncHinweis: string | null
  fehler: string | null
  onAnmelden: () => void
  onAbmelden: () => void
  onSynchronisieren: () => void
}

// Zeigt den Microsoft-Anmeldestatus und den Sync-Status an. Rein
// darstellende Komponente ohne eigenen Zustand (Version 1.17) - die
// eigentliche Anmelde- und Sync-Logik lebt in App.tsx, weil sowohl diese
// Leiste als auch die automatischen Sync-Auslöser nach jeder Filmänderung
// denselben Zustand (angemeldetes Konto, laufender Sync) brauchen.
function KontoLeiste({
  konto,
  pruefungAbgeschlossen,
  anmeldungLaeuft,
  syncLaeuft,
  syncHinweis,
  fehler,
  onAnmelden,
  onAbmelden,
  onSynchronisieren,
}: Props) {
  // Bis die erste Prüfung durch ist, lieber nichts anzeigen als kurz
  // fälschlich den Anmelden-Button aufblitzen zu lassen.
  if (!pruefungAbgeschlossen) return null

  return (
    <div className="konto-leiste">
      {konto ? (
        <>
          <span className="hint">Angemeldet als {konto.username}</span>
          <button type="button" onClick={onSynchronisieren} disabled={syncLaeuft}>
            {syncLaeuft ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
          </button>
          <button type="button" onClick={onAbmelden}>
            Abmelden
          </button>
        </>
      ) : (
        <button type="button" onClick={onAnmelden} disabled={anmeldungLaeuft}>
          {anmeldungLaeuft ? 'Wird angemeldet …' : 'Mit Microsoft anmelden (für OneDrive-Sync)'}
        </button>
      )}
      {syncHinweis && <span className="hint">{syncHinweis}</span>}
      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default KontoLeiste

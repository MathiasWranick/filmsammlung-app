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
      {/* Status-Zeilen (Anmeldung/Sync) - seit Version 1.32 bewusst von den
          Aktionsbuttons getrennt, damit dieser Text ausschließlich im
          aufgeklappten Zustand des "Verwaltung"-Abschnitts sichtbar ist
          (Nutzer-Wunsch: im eingeklappten Kopf soll dazu nichts stehen). */}
      {konto && (
        <div className="verwaltung-status">
          <span className="hint">Angemeldet als {konto.username}</span>
          {syncHinweis && <span className="hint">{syncHinweis}</span>}
        </div>
      )}

      <div className="verwaltung-aktionen">
        {konto ? (
          <>
            <button type="button" className="sek-btn" onClick={onSynchronisieren} disabled={syncLaeuft}>
              {syncLaeuft ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
            </button>
            <button type="button" className="sek-btn" onClick={onAbmelden}>
              Abmelden
            </button>
          </>
        ) : (
          <button type="button" className="sek-btn" onClick={onAnmelden} disabled={anmeldungLaeuft}>
            {anmeldungLaeuft ? 'Wird angemeldet …' : 'Mit Microsoft anmelden (für OneDrive-Sync)'}
          </button>
        )}
      </div>

      {fehler && <p className="fehler">{fehler}</p>}
    </div>
  )
}

export default KontoLeiste

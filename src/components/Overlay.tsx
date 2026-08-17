import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  titel: string
  onSchliessen: () => void
  footer?: ReactNode
  children: ReactNode
}

// Wiederverwendbares Overlay-Bauteil (Ausbaustufe 3, GUI-/Usability-Review,
// erster Umsetzungsschritt). Zeigt seinen Inhalt in einem Fenster über der
// restlichen Seite - die Seite dahinter (z. B. die Filmliste inkl.
// Scroll-Position und Filter) bleibt dabei unverändert erhalten, es wird
// nichts neu geladen. Schließen ist auf drei Wegen möglich: über das X oben
// rechts, per Klick auf den abgedunkelten Hintergrund, oder per Escape-Taste.
// Bewusst als einfaches, eigenes Bauteil umgesetzt statt über das native
// HTML-<dialog>-Element, um volle Kontrolle über Aussehen und Verhalten zu
// behalten, ohne Browser-Eigenheiten einzelner <dialog>-Implementierungen
// berücksichtigen zu müssen.
function Overlay({ titel, onSchliessen, footer, children }: Props) {
  // Schutz gegen ungewolltes Schließen nach der Foto-Aufnahme (Version
  // 1.35, Nutzer-Feedback: Formular schloss sich meist von selbst, sobald
  // das aufgenommene Foto der Vorderseite mit "OK" bestätigt wurde). Ursache
  // vermutlich ein bekanntes Mobile-Browser-Verhalten: Kehrt die Seite aus
  // der nativen Kamera-App zurück, kann sich kurzzeitig die tatsächlich
  // sichtbare Fensterhöhe verschieben (z. B. weil die Adressleiste
  // ein-/ausblendet) - ein vom Browser dabei nachgeholter Klick an der
  // zuletzt berührten Bildschirmposition trifft dadurch statt des
  // Datei-Eingabefelds den nun freiliegenden abgedunkelten Hintergrund und
  // schließt das Overlay ungewollt. Da der auslösende Moment zuverlässig
  // erkennbar ist (die Seite wird nach einem Ausflug in eine andere App wie
  // die Kamera wieder sichtbar), wird ein Klick auf den Hintergrund kurz
  // nach diesem Wiedersichtbarwerden ignoriert. Ein bewusster Klick des
  // Nutzers auf den Hintergrund funktioniert danach ganz normal weiter.
  const wiederSichtbarZeitstempelRef = useRef(0)

  useEffect(() => {
    function beiSichtbarkeitswechsel() {
      if (document.visibilityState === 'visible') {
        wiederSichtbarZeitstempelRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', beiSichtbarkeitswechsel)
    return () => document.removeEventListener('visibilitychange', beiSichtbarkeitswechsel)
  }, [])

  function hintergrundKlick() {
    const millisekundenSeitWiedersichtbar = Date.now() - wiederSichtbarZeitstempelRef.current
    if (millisekundenSeitWiedersichtbar < 1000) return
    onSchliessen()
  }

  useEffect(() => {
    function beiEscape(ereignis: KeyboardEvent) {
      if (ereignis.key === 'Escape') onSchliessen()
    }
    document.addEventListener('keydown', beiEscape)

    // Verhindert, dass die Seite dahinter mitscrollt, während das Overlay
    // offen ist. Wird beim Schließen zuverlässig wiederhergestellt, auch
    // wenn zwischenzeitlich ein anderer Wert gesetzt war.
    const vorherigerOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', beiEscape)
      document.body.style.overflow = vorherigerOverflow
    }
  }, [onSchliessen])

  return (
    <div className="overlay-hintergrund" onClick={hintergrundKlick}>
      {/* stopPropagation verhindert, dass ein Klick in den Inhalt hinein
          (z. B. auf ein Eingabefeld) über den Hintergrund-Klick-Handler
          versehentlich das Overlay schließt. */}
      <div className="overlay-inhalt" onClick={(ereignis) => ereignis.stopPropagation()}>
        <div className="overlay-kopf">
          <h2>{titel}</h2>
          <button type="button" onClick={onSchliessen} className="overlay-schliessen" aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="overlay-body">{children}</div>
        {footer && <div className="overlay-fuss">{footer}</div>}
      </div>
    </div>
  )
}

export default Overlay

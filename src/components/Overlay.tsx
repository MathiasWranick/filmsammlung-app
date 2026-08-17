import { useEffect, type ReactNode } from 'react'

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
    <div className="overlay-hintergrund" onClick={onSchliessen}>
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

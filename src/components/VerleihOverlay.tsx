import { useState } from 'react'
import type { Film } from '../db/filme'
import Overlay from './Overlay'

interface Props {
  film: Film
  onSchliessen: () => void
  onSpeichern: (id: string, ausgeliehenAn: string | undefined, ausgeliehenAm: string | undefined) => void
}

// Overlay zur Pflege des Verleih-Status eines einzelnen Films (Ausbaustufe 3,
// zweiter Umsetzungsschritt). Ersetzt den zuvor immer sichtbaren Verleih-
// Bereich direkt auf der Filmkarte, wodurch die Karte deutlich schlanker
// wird, ohne dass Funktionalität verloren geht. Schließen ist auf zwei Wegen
// möglich: über das X oben rechts bzw. Klick auf den Hintergrund/Escape
// (ohne zu speichern), oder über den Speichern-Button am Ende (speichert und
// schließt anschließend automatisch).
function VerleihOverlay({ film, onSchliessen, onSpeichern }: Props) {
  const [ausgeliehenAnEingabe, setAusgeliehenAnEingabe] = useState(film.ausgeliehenAn ?? '')
  const [ausgeliehenAmEingabe, setAusgeliehenAmEingabe] = useState(film.ausgeliehenAm ?? '')

  function speichern() {
    onSpeichern(film.id, ausgeliehenAnEingabe.trim() || undefined, ausgeliehenAmEingabe || undefined)
    onSchliessen()
  }

  // Vermerkt die Rückgabe: leert beide Felder direkt und speichert sofort,
  // statt den Nutzer zu zwingen, Text- und Datumsfeld erst manuell selbst
  // zu leeren (Datumsfelder lassen sich auf dem Handy oft nur umständlich
  // leeren) - Nutzer-Feedback nach dem Test von Schritt 2.
  function zurueckgeben() {
    onSpeichern(film.id, undefined, undefined)
    onSchliessen()
  }

  return (
    <Overlay
      titel={`Verleih: ${film.titel}`}
      onSchliessen={onSchliessen}
      footer={
        <>
          {film.ausgeliehenAn && (
            <button type="button" onClick={zurueckgeben}>
              Zurückgeben
            </button>
          )}
          <button type="button" onClick={speichern}>
            Verleih-Status speichern
          </button>
        </>
      }
    >
      <div className="verleih-overlay-felder">
        <label>
          Ausgeliehen an
          <input
            type="text"
            value={ausgeliehenAnEingabe}
            onChange={(ereignis) => setAusgeliehenAnEingabe(ereignis.target.value)}
            placeholder="Name"
          />
        </label>
        <label>
          Ausgeliehen am
          <input
            type="date"
            value={ausgeliehenAmEingabe}
            onChange={(ereignis) => setAusgeliehenAmEingabe(ereignis.target.value)}
          />
        </label>
      </div>
    </Overlay>
  )
}

export default VerleihOverlay

import { useState, type ReactNode } from 'react'

interface Props {
  titel: string
  // Rein dekoratives Symbol vor dem Titel (z. B. "⚙" oder "▽") - bewusst als
  // einfaches Zeichen statt eigenes SVG-Icon, um für dieses reine
  // Layout-Feinschliff-Thema keine neuen Icon-Bauteile einführen zu müssen.
  symbol: string
  // Zahl in einem kleinen Kreis neben dem Titel, z. B. Anzahl aktiver Filter
  // - wird nur angezeigt, wenn > 0, damit der eingeklappte Kopf im
  // Normalfall (kein Filter aktiv) so schlicht wie möglich bleibt.
  badge?: number
  children: ReactNode
}

// Wiederverwendbares Ein-/Ausklapp-Bauteil für die Kopfbereiche "Verwaltung"
// und "Filter" (Feinschliff-Iteration, Version 1.32). Beide waren zuvor
// dauerhaft sichtbar und haben viel Platz beansprucht, obwohl sie nicht
// ständig gebraucht werden (siehe Nutzer-Feedback zum bisherigen, unruhig
// wirkenden Kopfbereich). Startet bewusst IMMER eingeklappt statt sich den
// letzten Zustand zu merken - einfacher, und es ist kein Problem, das eine
// eigene Persistenz (z. B. über localStorage) rechtfertigen würde.
function Abschnitt({ titel, symbol, badge, children }: Props) {
  const [offen, setOffen] = useState(false)

  return (
    <div className="abschnitt">
      <button
        type="button"
        className="abschnitt-kopf"
        onClick={() => setOffen((vorher) => !vorher)}
        aria-expanded={offen}
      >
        <span className="abschnitt-titel">
          <span aria-hidden="true">{symbol}</span>
          {titel}
          {!!badge && <span className="abschnitt-badge">{badge}</span>}
        </span>
        <span className={`abschnitt-pfeil${offen ? ' auf' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {offen && <div className="abschnitt-body">{children}</div>}
    </div>
  )
}

export default Abschnitt

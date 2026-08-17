import type { ReactNode } from 'react'

// Kleine, abhängigkeitsfreie SVG-Icons für die Aktions-Buttons auf der
// Filmkarte (Ausbaustufe 3, Schritt 4: Karten-Redesign). Bewusst als
// einfache, handgezeichnete Strich-Icons statt über eine zusätzliche
// npm-Abhängigkeit (z. B. ein Icon-Set) eingebunden - dafür reichen hier
// vier immer gleich aussehende Symbole, eine ganze Bibliothek wäre unnötige
// Komplexität. "currentColor" sorgt dafür, dass jedes Icon automatisch die
// Textfarbe des jeweiligen Buttons übernimmt (inkl. z. B. der roten Farbe
// beim Löschen-Button).
function IconHuelle({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export function AugeIcon() {
  return (
    <IconHuelle>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </IconHuelle>
  )
}

export function StiftIcon() {
  return (
    <IconHuelle>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </IconHuelle>
  )
}

export function TauschIcon() {
  return (
    <IconHuelle>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </IconHuelle>
  )
}

export function PapierkorbIcon() {
  return (
    <IconHuelle>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </IconHuelle>
  )
}

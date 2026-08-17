import { useEffect, useState } from 'react'
import type { Film } from '../db/filme'
import { fotoLaden } from '../db/fotos'
import Overlay from './Overlay'

interface Props {
  film: Film
  onSchliessen: () => void
}

// Eine einzelne Feldzeile - wird bewusst nur angezeigt, wenn tatsächlich ein
// Wert vorhanden ist, damit die Anzeige nicht mit leeren Feldern zugemüllt
// wird (viele Felder sind optional, siehe Datenmodell).
function FeldZeile({ label, wert }: { label: string; wert?: string }) {
  if (!wert) return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{wert}</dd>
    </>
  )
}

// Kompakte, rein lesende Anzeige aller Filmdaten (Ausbaustufe 3, erster
// Umsetzungsschritt) - im Unterschied zum Bearbeitungsformular ohne
// Eingabefelder und ohne KI-/OMDb-Bereich, dafür mit beiden Fotos in
// größerer Ansicht statt nur als kleines Vorschaubild in der Filmkarte.
// Rein lesend: Bearbeiten erfolgt weiterhin über den eigenen Button auf der
// Filmkarte, nicht mehr über dieses Overlay (Nutzer-Feedback nach Test).
function FilmAnzeige({ film, onSchliessen }: Props) {
  const [fotoVorderseiteUrl, setFotoVorderseiteUrl] = useState<string | null>(null)
  const [fotoRueckseiteUrl, setFotoRueckseiteUrl] = useState<string | null>(null)

  useEffect(() => {
    let vorderseiteUrl: string | null = null
    let rueckseiteUrl: string | null = null

    fotoLaden(film.fotoDateiname).then((url) => {
      vorderseiteUrl = url
      setFotoVorderseiteUrl(url)
    })

    if (film.fotoRueckseiteDateiname) {
      fotoLaden(film.fotoRueckseiteDateiname).then((url) => {
        rueckseiteUrl = url
        setFotoRueckseiteUrl(url)
      })
    }

    return () => {
      if (vorderseiteUrl) URL.revokeObjectURL(vorderseiteUrl)
      if (rueckseiteUrl) URL.revokeObjectURL(rueckseiteUrl)
    }
  }, [film.fotoDateiname, film.fotoRueckseiteDateiname])

  return (
    <Overlay titel={film.titel} onSchliessen={onSchliessen}>
      <div className="anzeige-fotos">
        {fotoVorderseiteUrl && <img src={fotoVorderseiteUrl} alt="Vorderseite" className="anzeige-foto" />}
        {fotoRueckseiteUrl && <img src={fotoRueckseiteUrl} alt="Rückseite" className="anzeige-foto" />}
      </div>

      <dl className="anzeige-felder">
        <FeldZeile label="Format" wert={film.format} />
        <FeldZeile label="Typ" wert={film.typ} />
        {film.typ === 'Serie' && <FeldZeile label="Staffel" wert={film.staffel} />}
        <FeldZeile label="Fassung/Edition" wert={film.fassung} />
        <FeldZeile label="Originaltitel" wert={film.originaltitel} />
        <FeldZeile label="Jahr" wert={film.jahr !== undefined ? String(film.jahr) : undefined} />
        <FeldZeile label="Genre" wert={film.genre} />
        <FeldZeile label="Regisseur" wert={film.regisseur} />
        <FeldZeile label="Darsteller" wert={film.darsteller} />
        <FeldZeile label="Laufzeit" wert={film.laufzeitMinuten !== undefined ? `${film.laufzeitMinuten} Min.` : undefined} />
        <FeldZeile label="FSK" wert={film.fsk ? `FSK ${film.fsk}` : undefined} />
        <FeldZeile label="Produktionsland" wert={film.produktionsland} />
        <FeldZeile label="Sprache" wert={film.sprache} />
        <FeldZeile label="IMDb-Bewertung" wert={film.imdbBewertung} />
        <FeldZeile label="Barcode" wert={film.barcode} />
        <FeldZeile label="Ausgeliehen an" wert={film.ausgeliehenAn} />
        <FeldZeile label="Ausgeliehen am" wert={film.ausgeliehenAm} />
        <FeldZeile label="Erfasst am" wert={new Date(film.erfasstAm).toLocaleDateString('de-DE')} />
        <FeldZeile label="Handlung" wert={film.handlung} />
      </dl>
    </Overlay>
  )
}

export default FilmAnzeige

import { useEffect, useMemo, useState } from 'react'
import {
  filmeLaden,
  filmAnlegen,
  filmAktualisieren,
  filmLoeschen,
  filmVerleihStatusSetzen,
  type Film,
  type Filterzustand,
  type Format,
} from './db/filme'
import { fotoSpeichern } from './db/fotos'
import FilmFormular from './components/FilmFormular'
import FilmListe from './components/FilmListe'

type LadeStatus = 'laedt' | 'bereit' | 'fehler'

const FILTER_STANDARD: Filterzustand = {
  suche: '',
  format: '',
  fsk: '',
  genre: '',
  ausgeliehenStatus: 'alle',
  omdbUnvollstaendig: false,
}

function App() {
  const [filme, setFilme] = useState<Film[]>([])
  const [ladeStatus, setLadeStatus] = useState<LadeStatus>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const [bearbeitenFilm, setBearbeitenFilm] = useState<Film | null>(null)
  const [filter, setFilter] = useState<Filterzustand>(FILTER_STANDARD)

  useEffect(() => {
    filmeLaden()
      .then((geladeneFilme) => {
        setFilme(geladeneFilme)
        setLadeStatus('bereit')
      })
      .catch((fehler) => {
        console.error(fehler)
        setFehlerText('Die Datenbank konnte nicht geladen werden.')
        setLadeStatus('fehler')
      })
  }, [])

  async function filmHinzufuegen(eingabe: {
    titel: string
    format: Format
    fassung?: string
    fotoVorderseite: File
    fotoRueckseite: File
    fsk?: string
    laufzeitMinuten?: number
    barcode?: string
    regisseur?: string
    darsteller?: string
    handlung?: string
    originaltitel?: string
    jahr?: number
    genre?: string
    produktionsland?: string
    sprache?: string
    imdbBewertung?: string
  }) {
    const id = crypto.randomUUID()
    const fotoDateiname = await fotoSpeichern(id, 'vorderseite', eingabe.fotoVorderseite)
    const fotoRueckseiteDateiname = await fotoSpeichern(id, 'rueckseite', eingabe.fotoRueckseite)
    const neuerFilm = await filmAnlegen({
      id,
      titel: eingabe.titel,
      format: eingabe.format,
      fassung: eingabe.fassung,
      fotoDateiname,
      fotoRueckseiteDateiname,
      fsk: eingabe.fsk,
      laufzeitMinuten: eingabe.laufzeitMinuten,
      barcode: eingabe.barcode,
      regisseur: eingabe.regisseur,
      darsteller: eingabe.darsteller,
      handlung: eingabe.handlung,
      originaltitel: eingabe.originaltitel,
      jahr: eingabe.jahr,
      genre: eingabe.genre,
      produktionsland: eingabe.produktionsland,
      sprache: eingabe.sprache,
      imdbBewertung: eingabe.imdbBewertung,
    })
    setFilme((vorherigeFilme) => [neuerFilm, ...vorherigeFilme])
  }

  async function filmAktualisierenHandler(eingabe: {
    id: string
    titel: string
    format: Format
    fassung?: string
    fsk?: string
    laufzeitMinuten?: number
    barcode?: string
    regisseur?: string
    darsteller?: string
    handlung?: string
    originaltitel?: string
    jahr?: number
    genre?: string
    produktionsland?: string
    sprache?: string
    imdbBewertung?: string
  }) {
    await filmAktualisieren(eingabe)
    setFilme((vorherigeFilme) =>
      vorherigeFilme.map((film) => (film.id === eingabe.id ? { ...film, ...eingabe } : film)),
    )
    setBearbeitenFilm(null)
  }

  function bearbeitenStarten(film: Film) {
    setBearbeitenFilm(film)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function filmLoeschenHandler(id: string) {
    await filmLoeschen(id)
    setFilme((vorherigeFilme) => vorherigeFilme.filter((film) => film.id !== id))
    if (bearbeitenFilm?.id === id) setBearbeitenFilm(null)
  }

  async function verleihStatusAendernHandler(
    id: string,
    ausgeliehenAn: string | undefined,
    ausgeliehenAm: string | undefined,
  ) {
    await filmVerleihStatusSetzen(id, ausgeliehenAn, ausgeliehenAm)
    setFilme((vorherigeFilme) =>
      vorherigeFilme.map((film) => (film.id === id ? { ...film, ausgeliehenAn, ausgeliehenAm } : film)),
    )
  }

  // Suche/Filter laufen rein im Speicher über die bereits geladenen Filme -
  // bei ~1.000 Filmen (Zielgröße laut Architekturkonzept) ist das
  // performant genug, ganz ohne zusätzliche Datenbank-Abfragen.
  const gefilterteFilme = useMemo(() => {
    const sucheKleingeschrieben = filter.suche.trim().toLowerCase()
    const genreKleingeschrieben = filter.genre.trim().toLowerCase()

    return filme.filter((film) => {
      if (sucheKleingeschrieben && !film.titel.toLowerCase().includes(sucheKleingeschrieben)) return false
      if (filter.format && film.format !== filter.format) return false
      if (filter.fsk && film.fsk !== filter.fsk) return false
      if (genreKleingeschrieben && !film.genre?.toLowerCase().includes(genreKleingeschrieben)) return false
      if (filter.ausgeliehenStatus === 'verliehen' && !film.ausgeliehenAn) return false
      if (filter.ausgeliehenStatus === 'nicht_verliehen' && film.ausgeliehenAn) return false
      // Genre wird ausschließlich über OMDb befüllt - ein leeres Genre ist
      // damit ein zuverlässiger Hinweis auf eine noch fehlende/erfolglose
      // OMDb-Ergänzung, ganz ohne eigenes Status-Feld (siehe Filterzustand).
      if (filter.omdbUnvollstaendig && film.genre) return false
      return true
    })
  }, [filme, filter])

  return (
    <div className="page">
      <h1>Filmsammlung</h1>

      {ladeStatus === 'laedt' && <p className="hint">Datenbank wird geladen …</p>}
      {ladeStatus === 'fehler' && <p className="fehler">{fehlerText}</p>}

      {ladeStatus === 'bereit' && (
        <>
          <FilmFormular
            bearbeitenFilm={bearbeitenFilm}
            onHinzufuegen={filmHinzufuegen}
            onAktualisieren={filmAktualisierenHandler}
            onAbbrechen={() => setBearbeitenFilm(null)}
          />
          <FilmListe
            filme={gefilterteFilme}
            gesamtAnzahl={filme.length}
            filter={filter}
            onFilterAendern={setFilter}
            onBearbeiten={bearbeitenStarten}
            onLoeschen={filmLoeschenHandler}
            onVerleihStatusAendern={verleihStatusAendernHandler}
          />
        </>
      )}
    </div>
  )
}

export default App

import { useEffect, useState } from 'react'
import { filmeLaden, filmAnlegen, type Film, type Format } from './db/filme'
import { fotoSpeichern } from './db/fotos'
import FilmFormular from './components/FilmFormular'
import FilmListe from './components/FilmListe'

type LadeStatus = 'laedt' | 'bereit' | 'fehler'

function App() {
  const [filme, setFilme] = useState<Film[]>([])
  const [ladeStatus, setLadeStatus] = useState<LadeStatus>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)

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
    foto: File
    fsk?: string
    laufzeitMinuten?: number
    barcode?: string
  }) {
    const id = crypto.randomUUID()
    const fotoDateiname = await fotoSpeichern(id, eingabe.foto)
    const neuerFilm = await filmAnlegen({
      id,
      titel: eingabe.titel,
      format: eingabe.format,
      fotoDateiname,
      fsk: eingabe.fsk,
      laufzeitMinuten: eingabe.laufzeitMinuten,
      barcode: eingabe.barcode,
    })
    setFilme((vorherigeFilme) => [neuerFilm, ...vorherigeFilme])
  }

  return (
    <div className="page">
      <h1>Filmsammlung</h1>

      {ladeStatus === 'laedt' && <p className="hint">Datenbank wird geladen …</p>}
      {ladeStatus === 'fehler' && <p className="fehler">{fehlerText}</p>}

      {ladeStatus === 'bereit' && (
        <>
          <FilmFormular onHinzufuegen={filmHinzufuegen} />
          <FilmListe filme={filme} />
        </>
      )}
    </div>
  )
}

export default App

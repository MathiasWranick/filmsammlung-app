import { useEffect, useState } from 'react'
import type { Film } from '../db/filme'
import { fotoLaden } from '../db/fotos'

function FilmKarte({ film }: { film: Film }) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let eigeneObjektUrl: string | null = null

    fotoLaden(film.fotoDateiname).then((url) => {
      eigeneObjektUrl = url
      setFotoUrl(url)
    })

    return () => {
      if (eigeneObjektUrl) URL.revokeObjectURL(eigeneObjektUrl)
    }
  }, [film.fotoDateiname])

  return (
    <li className="film-karte">
      {fotoUrl && <img src={fotoUrl} alt={`Cover von ${film.titel}`} />}
      <div>
        <strong>{film.titel}</strong>
        <div className="hint">
          {film.format}
          {film.jahr && ` · ${film.jahr}`}
          {film.fsk && ` · FSK ${film.fsk}`}
          {film.laufzeitMinuten && ` · ${film.laufzeitMinuten} Min.`}
          {film.genre && ` · ${film.genre}`}
          {film.regisseur && ` · Regie: ${film.regisseur}`}
        </div>
      </div>
    </li>
  )
}

interface Props {
  filme: Film[]
}

function FilmListe({ filme }: Props) {
  if (filme.length === 0) {
    return <p className="hint">Noch keine Filme erfasst.</p>
  }

  return (
    <ul className="film-liste">
      {filme.map((film) => (
        <FilmKarte key={film.id} film={film} />
      ))}
    </ul>
  )
}

export default FilmListe

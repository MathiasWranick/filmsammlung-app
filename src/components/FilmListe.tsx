import { useEffect, useState } from 'react'
import { FORMATE, TYPEN, type Film, type Filterzustand, type Format } from '../db/filme'
import { fotoLaden } from '../db/fotos'
import Datensicherung from './Datensicherung'
import FilmAnzeige from './FilmAnzeige'
import VerleihOverlay from './VerleihOverlay'

const FSK_STUFEN = ['0', '6', '12', '16', '18']

interface FilmKarteProps {
  film: Film
  onAnzeigen: (film: Film) => void
  onBearbeiten: (film: Film) => void
  onLoeschen: (id: string) => void
  onVerleihen: (film: Film) => void
}

function FilmKarte({ film, onAnzeigen, onBearbeiten, onLoeschen, onVerleihen }: FilmKarteProps) {
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

  function loeschen() {
    if (window.confirm(`„${film.titel}“ wirklich löschen?`)) {
      onLoeschen(film.id)
    }
  }

  return (
    <li className="film-karte">
      {fotoUrl && <img src={fotoUrl} alt={`Cover von ${film.titel}`} />}
      <div>
        <strong>{film.titel}</strong>
        <div className="hint">
          {film.format}
          {film.typ === 'Serie' && ` · Serie${film.staffel ? ` (Staffel ${film.staffel})` : ''}`}
          {film.fsk && ` · FSK ${film.fsk}`}
          {film.laufzeitMinuten && ` · ${film.laufzeitMinuten} Min.`}
          {film.ausgeliehenAn && (
            <>
              {' · '}
              <strong>Verliehen an {film.ausgeliehenAn}</strong>
            </>
          )}
        </div>

        <div className="film-aktionen">
          <button type="button" onClick={() => onAnzeigen(film)}>
            Anzeigen
          </button>
          <button type="button" onClick={() => onBearbeiten(film)}>
            Bearbeiten
          </button>
          <button type="button" onClick={() => onVerleihen(film)}>
            Verleihen
          </button>
          <button type="button" onClick={loeschen}>
            Löschen
          </button>
        </div>
      </div>
    </li>
  )
}

interface Props {
  filme: Film[]
  gesamtAnzahl: number
  filter: Filterzustand
  onFilterAendern: (filter: Filterzustand) => void
  onBearbeiten: (film: Film) => void
  onLoeschen: (id: string) => void
  onVerleihStatusAendern: (id: string, ausgeliehenAn: string | undefined, ausgeliehenAm: string | undefined) => void
}

function FilmListe({ filme, gesamtAnzahl, filter, onFilterAendern, onBearbeiten, onLoeschen, onVerleihStatusAendern }: Props) {
  // Welcher Film gerade im Anzeige- bzw. Verleih-Overlay offen ist - rein
  // lokaler Anzeigezustand der Liste, muss nicht bis nach App.tsx hochgereicht
  // werden (im Unterschied zu bearbeitenFilm, das dort bleibt, weil das
  // Formular weiterhin dort lebt).
  const [anzeigeFilm, setAnzeigeFilm] = useState<Film | null>(null)
  const [verleihFilm, setVerleihFilm] = useState<Film | null>(null)

  function feldAendern<K extends keyof Filterzustand>(feld: K, wert: Filterzustand[K]) {
    onFilterAendern({ ...filter, [feld]: wert })
  }

  return (
    <div>
      <div className="filterleiste">
        <input
          type="text"
          value={filter.suche}
          onChange={(ereignis) => feldAendern('suche', ereignis.target.value)}
          placeholder="Titel suchen …"
        />

        <select value={filter.format} onChange={(ereignis) => feldAendern('format', ereignis.target.value as Format | '')}>
          <option value="">Alle Formate</option>
          {FORMATE.map((einzelnesFormat) => (
            <option key={einzelnesFormat} value={einzelnesFormat}>
              {einzelnesFormat}
            </option>
          ))}
        </select>

        <select value={filter.typ} onChange={(ereignis) => feldAendern('typ', ereignis.target.value as Filterzustand['typ'])}>
          <option value="">Filme &amp; Serien</option>
          {TYPEN.map((einzelnerTyp) => (
            <option key={einzelnerTyp} value={einzelnerTyp}>
              {einzelnerTyp}
            </option>
          ))}
        </select>

        <select value={filter.fsk} onChange={(ereignis) => feldAendern('fsk', ereignis.target.value)}>
          <option value="">Alle FSK-Stufen</option>
          {FSK_STUFEN.map((stufe) => (
            <option key={stufe} value={stufe}>
              FSK {stufe}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={filter.genre}
          onChange={(ereignis) => feldAendern('genre', ereignis.target.value)}
          placeholder="Genre enthält …"
        />

        <select
          value={filter.ausgeliehenStatus}
          onChange={(ereignis) => feldAendern('ausgeliehenStatus', ereignis.target.value as Filterzustand['ausgeliehenStatus'])}
        >
          <option value="alle">Alle (Verleih-Status)</option>
          <option value="verliehen">Nur verliehene</option>
          <option value="nicht_verliehen">Nur nicht verliehene</option>
        </select>

        <label>
          <input
            type="checkbox"
            checked={filter.omdbUnvollstaendig}
            onChange={(ereignis) => feldAendern('omdbUnvollstaendig', ereignis.target.checked)}
          />
          OMDb-Daten unvollständig
        </label>
      </div>

      <Datensicherung />

      <p className="hint">
        {filme.length} von {gesamtAnzahl} Filmen angezeigt
      </p>

      {filme.length === 0 ? (
        <p className="hint">{gesamtAnzahl === 0 ? 'Noch keine Filme erfasst.' : 'Keine Filme gefunden - Suche/Filter anpassen.'}</p>
      ) : (
        <ul className="film-liste">
          {filme.map((film) => (
            <FilmKarte
              key={film.id}
              film={film}
              onAnzeigen={setAnzeigeFilm}
              onBearbeiten={onBearbeiten}
              onLoeschen={onLoeschen}
              onVerleihen={setVerleihFilm}
            />
          ))}
        </ul>
      )}

      {anzeigeFilm && <FilmAnzeige film={anzeigeFilm} onSchliessen={() => setAnzeigeFilm(null)} />}

      {verleihFilm && (
        <VerleihOverlay film={verleihFilm} onSchliessen={() => setVerleihFilm(null)} onSpeichern={onVerleihStatusAendern} />
      )}
    </div>
  )
}

export default FilmListe

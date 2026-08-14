import { useEffect, useState } from 'react'
import { FORMATE, type Film, type Filterzustand, type Format } from '../db/filme'
import { fotoLaden } from '../db/fotos'

const FSK_STUFEN = ['0', '6', '12', '16', '18']

interface FilmKarteProps {
  film: Film
  onBearbeiten: (film: Film) => void
  onLoeschen: (id: string) => void
  onVerleihStatusAendern: (id: string, ausgeliehenAn: string | undefined, ausgeliehenAm: string | undefined) => void
}

function FilmKarte({ film, onBearbeiten, onLoeschen, onVerleihStatusAendern }: FilmKarteProps) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [ausgeliehenAnEingabe, setAusgeliehenAnEingabe] = useState(film.ausgeliehenAn ?? '')
  const [ausgeliehenAmEingabe, setAusgeliehenAmEingabe] = useState(film.ausgeliehenAm ?? '')

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

  // Verleih-Eingabefelder synchron halten, falls sich der Status von außen
  // ändert (z. B. nach "Zurückgeben" oder einer Aktualisierung von einem
  // anderen Gerät nach einem künftigen Sync).
  useEffect(() => {
    setAusgeliehenAnEingabe(film.ausgeliehenAn ?? '')
    setAusgeliehenAmEingabe(film.ausgeliehenAm ?? '')
  }, [film.ausgeliehenAn, film.ausgeliehenAm])

  function verleihSpeichern() {
    onVerleihStatusAendern(film.id, ausgeliehenAnEingabe.trim() || undefined, ausgeliehenAmEingabe || undefined)
  }

  function zurueckgeben() {
    setAusgeliehenAnEingabe('')
    setAusgeliehenAmEingabe('')
    onVerleihStatusAendern(film.id, undefined, undefined)
  }

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
          {film.jahr && ` · ${film.jahr}`}
          {film.fsk && ` · FSK ${film.fsk}`}
          {film.laufzeitMinuten && ` · ${film.laufzeitMinuten} Min.`}
          {film.genre && ` · ${film.genre}`}
          {film.regisseur && ` · Regie: ${film.regisseur}`}
        </div>

        <div className="verleih">
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
            am
            <input
              type="date"
              value={ausgeliehenAmEingabe}
              onChange={(ereignis) => setAusgeliehenAmEingabe(ereignis.target.value)}
            />
          </label>
          <button type="button" onClick={verleihSpeichern}>
            Verleih-Status speichern
          </button>
          {film.ausgeliehenAn && (
            <button type="button" onClick={zurueckgeben}>
              Zurückgeben
            </button>
          )}
        </div>

        <div className="film-aktionen">
          <button type="button" onClick={() => onBearbeiten(film)}>
            Bearbeiten
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
              onBearbeiten={onBearbeiten}
              onLoeschen={onLoeschen}
              onVerleihStatusAendern={onVerleihStatusAendern}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export default FilmListe

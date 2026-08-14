import { useState, type FormEvent } from 'react'
import type { Format } from '../db/filme'
import { erkenneFilmdaten, ErkennungsFehler } from '../ki/bilderkennung'
import { sucheEindeutig, sucheKandidaten, ladeDetails, type OmdbErgebnis, type OmdbKandidat, type OmdbFehler } from '../omdb/omdb'

const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

interface Props {
  onHinzufuegen: (eingabe: {
    titel: string
    format: Format
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
  }) => Promise<void>
}

// OMDb liefert im Fehlerfall ein normales Error-Objekt mit einem
// zusätzlichen "code"-Feld (kein eigener Klassenname wie bei der
// KI-Erkennung) - dieser Type-Guard erkennt es trotzdem zuverlässig.
function istOmdbFehler(fehler: unknown): fehler is OmdbFehler {
  return fehler instanceof Error && 'code' in fehler
}

function FilmFormular({ onHinzufuegen }: Props) {
  const [titel, setTitel] = useState('')
  const [format, setFormat] = useState<Format>('DVD')
  const [fotoVorderseite, setFotoVorderseite] = useState<File | null>(null)
  const [fotoRueckseite, setFotoRueckseite] = useState<File | null>(null)
  const [fsk, setFsk] = useState('')
  const [laufzeit, setLaufzeit] = useState('')
  const [barcode, setBarcode] = useState('')
  const [regisseur, setRegisseur] = useState('')
  const [darsteller, setDarsteller] = useState('')
  const [handlung, setHandlung] = useState('')
  const [originaltitel, setOriginaltitel] = useState('')
  const [jahr, setJahr] = useState('')
  const [genre, setGenre] = useState('')
  const [produktionsland, setProduktionsland] = useState('')
  const [sprache, setSprache] = useState('')
  const [imdbBewertung, setImdbBewertung] = useState('')

  const [erkennungLaeuft, setErkennungLaeuft] = useState(false)
  const [erkennungsHinweis, setErkennungsHinweis] = useState<string | null>(null)
  const [omdbLaeuft, setOmdbLaeuft] = useState(false)
  const [omdbHinweis, setOmdbHinweis] = useState<string | null>(null)
  const [omdbKandidaten, setOmdbKandidaten] = useState<OmdbKandidat[] | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Die KI-Erkennung kostet (wenn auch nur minimal) Kontingent, deshalb
  // läuft sie nicht automatisch beim Foto-Auswählen, sondern erst auf
  // Knopfdruck.
  async function erkennungStarten() {
    if (!fotoVorderseite || !fotoRueckseite) return

    setErkennungsHinweis(null)
    setErkennungLaeuft(true)
    try {
      const ergebnis = await erkenneFilmdaten(fotoVorderseite, fotoRueckseite)

      if (ergebnis.titel && !titel.trim()) setTitel(ergebnis.titel)
      if (ergebnis.format && FORMATE.includes(ergebnis.format as Format)) {
        setFormat(ergebnis.format as Format)
      }
      if (ergebnis.fsk) setFsk(ergebnis.fsk)
      if (ergebnis.laufzeitMinuten) setLaufzeit(String(ergebnis.laufzeitMinuten))
      if (ergebnis.barcode) setBarcode(ergebnis.barcode)
      if (ergebnis.regisseur) setRegisseur(ergebnis.regisseur)
      if (ergebnis.darsteller) setDarsteller(ergebnis.darsteller)
      if (ergebnis.handlung) setHandlung(ergebnis.handlung)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      if (fehlerObjekt instanceof ErkennungsFehler) {
        setErkennungsHinweis(fehlerObjekt.message)
      } else {
        setErkennungsHinweis('Die KI-Erkennung ist fehlgeschlagen. Die Daten können manuell eingegeben werden.')
      }
    } finally {
      setErkennungLaeuft(false)
    }
  }

  // Übernimmt ein OMDb-Ergebnis ins Formular. Wichtig: "Foto ist führend" -
  // OMDb füllt ausschließlich Felder, die noch leer sind, und überschreibt
  // nie bereits vorhandene (per Foto/KI oder manuell erfasste) Werte.
  function omdbErgebnisUebernehmen(ergebnis: OmdbErgebnis) {
    if (ergebnis.originaltitel && !originaltitel.trim()) setOriginaltitel(ergebnis.originaltitel)
    if (ergebnis.jahr && !jahr.trim()) setJahr(String(ergebnis.jahr))
    if (ergebnis.genre && !genre.trim()) setGenre(ergebnis.genre)
    if (ergebnis.produktionsland && !produktionsland.trim()) setProduktionsland(ergebnis.produktionsland)
    if (ergebnis.sprache && !sprache.trim()) setSprache(ergebnis.sprache)
    if (ergebnis.imdbBewertung && !imdbBewertung.trim()) setImdbBewertung(ergebnis.imdbBewertung)
    if (ergebnis.regisseur && !regisseur.trim()) setRegisseur(ergebnis.regisseur)
    if (ergebnis.darsteller && !darsteller.trim()) setDarsteller(ergebnis.darsteller)
    if (ergebnis.handlung && !handlung.trim()) setHandlung(ergebnis.handlung)
    if (ergebnis.laufzeitMinuten && !laufzeit.trim()) setLaufzeit(String(ergebnis.laufzeitMinuten))
  }

  // Startet die OMDb-Ergänzung anhand des bereits eingegebenen Titels.
  // Findet OMDb keinen eindeutigen Treffer, wird stattdessen eine
  // Trefferliste zur Auswahl angezeigt (siehe omdbKandidaten).
  async function omdbStarten() {
    if (!titel.trim()) return

    setOmdbHinweis(null)
    setOmdbKandidaten(null)
    setOmdbLaeuft(true)
    try {
      const treffer = await sucheEindeutig(titel)
      if (treffer) {
        omdbErgebnisUebernehmen(treffer)
      } else {
        const kandidaten = await sucheKandidaten(titel)
        if (kandidaten.length === 0) {
          setOmdbHinweis('Kein Treffer bei OMDb gefunden. Die Daten können manuell eingegeben werden.')
        } else {
          setOmdbKandidaten(kandidaten)
        }
      }
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      if (istOmdbFehler(fehlerObjekt)) {
        setOmdbHinweis(fehlerObjekt.message)
      } else {
        setOmdbHinweis('Die OMDb-Ergänzung ist fehlgeschlagen. Die Daten können manuell eingegeben werden.')
      }
    } finally {
      setOmdbLaeuft(false)
    }
  }

  // Lädt die Details zu einem aus der Trefferliste ausgewählten Film.
  async function omdbKandidatAuswaehlen(imdbId: string) {
    setOmdbKandidaten(null)
    setOmdbLaeuft(true)
    try {
      const ergebnis = await ladeDetails(imdbId)
      omdbErgebnisUebernehmen(ergebnis)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      if (istOmdbFehler(fehlerObjekt)) {
        setOmdbHinweis(fehlerObjekt.message)
      } else {
        setOmdbHinweis('Die OMDb-Ergänzung ist fehlgeschlagen. Die Daten können manuell eingegeben werden.')
      }
    } finally {
      setOmdbLaeuft(false)
    }
  }

  async function absenden(ereignis: FormEvent<HTMLFormElement>) {
    ereignis.preventDefault()
    const formElement = ereignis.currentTarget
    setFehler(null)

    if (!fotoVorderseite) {
      setFehler('Bitte zuerst ein Foto der Vorderseite auswählen.')
      return
    }
    if (!fotoRueckseite) {
      setFehler('Bitte auch ein Foto der Rückseite auswählen (dort stehen die meisten Detailangaben).')
      return
    }
    if (!titel.trim()) {
      setFehler('Bitte einen Titel eingeben.')
      return
    }

    setWirdGespeichert(true)
    try {
      await onHinzufuegen({
        titel,
        format,
        fotoVorderseite,
        fotoRueckseite,
        fsk: fsk.trim() || undefined,
        laufzeitMinuten: laufzeit.trim() ? Number(laufzeit) : undefined,
        barcode: barcode.trim() || undefined,
        regisseur: regisseur.trim() || undefined,
        darsteller: darsteller.trim() || undefined,
        handlung: handlung.trim() || undefined,
        originaltitel: originaltitel.trim() || undefined,
        jahr: jahr.trim() ? Number(jahr) : undefined,
        genre: genre.trim() || undefined,
        produktionsland: produktionsland.trim() || undefined,
        sprache: sprache.trim() || undefined,
        imdbBewertung: imdbBewertung.trim() || undefined,
      })
      setTitel('')
      setFormat('DVD')
      setFotoVorderseite(null)
      setFotoRueckseite(null)
      setFsk('')
      setLaufzeit('')
      setBarcode('')
      setRegisseur('')
      setDarsteller('')
      setHandlung('')
      setOriginaltitel('')
      setJahr('')
      setGenre('')
      setProduktionsland('')
      setSprache('')
      setImdbBewertung('')
      setErkennungsHinweis(null)
      setOmdbHinweis(null)
      setOmdbKandidaten(null)
      formElement.reset()
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Speichern ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  return (
    <form onSubmit={absenden} className="formular">
      <h2>Film hinzufügen</h2>

      <label>
        Foto Vorderseite (wird als Vorschaubild verwendet)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => setFotoVorderseite(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      <label>
        Foto Rückseite (hier stehen die meisten Detailangaben)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => setFotoRueckseite(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      <button
        type="button"
        onClick={erkennungStarten}
        disabled={!fotoVorderseite || !fotoRueckseite || erkennungLaeuft}
      >
        {erkennungLaeuft ? 'Wird erkannt …' : 'Mit KI erkennen'}
      </button>

      {erkennungsHinweis && <p className="hint">{erkennungsHinweis}</p>}

      <label>
        Titel
        <input
          type="text"
          value={titel}
          onChange={(ereignis) => setTitel(ereignis.target.value)}
          placeholder="z. B. Inception"
        />
      </label>

      <label>
        Format
        <select value={format} onChange={(ereignis) => setFormat(ereignis.target.value as Format)}>
          {FORMATE.map((einzelnesFormat) => (
            <option key={einzelnesFormat} value={einzelnesFormat}>
              {einzelnesFormat}
            </option>
          ))}
        </select>
      </label>

      <button type="button" onClick={omdbStarten} disabled={!titel.trim() || omdbLaeuft}>
        {omdbLaeuft ? 'Wird ergänzt …' : 'Bei OMDb ergänzen'}
      </button>

      {omdbHinweis && <p className="hint">{omdbHinweis}</p>}

      {omdbKandidaten && (
        <div className="hint">
          <p>Mehrere mögliche Treffer bei OMDb gefunden - bitte auswählen:</p>
          {omdbKandidaten.map((kandidat) => (
            <button
              type="button"
              key={kandidat.imdbId}
              onClick={() => omdbKandidatAuswaehlen(kandidat.imdbId)}
              style={{ display: 'block', marginBottom: '4px' }}
            >
              {kandidat.titel} ({kandidat.jahr})
            </button>
          ))}
          <button type="button" onClick={() => setOmdbKandidaten(null)}>
            Abbrechen
          </button>
        </div>
      )}

      <label>
        Regisseur
        <input type="text" value={regisseur} onChange={(ereignis) => setRegisseur(ereignis.target.value)} />
      </label>

      <label>
        Darsteller
        <input type="text" value={darsteller} onChange={(ereignis) => setDarsteller(ereignis.target.value)} />
      </label>

      <label>
        FSK
        <input type="text" value={fsk} onChange={(ereignis) => setFsk(ereignis.target.value)} placeholder="z. B. 12" />
      </label>

      <label>
        Laufzeit (Minuten)
        <input
          type="number"
          value={laufzeit}
          onChange={(ereignis) => setLaufzeit(ereignis.target.value)}
          placeholder="z. B. 148"
        />
      </label>

      <label>
        Barcode
        <input
          type="text"
          value={barcode}
          onChange={(ereignis) => setBarcode(ereignis.target.value)}
          placeholder="EAN, rein informativ"
        />
      </label>

      <label>
        Handlung
        <textarea value={handlung} onChange={(ereignis) => setHandlung(ereignis.target.value)} rows={3} />
      </label>

      <label>
        Originaltitel
        <input
          type="text"
          value={originaltitel}
          onChange={(ereignis) => setOriginaltitel(ereignis.target.value)}
          placeholder="z. B. Inception (falls abweichend)"
        />
      </label>

      <label>
        Erscheinungsjahr
        <input
          type="number"
          value={jahr}
          onChange={(ereignis) => setJahr(ereignis.target.value)}
          placeholder="z. B. 2010"
        />
      </label>

      <label>
        Genre
        <input type="text" value={genre} onChange={(ereignis) => setGenre(ereignis.target.value)} placeholder="z. B. Action, Sci-Fi" />
      </label>

      <label>
        Produktionsland
        <input
          type="text"
          value={produktionsland}
          onChange={(ereignis) => setProduktionsland(ereignis.target.value)}
          placeholder="z. B. USA, UK"
        />
      </label>

      <label>
        Sprache
        <input type="text" value={sprache} onChange={(ereignis) => setSprache(ereignis.target.value)} placeholder="z. B. Englisch, Deutsch" />
      </label>

      <label>
        IMDb-Bewertung
        <input
          type="text"
          value={imdbBewertung}
          onChange={(ereignis) => setImdbBewertung(ereignis.target.value)}
          placeholder="z. B. 8.2"
        />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}

      <button type="submit" disabled={wirdGespeichert || erkennungLaeuft}>
        {wirdGespeichert ? 'Wird gespeichert …' : 'Film speichern'}
      </button>
    </form>
  )
}

export default FilmFormular

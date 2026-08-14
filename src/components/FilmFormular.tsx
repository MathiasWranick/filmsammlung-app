import { useEffect, useState, type FormEvent } from 'react'
import { FORMATE, type Film, type Format } from '../db/filme'
import { erkenneFilmdaten, ErkennungsFehler } from '../ki/bilderkennung'
import { sucheEindeutig, sucheKandidaten, ladeDetails, type OmdbErgebnis, type OmdbKandidat, type OmdbFehler } from '../omdb/omdb'
import { fotoLaden } from '../db/fotos'

interface FilmFelder {
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
}

interface Props {
  // Ist hier ein Film gesetzt, arbeitet das Formular im Bearbeitungsmodus:
  // Felder werden vorausgefüllt, die Foto-Aufnahme über "Mit KI erkennen"
  // entfällt (dafür bräuchte es zwingend beide Fotos neu), einzelne Fotos
  // lassen sich aber optional ersetzen (z. B. durch ein Cover aus einer
  // externen Quelle) - der Speichern-Button ruft onAktualisieren statt
  // onHinzufuegen auf.
  bearbeitenFilm?: Film | null
  onHinzufuegen: (eingabe: FilmFelder & { fotoVorderseite: File; fotoRueckseite: File }) => Promise<void>
  onAktualisieren?: (
    eingabe: FilmFelder & { id: string; neueFotoVorderseite?: File; neueFotoRueckseite?: File },
  ) => Promise<void>
  onAbbrechen?: () => void
}

// OMDb liefert im Fehlerfall ein normales Error-Objekt mit einem
// zusätzlichen "code"-Feld (kein eigener Klassenname wie bei der
// KI-Erkennung) - dieser Type-Guard erkennt es trotzdem zuverlässig.
function istOmdbFehler(fehler: unknown): fehler is OmdbFehler {
  return fehler instanceof Error && 'code' in fehler
}

function FilmFormular({ bearbeitenFilm, onHinzufuegen, onAktualisieren, onAbbrechen }: Props) {
  const bearbeitungsModus = Boolean(bearbeitenFilm)

  const [titel, setTitel] = useState('')
  const [format, setFormat] = useState<Format>('DVD')
  const [fassung, setFassung] = useState('')
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

  const [aktuelleFotoVorderseiteUrl, setAktuelleFotoVorderseiteUrl] = useState<string | null>(null)
  const [aktuelleFotoRueckseiteUrl, setAktuelleFotoRueckseiteUrl] = useState<string | null>(null)

  const [erkennungLaeuft, setErkennungLaeuft] = useState(false)
  const [erkennungsHinweis, setErkennungsHinweis] = useState<string | null>(null)
  const [omdbLaeuft, setOmdbLaeuft] = useState(false)
  const [omdbHinweis, setOmdbHinweis] = useState<string | null>(null)
  const [omdbKandidaten, setOmdbKandidaten] = useState<OmdbKandidat[] | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Formularfelder mit den Werten des zu bearbeitenden Films befüllen -
  // bzw. beim Verlassen des Bearbeitungsmodus (bearbeitenFilm wird null)
  // wieder auf ein leeres Formular zurücksetzen.
  useEffect(() => {
    setTitel(bearbeitenFilm?.titel ?? '')
    setFormat(bearbeitenFilm?.format ?? 'DVD')
    setFassung(bearbeitenFilm?.fassung ?? '')
    setFotoVorderseite(null)
    setFotoRueckseite(null)
    setFsk(bearbeitenFilm?.fsk ?? '')
    setLaufzeit(bearbeitenFilm?.laufzeitMinuten ? String(bearbeitenFilm.laufzeitMinuten) : '')
    setBarcode(bearbeitenFilm?.barcode ?? '')
    setRegisseur(bearbeitenFilm?.regisseur ?? '')
    setDarsteller(bearbeitenFilm?.darsteller ?? '')
    setHandlung(bearbeitenFilm?.handlung ?? '')
    setOriginaltitel(bearbeitenFilm?.originaltitel ?? '')
    setJahr(bearbeitenFilm?.jahr ? String(bearbeitenFilm.jahr) : '')
    setGenre(bearbeitenFilm?.genre ?? '')
    setProduktionsland(bearbeitenFilm?.produktionsland ?? '')
    setSprache(bearbeitenFilm?.sprache ?? '')
    setImdbBewertung(bearbeitenFilm?.imdbBewertung ?? '')
    setErkennungsHinweis(null)
    setOmdbHinweis(null)
    setOmdbKandidaten(null)
    setFehler(null)
  }, [bearbeitenFilm])

  // Lädt im Bearbeitungsmodus eine Vorschau der bereits gespeicherten
  // Fotos, damit erkennbar ist, was man gerade ersetzt.
  useEffect(() => {
    let vorderseiteUrl: string | null = null
    let rueckseiteUrl: string | null = null

    if (bearbeitenFilm?.fotoDateiname) {
      fotoLaden(bearbeitenFilm.fotoDateiname).then((url) => {
        vorderseiteUrl = url
        setAktuelleFotoVorderseiteUrl(url)
      })
    } else {
      setAktuelleFotoVorderseiteUrl(null)
    }

    if (bearbeitenFilm?.fotoRueckseiteDateiname) {
      fotoLaden(bearbeitenFilm.fotoRueckseiteDateiname).then((url) => {
        rueckseiteUrl = url
        setAktuelleFotoRueckseiteUrl(url)
      })
    } else {
      setAktuelleFotoRueckseiteUrl(null)
    }

    return () => {
      if (vorderseiteUrl) URL.revokeObjectURL(vorderseiteUrl)
      if (rueckseiteUrl) URL.revokeObjectURL(rueckseiteUrl)
    }
  }, [bearbeitenFilm])

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
      if (ergebnis.fassung && !fassung.trim()) setFassung(ergebnis.fassung)
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
  // Trefferliste zur Auswahl angezeigt (siehe omdbKandidaten). Auch im
  // Bearbeitungsmodus nutzbar, z. B. um es mit dem englischen Originaltitel
  // erneut zu versuchen, wenn OMDb unter dem deutschen Titel nichts findet.
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

    if (!titel.trim()) {
      setFehler('Bitte einen Titel eingeben.')
      return
    }

    if (!bearbeitungsModus) {
      if (!fotoVorderseite) {
        setFehler('Bitte zuerst ein Foto der Vorderseite auswählen.')
        return
      }
      if (!fotoRueckseite) {
        setFehler('Bitte auch ein Foto der Rückseite auswählen (dort stehen die meisten Detailangaben).')
        return
      }
    }

    const felder: FilmFelder = {
      titel,
      format,
      fassung: fassung.trim() || undefined,
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
    }

    setWirdGespeichert(true)
    try {
      if (bearbeitungsModus && bearbeitenFilm && onAktualisieren) {
        await onAktualisieren({
          ...felder,
          id: bearbeitenFilm.id,
          neueFotoVorderseite: fotoVorderseite ?? undefined,
          neueFotoRueckseite: fotoRueckseite ?? undefined,
        })
        // Formular bleibt danach im Bearbeitungsmodus - App.tsx beendet ihn
        // (setzt bearbeitenFilm auf null), was das Formular über den
        // useEffect oben automatisch zurücksetzt (inkl. ausgewählter, aber
        // noch nicht gespeicherter Foto-Dateien).
      } else if (fotoVorderseite && fotoRueckseite) {
        await onHinzufuegen({ ...felder, fotoVorderseite, fotoRueckseite })
        formElement.reset()
        setTitel('')
        setFormat('DVD')
        setFassung('')
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
      }
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Speichern ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  return (
    <form onSubmit={absenden} className="formular">
      <h2>{bearbeitungsModus ? `„${bearbeitenFilm?.titel}“ bearbeiten` : 'Film hinzufügen'}</h2>

      {!bearbeitungsModus && (
        <>
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
        </>
      )}

      {bearbeitungsModus && (
        <>
          <label>
            Foto Vorderseite ändern (optional)
            {aktuelleFotoVorderseiteUrl && (
              <img src={aktuelleFotoVorderseiteUrl} alt="Aktuelles Vorderseiten-Foto" className="formular-fotovorschau" />
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(ereignis) => setFotoVorderseite(ereignis.target.files?.[0] ?? null)}
            />
          </label>

          <label>
            Foto Rückseite ändern (optional)
            {aktuelleFotoRueckseiteUrl && (
              <img src={aktuelleFotoRueckseiteUrl} alt="Aktuelles Rückseiten-Foto" className="formular-fotovorschau" />
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(ereignis) => setFotoRueckseite(ereignis.target.files?.[0] ?? null)}
            />
          </label>
        </>
      )}

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

      <label>
        Fassung/Edition
        <input
          type="text"
          value={fassung}
          onChange={(ereignis) => setFassung(ereignis.target.value)}
          placeholder="z. B. Director's Cut, Steelbook (nur falls auf der Hülle vermerkt)"
        />
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

      <div className="formular-aktionen">
        <button type="submit" disabled={wirdGespeichert || erkennungLaeuft}>
          {wirdGespeichert ? 'Wird gespeichert …' : bearbeitungsModus ? 'Änderungen speichern' : 'Film speichern'}
        </button>
        {bearbeitungsModus && onAbbrechen && (
          <button type="button" onClick={onAbbrechen}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  )
}

export default FilmFormular

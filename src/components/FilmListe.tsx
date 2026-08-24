import { useEffect, useMemo, useState } from 'react'
import { FILTER_STANDARD, FORMATE, TYPEN, type Film, type Filterzustand, type Format } from '../db/filme'
import { fotoMiniaturLaden } from '../db/fotos'
import Abschnitt from './Abschnitt'
import FilmAnzeige from './FilmAnzeige'
import { AugeIcon, ListenIcon, PapierkorbIcon, RasterIcon, StiftIcon, TauschIcon } from './Icons'
import VerleihOverlay from './VerleihOverlay'

const FSK_STUFEN = ['0', '6', '12', '16', '18']

// Sortierung der Liste (Ausbaustufe 3, Schritt 6). Bewusst getrennt vom
// Filterzustand: Ein Filter grenzt ein, WELCHE Filme in der Ergebnismenge
// landen, eine Sortierung bestimmt nur die REIHENFOLGE der bereits
// gefilterten Treffer - beides hat daher einen eigenen Zustand und wird
// unabhängig voneinander zurückgesetzt bzw. gespeichert.
type Sortierfeld = 'titel' | 'erfasstAm' | 'jahr' | 'fsk'
type Sortierrichtung = 'aufsteigend' | 'absteigend'
interface Sortierzustand {
  feld: Sortierfeld
  richtung: Sortierrichtung
}

const SORTIERUNG_STANDARD: Sortierzustand = { feld: 'titel', richtung: 'aufsteigend' }
const SORTIERUNG_SPEICHERSCHLUESSEL = 'filmsammlung-sortierung'

// Ansicht der Ergebnisliste (Version 1.46): Liste (bisheriges Verhalten,
// mit allen Aktionen) oder Raster (nur Frontcover, siehe FilmKachel unten).
// Genau wie die Sortierung eine reine, geräteeigene Anzeige-Einstellung -
// daher dasselbe Speicherschema wie bei SORTIERUNG_SPEICHERSCHLUESSEL, nur
// als einfacher String statt als Objekt (kein JSON.parse nötig).
type Ansicht = 'liste' | 'raster'
const ANSICHT_STANDARD: Ansicht = 'liste'
const ANSICHT_SPEICHERSCHLUESSEL = 'filmsammlung-ansicht'

function ansichtAusSpeicherLesen(): Ansicht {
  try {
    const gespeichert = window.localStorage.getItem(ANSICHT_SPEICHERSCHLUESSEL)
    if (gespeichert === 'liste' || gespeichert === 'raster') return gespeichert
  } catch {
    // localStorage nicht verfügbar - Standardwert verwenden.
  }
  return ANSICHT_STANDARD
}

// Liest eine zuvor gewählte Sortierung aus dem lokalen Browser-Speicher
// (je Gerät, bewusst nicht über den OneDrive-Sync geteilt - reine
// Anzeige-Einstellung, kein Sammlungsinhalt). In try/catch, weil manche
// Browser (z. B. Safari im privaten Modus) den Zugriff auf localStorage
// verweigern können - dann greift einfach der Standardwert.
function sortierungAusSpeicherLesen(): Sortierzustand {
  try {
    const gespeichert = window.localStorage.getItem(SORTIERUNG_SPEICHERSCHLUESSEL)
    if (!gespeichert) return SORTIERUNG_STANDARD
    const geparst = JSON.parse(gespeichert)
    const gueltigeFelder: Sortierfeld[] = ['titel', 'erfasstAm', 'jahr', 'fsk']
    if (gueltigeFelder.includes(geparst.feld) && (geparst.richtung === 'aufsteigend' || geparst.richtung === 'absteigend')) {
      return geparst
    }
  } catch {
    // localStorage nicht verfügbar oder Inhalt beschädigt - Standardwert verwenden.
  }
  return SORTIERUNG_STANDARD
}

// Vergleicht zwei Filme anhand eines einzelnen Sortierfelds. Bei den
// optionalen Feldern (Jahr, FSK) landen Filme ohne Wert bewusst immer am
// Ende, unabhängig von der Richtung - "kein Wert vorhanden" soll nicht wie
// "kleinster Wert" wirken. FSK wird als Zahl statt als Text verglichen
// (sonst würde “6” als Text nach “18” einsortiert werden, obwohl es die
// niedrigere Altersfreigabe ist).
function optionalenWertVergleichen(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return a - b
}

function filmeVergleichen(a: Film, b: Film, feld: Sortierfeld): number {
  switch (feld) {
    case 'titel':
      return a.titel.localeCompare(b.titel, 'de')
    case 'erfasstAm':
      // ISO-Zeitstempel lassen sich als Text korrekt chronologisch vergleichen.
      return a.erfasstAm.localeCompare(b.erfasstAm)
    case 'jahr':
      return optionalenWertVergleichen(a.jahr, b.jahr)
    case 'fsk':
      return optionalenWertVergleichen(a.fsk ? Number(a.fsk) : undefined, b.fsk ? Number(b.fsk) : undefined)
    default:
      // Unerreichbar (Sortierfeld deckt alle vier Fälle oben ab) - nur zur
      // Absicherung des Rückgabetyps, falls Sortierfeld künftig erweitert wird.
      return 0
  }
}

// Zählt, bei wie vielen Filterfeldern der aktuelle Wert vom Standard
// (FILTER_STANDARD) abweicht - wird als kleine Zahl im eingeklappten Kopf
// des "Filter"-Abschnitts angezeigt (Version 1.32), damit trotz
// eingeklapptem Zustand erkennbar bleibt, dass gerade eingegrenzt wird.
function filterAktivAnzahl(filter: Filterzustand): number {
  return (Object.keys(FILTER_STANDARD) as (keyof Filterzustand)[]).filter(
    (feld) => filter[feld] !== FILTER_STANDARD[feld],
  ).length
}

// Lädt die kleine Miniaturansicht des Vorderseiten-Fotos eines Films und
// liefert eine anzeigbare Objekt-URL zurück (null, solange sie noch lädt).
// Gemeinsam genutzt von FilmKarte (Listenansicht) und FilmKachel
// (Rasteransicht, Version 1.46) - beide zeigen dasselbe Vorschaubild, nur in
// unterschiedlichem Kartenlayout.
function verwendeMiniaturFoto(fotoDateiname: string): string | null {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let eigeneObjektUrl: string | null = null

    // Verwendet bewusst die kleine Miniaturansicht statt des vollständigen
    // Fotos (Version 1.36) - bei einer größeren Sammlung summiert sich der
    // Arbeitsspeicher für 30+ gleichzeitig geladene Vorschaubilder sonst
    // spürbar, siehe Architekturkonzept, Changelog 1.36.
    fotoMiniaturLaden(fotoDateiname).then((url) => {
      eigeneObjektUrl = url
      setFotoUrl(url)
    })

    return () => {
      if (eigeneObjektUrl) URL.revokeObjectURL(eigeneObjektUrl)
    }
  }, [fotoDateiname])

  return fotoUrl
}

interface FilmKarteProps {
  film: Film
  onAnzeigen: (film: Film) => void
  onBearbeiten: (film: Film) => void
  onLoeschen: (id: string) => void
  onVerleihen: (film: Film) => void
}

function FilmKarte({ film, onAnzeigen, onBearbeiten, onLoeschen, onVerleihen }: FilmKarteProps) {
  const fotoUrl = verwendeMiniaturFoto(film.fotoDateiname)

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
          {/* Seit Version 1.47 ohne festes "Staffel"-Präfix: Der Nutzer trägt
              inzwischen selbst die vollständige Bezeichnung (z. B. "Staffel 1")
              in das Staffel-Feld ein, ein zusätzliches Label hier hätte sonst
              zu "Staffel Staffel 1" geführt. Ältere, noch nicht angepasste
              Datensätze mit einer reinen Zahl im Feld zeigen hier bis zur
              manuellen Anpassung entsprechend nur die Zahl ohne Label. */}
          {film.typ === 'Serie' && ` · Serie${film.staffel ? ` (${film.staffel})` : ''}`}
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
          <button type="button" onClick={() => onAnzeigen(film)} title="Anzeigen" aria-label="Anzeigen">
            <AugeIcon />
          </button>
          <button type="button" onClick={() => onBearbeiten(film)} title="Bearbeiten" aria-label="Bearbeiten">
            <StiftIcon />
          </button>
          <button type="button" onClick={() => onVerleihen(film)} title="Verleihen" aria-label="Verleihen">
            <TauschIcon />
          </button>
          <button type="button" onClick={loeschen} className="loeschen" title="Löschen" aria-label="Löschen">
            <PapierkorbIcon />
          </button>
        </div>
      </div>
    </li>
  )
}

// Kurze Beschriftung unter einer Rasterkachel (Version 1.47) - nötig, weil
// insbesondere Box-Sammlungen mehrere Filme mit identischem Frontcover-Foto
// enthalten können, die sich im Raster (im Unterschied zur Liste) sonst rein
// optisch nicht unterscheiden lassen. Nutzt dafür bewusst KEINE eigene
// Erkennung gleicher Cover (dafür müsste man Bilddateien inhaltlich
// vergleichen - unverhältnismäßiger Aufwand), sondern eine vom Nutzer selbst
// bereits gepflegte Titel-Konvention: Bei mehrteiligen Sammlungen trägt er
// den Titel als "<Reihentitel> <Nummer> - <eigentlicher Titel>" ein (z. B.
// "Fast & Furious 1 - The Fast and the Furious"); hier wird nur der Teil vor
// dem ersten " - " gezeigt, das reicht laut Nutzer bereits zur Unterscheidung
// und ist kurz genug für eine einzelne Zeile. Enthält ein Titel dieses
// Trennzeichen nicht (der Normalfall bei eigenständigen Filmen), wird
// einfach der komplette Titel gezeigt (bei Bedarf per CSS einzeilig
// gekürzt). Bei Serien wird stattdessen bevorzugt das Staffel-Feld gezeigt
// (informativer als der Titel, wenn mehrere Staffeln derselben Serie in der
// Sammlung stehen) - ist bei einer Serie ausnahmsweise keine Staffel
// hinterlegt, greift ersatzweise dieselbe Titel-Logik wie oben.
function kachelBeschriftung(film: Film): string {
  if (film.typ === 'Serie' && film.staffel) return film.staffel
  const trennzeichenIndex = film.titel.indexOf(' - ')
  return trennzeichenIndex === -1 ? film.titel : film.titel.slice(0, trennzeichenIndex)
}

// Kachel der Rasteransicht (Version 1.46, Beschriftung seit 1.47): zeigt das
// Frontcover plus die obige Kurzbeschriftung, ein Klick öffnet dasselbe
// Anzeige-Overlay wie der "Anzeigen"-Button in der Listenansicht.
// Ändern/Verleihen/Löschen bleiben bewusst der Listenansicht vorbehalten
// (Nutzeranforderung) - dafür fehlen hier absichtlich die entsprechenden
// Aktionen/Buttons.
interface FilmKachelProps {
  film: Film
  onAnzeigen: (film: Film) => void
}

function FilmKachel({ film, onAnzeigen }: FilmKachelProps) {
  const fotoUrl = verwendeMiniaturFoto(film.fotoDateiname)

  return (
    <li>
      <button
        type="button"
        className="film-kachel"
        onClick={() => onAnzeigen(film)}
        title={film.titel}
        aria-label={`${film.titel} anzeigen`}
      >
        <span className="film-kachel-cover">
          {fotoUrl && <img src={fotoUrl} alt={`Cover von ${film.titel}`} />}
        </span>
        <span className="film-kachel-titel">{kachelBeschriftung(film)}</span>
      </button>
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

function FilmListe({
  filme,
  gesamtAnzahl,
  filter,
  onFilterAendern,
  onBearbeiten,
  onLoeschen,
  onVerleihStatusAendern,
}: Props) {
  // Welcher Film gerade im Anzeige- bzw. Verleih-Overlay offen ist - rein
  // lokaler Anzeigezustand der Liste, muss nicht bis nach App.tsx hochgereicht
  // werden (im Unterschied zu bearbeitenFilm, das dort bleibt, weil das
  // Formular weiterhin dort lebt).
  const [anzeigeFilm, setAnzeigeFilm] = useState<Film | null>(null)
  const [verleihFilm, setVerleihFilm] = useState<Film | null>(null)
  const [sortierung, setSortierung] = useState<Sortierzustand>(sortierungAusSpeicherLesen)
  const [ansicht, setAnsicht] = useState<Ansicht>(ansichtAusSpeicherLesen)

  function ansichtAendern(neu: Ansicht) {
    setAnsicht(neu)
    try {
      window.localStorage.setItem(ANSICHT_SPEICHERSCHLUESSEL, neu)
    } catch {
      // Persistenz ist nur "nice to have" - schlägt das Speichern fehl, bleibt
      // die Auswahl für die laufende Sitzung trotzdem wirksam.
    }
  }

  function feldAendern<K extends keyof Filterzustand>(feld: K, wert: Filterzustand[K]) {
    onFilterAendern({ ...filter, [feld]: wert })
  }

  // Erkennt, ob mindestens ein Filter/eine Suche aktuell tatsächlich
  // eingegrenzt ist - steuert, ob der "Filter zurücksetzen"-Button
  // (Version 1.29) etwas zu tun hätte, oder ob er deaktiviert bleibt, um
  // nicht so zu wirken, als würde ein Klick etwas verändern.
  const filterIstAktiv = JSON.stringify(filter) !== JSON.stringify(FILTER_STANDARD)

  function sortierungAendern(aenderung: Partial<Sortierzustand>) {
    const neueSortierung = { ...sortierung, ...aenderung }
    setSortierung(neueSortierung)
    try {
      window.localStorage.setItem(SORTIERUNG_SPEICHERSCHLUESSEL, JSON.stringify(neueSortierung))
    } catch {
      // Persistenz ist nur "nice to have" - schlägt das Speichern fehl, bleibt
      // die Auswahl für die laufende Sitzung trotzdem wirksam.
    }
  }

  // Sortiert erst hier, nach Suche/Filter (die bereits gefilterte Liste
  // "filme" kommt unverändert von App.tsx). Sekundär wird IMMER zusätzlich
  // nach Erfassungsdatum aufsteigend sortiert, sobald das primäre
  // Sortierfeld bei zwei Filmen gleich ist (z. B. gleicher Titel) - das
  // stellt sicher, dass in der Reihenfolge erfasste Mehrteile (z. B.
  // "Matrix 1"-"Matrix 4") auch bei einer Titel-Sortierung konsistent in
  // Erfassungsreihenfolge bleiben, statt von einer sonst undefinierten
  // Sortier-Reihenfolge bei Gleichstand abzuhängen (siehe Nutzerfeedback).
  const sortierteFilme = useMemo(() => {
    const kopie = [...filme]
    kopie.sort((a, b) => {
      let ergebnis = filmeVergleichen(a, b, sortierung.feld)
      if (sortierung.richtung === 'absteigend') ergebnis = -ergebnis
      if (ergebnis !== 0) return ergebnis
      if (sortierung.feld === 'erfasstAm') return 0
      return a.erfasstAm.localeCompare(b.erfasstAm)
    })
    return kopie
  }, [filme, sortierung])

  return (
    <div>
      <Abschnitt titel="Filter" symbol="▽" badge={filterAktivAnzahl(filter)}>
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

          <input
            type="text"
            value={filter.tags}
            onChange={(ereignis) => feldAendern('tags', ereignis.target.value)}
            placeholder="Tags enthält … (mehrere durch Komma getrennt = ODER)"
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

        <div className="filter-fuss">
          <button type="button" className="sek-btn" onClick={() => onFilterAendern(FILTER_STANDARD)} disabled={!filterIstAktiv}>
            Filter zurücksetzen
          </button>
        </div>
      </Abschnitt>

      <Abschnitt titel="Sortieren" symbol="⇅">
        <div className="sortier-inline">
          <select
            value={sortierung.feld}
            onChange={(ereignis) => sortierungAendern({ feld: ereignis.target.value as Sortierfeld })}
          >
            <option value="titel">Titel</option>
            <option value="erfasstAm">Erfassungsdatum</option>
            <option value="jahr">Erscheinungsjahr</option>
            <option value="fsk">FSK-Freigabe</option>
          </select>

          <select
            value={sortierung.richtung}
            onChange={(ereignis) => sortierungAendern({ richtung: ereignis.target.value as Sortierrichtung })}
            aria-label="Sortierrichtung"
          >
            <option value="aufsteigend">Aufsteigend</option>
            <option value="absteigend">Absteigend</option>
          </select>
        </div>
      </Abschnitt>

      <div className="ansicht-kopf">
        <p className="hint">
          {filme.length} von {gesamtAnzahl} Filmen angezeigt
        </p>

        <div className="ansicht-umschalter">
          <button
            type="button"
            className={ansicht === 'liste' ? 'aktiv' : undefined}
            onClick={() => ansichtAendern('liste')}
            title="Listenansicht"
            aria-label="Listenansicht"
            aria-pressed={ansicht === 'liste'}
          >
            <ListenIcon />
          </button>
          <button
            type="button"
            className={ansicht === 'raster' ? 'aktiv' : undefined}
            onClick={() => ansichtAendern('raster')}
            title="Rasteransicht"
            aria-label="Rasteransicht"
            aria-pressed={ansicht === 'raster'}
          >
            <RasterIcon />
          </button>
        </div>
      </div>

      {filme.length === 0 ? (
        <p className="hint">{gesamtAnzahl === 0 ? 'Noch keine Filme erfasst.' : 'Keine Filme gefunden - Suche/Filter anpassen.'}</p>
      ) : ansicht === 'liste' ? (
        <ul className="film-liste">
          {sortierteFilme.map((film) => (
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
      ) : (
        <ul className="film-raster">
          {sortierteFilme.map((film) => (
            <FilmKachel key={film.id} film={film} onAnzeigen={setAnzeigeFilm} />
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

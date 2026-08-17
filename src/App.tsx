import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import {
  filmeLaden,
  filmAnlegen,
  filmAktualisieren,
  filmLoeschen,
  filmVerleihStatusSetzen,
  FILTER_STANDARD,
  type Film,
  type Filterzustand,
  type Format,
  type Typ,
} from './db/filme'
import { fotoSpeichern, fotoLoeschen, fotoMiniaturSpeichern, fotoMitMiniaturLoeschen } from './db/fotos'
import { sicherungWiederherstellen, type WiederherstellungsErgebnis } from './backup/backup'
import { anmelden, abmelden, angemeldetesKontoLaden } from './auth/msal'
import { synchronisieren } from './sync/sync'
import Abschnitt from './components/Abschnitt'
import Datensicherung from './components/Datensicherung'
import FilmFormular from './components/FilmFormular'
import FilmListe from './components/FilmListe'
import KontoLeiste from './components/KontoLeiste'
import Overlay from './components/Overlay'
import { BUILD_VERSION } from './version'

type LadeStatus = 'laedt' | 'bereit' | 'fehler'

function App() {
  const [filme, setFilme] = useState<Film[]>([])
  const [ladeStatus, setLadeStatus] = useState<LadeStatus>('laedt')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const [bearbeitenFilm, setBearbeitenFilm] = useState<Film | null>(null)
  // Ob das Formular-Overlay im Hinzufügen-Modus offen ist - unabhängig von
  // bearbeitenFilm, das weiterhin den Bearbeitungsmodus abbildet (siehe
  // Ausbaustufe 3, Schritt 3: Formular wandert vom immer sichtbaren
  // Inline-Bereich in ein Overlay, das über einen neuen "Film
  // hinzufügen"-Button bzw. weiterhin über "Bearbeiten" auf der Filmkarte
  // geöffnet wird).
  const [neuFilmOffen, setNeuFilmOffen] = useState(false)
  const [filter, setFilter] = useState<Filterzustand>(FILTER_STANDARD)

  // Microsoft-Anmeldung und OneDrive-Sync (Ausbaustufe 1) - der Zustand
  // dazu lebt bewusst hier in App.tsx statt in KontoLeiste.tsx, weil sowohl
  // die Kontoleiste (Anzeige/manueller Button) als auch die
  // Film-Änderungsfunktionen weiter unten (automatischer Sync nach jeder
  // Änderung, siehe Version 1.17) darauf zugreifen müssen. KontoLeiste.tsx
  // zeigt seitdem nur noch an, was ihr über Props übergeben wird.
  const [konto, setKonto] = useState<AccountInfo | null>(null)
  const [kontoPruefungAbgeschlossen, setKontoPruefungAbgeschlossen] = useState(false)
  const [anmeldungLaeuft, setAnmeldungLaeuft] = useState(false)
  const [syncLaeuft, setSyncLaeuft] = useState(false)
  const [syncHinweis, setSyncHinweis] = useState<string | null>(null)
  const [kontoFehler, setKontoFehler] = useState<string | null>(null)

  // Verhindert, dass zwei Synchronisierungen gleichzeitig laufen (z. B. wenn
  // die Wiederverbindung ausgerechnet passiert, während der Nutzer gerade
  // manuell auf "Jetzt synchronisieren" geklickt hat).
  const syncAktivRef = useRef(false)
  // Hält den aktuellen Anmeldestatus zusätzlich in einer Ref fest, damit der
  // weiter unten registrierte Wiederverbindungs-Listener (der nur einmal
  // beim Start eingerichtet wird) immer den aktuellen Stand sieht, statt
  // dauerhaft den Stand vom allerersten Aufruf zu verwenden.
  const kontoRef = useRef<AccountInfo | null>(null)
  kontoRef.current = konto

  // In eine eigene, wiederverwendbare Funktion ausgelagert (statt direkt im
  // useEffect), damit sie auch nach einem abgeschlossenen OneDrive-Sync
  // erneut aufgerufen werden kann - ohne den Umweg über einen Ladebildschirm,
  // der beim allerersten Laden beim App-Start dagegen weiterhin sinnvoll ist.
  function filmeNeuLaden() {
    return filmeLaden()
      .then((geladeneFilme) => {
        setFilme(geladeneFilme)
        setLadeStatus('bereit')
      })
      .catch((fehler) => {
        console.error(fehler)
        setFehlerText('Die Datenbank konnte nicht geladen werden.')
        setLadeStatus('fehler')
      })
  }

  // Zentrale Sync-Funktion für ALLE automatischen und manuellen Auslöser
  // (App-Start, nach jeder Änderung, Wiederverbindung, manueller Button -
  // siehe Architekturkonzept Abschnitt 3.3). Bricht bewusst leise ab (ohne
  // Fehlermeldung), wenn gar nicht angemeldet oder offline ist - das sind
  // normale, erwartbare Zustände, kein Fehlerfall. Ist eine Änderung offline
  // entstanden, wird sie beim nächsten erfolgreichen Sync automatisch mit
  // übertragen, weil sie ja bereits lokal gespeichert ist - dafür ist keine
  // eigene Warteschlange nötig.
  async function syncAusfuehren() {
    if (syncAktivRef.current || !navigator.onLine || !kontoRef.current) return

    syncAktivRef.current = true
    setSyncLaeuft(true)
    setKontoFehler(null)
    try {
      const ergebnis = await synchronisieren()
      setSyncHinweis(
        ergebnis.anzahlAktualisiert > 0
          ? `Zuletzt synchronisiert: ${ergebnis.anzahlAktualisiert} Film(e) aktualisiert.`
          : 'Zuletzt synchronisiert: alles aktuell.',
      )
      await filmeNeuLaden()
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setKontoFehler(
        'Die Synchronisierung ist fehlgeschlagen. Wird bei der nächsten Gelegenheit automatisch erneut versucht.',
      )
    } finally {
      setSyncLaeuft(false)
      syncAktivRef.current = false
    }
  }

  async function anmeldenHandler() {
    setKontoFehler(null)
    setAnmeldungLaeuft(true)
    try {
      const kontoErgebnis = await anmelden()
      setKonto(kontoErgebnis)
      // Ref direkt setzen (nicht auf den nächsten Render warten), damit der
      // gleich folgende Sync-Aufruf den frischen Anmeldestatus kennt.
      kontoRef.current = kontoErgebnis
      await syncAusfuehren()
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setKontoFehler('Die Anmeldung ist fehlgeschlagen oder wurde abgebrochen. Bitte nochmal versuchen.')
    } finally {
      setAnmeldungLaeuft(false)
    }
  }

  async function abmeldenHandler() {
    setKontoFehler(null)
    try {
      await abmelden()
      setKonto(null)
      kontoRef.current = null
      setSyncHinweis(null)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setKontoFehler('Die Abmeldung ist fehlgeschlagen.')
    }
  }

  useEffect(() => {
    filmeNeuLaden()
  }, [])

  // Prüft beim App-Start, ob bereits eine gültige Microsoft-Anmeldung aus
  // einer früheren Sitzung vorliegt, synchronisiert in diesem Fall sofort
  // (Auslöser "beim Start der Anwendung"), und richtet einen dauerhaften
  // Listener ein, der bei jedem Wechsel von offline zu online automatisch
  // nachsynchronisiert (Auslöser "Wechsel von offline zu online").
  useEffect(() => {
    angemeldetesKontoLaden()
      .then((kontoErgebnis) => {
        setKonto(kontoErgebnis)
        kontoRef.current = kontoErgebnis
        if (kontoErgebnis) syncAusfuehren()
      })
      .catch((fehlerObjekt) => console.error(fehlerObjekt))
      .finally(() => setKontoPruefungAbgeschlossen(true))

    function beiWiederverbindungSynchronisieren() {
      if (kontoRef.current) syncAusfuehren()
    }
    window.addEventListener('online', beiWiederverbindungSynchronisieren)
    return () => window.removeEventListener('online', beiWiederverbindungSynchronisieren)
  }, [])

  async function filmHinzufuegen(eingabe: {
    titel: string
    format: Format
    fassung?: string
    typ: Typ
    staffel?: string
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
    // Zusätzlich zum vollständigen Vorderseiten-Foto eine kleine
    // Miniaturansicht anlegen (Version 1.36) - die wird dann in der
    // Filmliste verwendet, statt dort ebenfalls das vollständige Foto zu
    // laden (siehe Kommentar in fotoMiniaturSpeichern/bild/verkleinern.ts).
    await fotoMiniaturSpeichern(fotoDateiname, eingabe.fotoVorderseite)
    const fotoRueckseiteDateiname = await fotoSpeichern(id, 'rueckseite', eingabe.fotoRueckseite)
    const neuerFilm = await filmAnlegen({
      id,
      titel: eingabe.titel,
      format: eingabe.format,
      fassung: eingabe.fassung,
      typ: eingabe.typ,
      staffel: eingabe.staffel,
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
    // Nicht abgewartet (kein "await") - das Speichern soll nicht auf das
    // Netzwerk warten müssen. syncAusfuehren() bricht von selbst leise ab,
    // falls nicht angemeldet oder offline.
    syncAusfuehren()
  }

  async function filmAktualisierenHandler(eingabe: {
    id: string
    titel: string
    format: Format
    fassung?: string
    typ: Typ
    staffel?: string
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
    neueFotoVorderseite?: File
    neueFotoRueckseite?: File
  }) {
    const { neueFotoVorderseite, neueFotoRueckseite, ...felder } = eingabe
    const bisherigerFilm = filme.find((film) => film.id === eingabe.id)

    // Fotos bleiben standardmäßig unverändert (bisherigen Dateinamen
    // übernehmen) - nur wenn im Formular tatsächlich eine neue Datei
    // ausgewählt wurde (z. B. ein Cover aus einer externen Quelle), wird
    // sie gespeichert und ersetzt die alte, die danach gelöscht wird, damit
    // sich keine verwaisten Foto-Dateien im Browser-Speicher ansammeln.
    let fotoDateiname = bisherigerFilm?.fotoDateiname ?? ''
    let fotoRueckseiteDateiname = bisherigerFilm?.fotoRueckseiteDateiname

    if (neueFotoVorderseite) {
      fotoDateiname = await fotoSpeichern(eingabe.id, 'vorderseite', neueFotoVorderseite)
      await fotoMiniaturSpeichern(fotoDateiname, neueFotoVorderseite)
      if (bisherigerFilm?.fotoDateiname) await fotoMitMiniaturLoeschen(bisherigerFilm.fotoDateiname)
    }
    if (neueFotoRueckseite) {
      fotoRueckseiteDateiname = await fotoSpeichern(eingabe.id, 'rueckseite', neueFotoRueckseite)
      if (bisherigerFilm?.fotoRueckseiteDateiname) await fotoLoeschen(bisherigerFilm.fotoRueckseiteDateiname)
    }

    const aktualisiertesFeldset = { ...felder, fotoDateiname, fotoRueckseiteDateiname }
    await filmAktualisieren(aktualisiertesFeldset)
    setFilme((vorherigeFilme) =>
      vorherigeFilme.map((film) => (film.id === eingabe.id ? { ...film, ...aktualisiertesFeldset } : film)),
    )
    setBearbeitenFilm(null)
    syncAusfuehren()
  }

  function bearbeitenStarten(film: Film) {
    setBearbeitenFilm(film)
  }

  // Schließt das Formular-Overlay wieder, egal ob es gerade im Hinzufügen-
  // oder im Bearbeiten-Modus offen war - z. B. über das X, Klick auf den
  // abgedunkelten Hintergrund, Escape, oder den Abbrechen-Button im Formular.
  function formularSchliessen() {
    setNeuFilmOffen(false)
    setBearbeitenFilm(null)
  }

  async function filmLoeschenHandler(id: string) {
    await filmLoeschen(id)
    setFilme((vorherigeFilme) => vorherigeFilme.filter((film) => film.id !== id))
    if (bearbeitenFilm?.id === id) setBearbeitenFilm(null)
    syncAusfuehren()
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
    syncAusfuehren()
  }

  // Wiederherstellung aus einer ZIP-Datensicherung (Ausbaustufe 4). Die
  // eigentliche Wiederherstellungslogik (ZIP einlesen, lokale Datenbank
  // ersetzen) steckt in sicherungWiederherstellen() - hier kommen danach
  // nur noch die beiden Schritte dazu, die auch nach jeder anderen Änderung
  // passieren: den neuen Stand aus der Datenbank in den React-Zustand laden
  // (filmeNeuLaden, hier bewusst abgewartet statt wie sonst nur angestoßen,
  // damit die Filmliste sicher aktualisiert ist, bevor der Erfolgshinweis
  // erscheint) und einen Sync anstoßen, damit der wiederhergestellte Stand
  // auch in OneDrive ankommt (siehe filmeAusSicherungWiederherstellen in
  // db/filme.ts für die Begründung, warum das nötig ist).
  async function sicherungWiederherstellenHandler(zipDatei: File): Promise<WiederherstellungsErgebnis> {
    const ergebnis = await sicherungWiederherstellen(zipDatei)
    await filmeNeuLaden()
    syncAusfuehren()
    return ergebnis
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
      if (filter.typ && film.typ !== filter.typ) return false
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
      <h1>
        Filmsammlung <span className="build-version">Build {BUILD_VERSION}</span>
      </h1>

      {/* "Verwaltung" (Ausbaustufe 3, Feinschliff/Version 1.32): fasst alles
          Administrative - Konto-/Sync-Status und -Aktionen sowie die
          Datensicherung - in einem einzigen, standardmäßig eingeklappten
          Abschnitt zusammen, statt wie zuvor als eigenständige, immer
          sichtbare Leisten (siehe Mockup-Abstimmung zum Kopfbereich). Die
          beiden Bauteile bleiben dabei unverändert eigenständig - nur die
          Kopfzeile mit Ein-/Ausklappen kommt von außen (Abschnitt.tsx)
          dazu, getrennt durch eine einfache Trennlinie. */}
      <Abschnitt titel="Verwaltung" symbol="⚙">
        <KontoLeiste
          konto={konto}
          pruefungAbgeschlossen={kontoPruefungAbgeschlossen}
          anmeldungLaeuft={anmeldungLaeuft}
          syncLaeuft={syncLaeuft}
          syncHinweis={syncHinweis}
          fehler={kontoFehler}
          onAnmelden={anmeldenHandler}
          onAbmelden={abmeldenHandler}
          onSynchronisieren={syncAusfuehren}
        />
        <hr className="verwaltung-trenner" />
        <Datensicherung onWiederherstellen={sicherungWiederherstellenHandler} />
      </Abschnitt>

      {ladeStatus === 'laedt' && <p className="hint">Datenbank wird geladen …</p>}
      {ladeStatus === 'fehler' && <p className="fehler">{fehlerText}</p>}

      {ladeStatus === 'bereit' && (
        <>
          <button type="button" className="film-hinzufuegen" onClick={() => setNeuFilmOffen(true)}>
            Film hinzufügen
          </button>

          <FilmListe
            filme={gefilterteFilme}
            gesamtAnzahl={filme.length}
            filter={filter}
            onFilterAendern={setFilter}
            onBearbeiten={bearbeitenStarten}
            onLoeschen={filmLoeschenHandler}
            onVerleihStatusAendern={verleihStatusAendernHandler}
          />

          {(neuFilmOffen || bearbeitenFilm) && (
            <Overlay
              titel={bearbeitenFilm ? `„${bearbeitenFilm.titel}“ bearbeiten` : 'Film hinzufügen'}
              onSchliessen={formularSchliessen}
            >
              <FilmFormular
                bearbeitenFilm={bearbeitenFilm}
                onHinzufuegen={filmHinzufuegen}
                onAktualisieren={filmAktualisierenHandler}
                onAbbrechen={formularSchliessen}
              />
            </Overlay>
          )}
        </>
      )}
    </div>
  )
}

export default App

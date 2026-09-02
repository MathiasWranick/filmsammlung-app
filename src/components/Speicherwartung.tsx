import { useState } from 'react'
import type { VerkleinerungsErgebnis } from '../wartung/fotosVerkleinern'
import { oneDriveSpeicherPruefen, verwaisteOneDriveFotosLoeschen, type OneDriveUebersicht } from '../wartung/oneDriveAufraeumen'

interface Props {
  // Die eigentliche Verkleinerungslogik (siehe wartung/fotosVerkleinern.ts)
  // lebt bewusst in App.tsx, nicht hier - genau wie bei Datensicherung.tsx -
  // weil danach die Filmliste neu geladen und ein Sync angestoßen werden
  // muss, wofür App.tsx bereits die passenden Funktionen (filmeNeuLaden,
  // syncAusfuehren) bereithält. Die OneDrive-Speicherübersicht/Aufräum-
  // Funktion braucht das dagegen nicht (sie verändert weder die lokale
  // Filmliste noch etwas, das erst noch synchronisiert werden müsste) und
  // ruft ihre Funktionen deshalb direkt selbst auf.
  onBestandsfotosVerkleinern: (
    fortschritt: (erledigt: number, gesamt: number) => void,
  ) => Promise<VerkleinerungsErgebnis>
}

function alsMegabyte(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

// Zwei zusammengehörige, aber unabhängig auslösbare Wartungs-Aktionen rund
// um den Foto-Speicherbedarf (Version 1.51, siehe Architekturkonzept,
// Abschnitt 3.3, zum Hintergrund - Opera-Speicherproblem): Erstens die
// einmalige Verkleinerung bereits vorhandener Bestandsfotos auf die aktuelle
// Zielgröße. Zweitens eine Übersicht über den tatsächlichen OneDrive-
// Speicherbedarf mit der Möglichkeit, dabei erkannte, nicht mehr
// referenzierte ("verwaiste") Fotos gezielt zu löschen.
function Speicherwartung({ onBestandsfotosVerkleinern }: Props) {
  const [wirdVerkleinert, setWirdVerkleinert] = useState(false)
  const [fortschritt, setFortschritt] = useState<{ erledigt: number; gesamt: number } | null>(null)
  const [verkleinerungHinweis, setVerkleinerungHinweis] = useState<string | null>(null)
  const [verkleinerungFehler, setVerkleinerungFehler] = useState<string | null>(null)

  const [wirdGeprueft, setWirdGeprueft] = useState(false)
  const [uebersicht, setUebersicht] = useState<OneDriveUebersicht | null>(null)
  const [pruefFehler, setPruefFehler] = useState<string | null>(null)
  const [wirdAufgeraeumt, setWirdAufgeraeumt] = useState(false)
  const [aufraeumHinweis, setAufraeumHinweis] = useState<string | null>(null)
  const [aufraeumFehler, setAufraeumFehler] = useState<string | null>(null)

  async function verkleinerungStarten() {
    setVerkleinerungFehler(null)
    setVerkleinerungHinweis(null)
    setFortschritt(null)
    setWirdVerkleinert(true)
    try {
      const ergebnis = await onBestandsfotosVerkleinern((erledigt, gesamt) => setFortschritt({ erledigt, gesamt }))
      let text =
        ergebnis.anzahlFotosVerkleinert > 0
          ? `${ergebnis.anzahlFilmeGeprueft} Film(e) geprüft, bei ${ergebnis.anzahlFilmeAktualisiert} davon insgesamt ${ergebnis.anzahlFotosVerkleinert} Foto(s) verkleinert.`
          : `${ergebnis.anzahlFilmeGeprueft} Film(e) geprüft, alle Fotos waren bereits klein genug.`
      if (ergebnis.anzahlFehlgeschlagen > 0) {
        text += ` ${ergebnis.anzahlFehlgeschlagen} Film(e) sind dabei fehlgeschlagen (Details siehe Konsole).`
      }
      setVerkleinerungHinweis(text)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setVerkleinerungFehler('Die Verkleinerung ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdVerkleinert(false)
      setFortschritt(null)
    }
  }

  async function oneDrivePruefenHandler() {
    setPruefFehler(null)
    setAufraeumHinweis(null)
    setAufraeumFehler(null)
    setWirdGeprueft(true)
    try {
      setUebersicht(await oneDriveSpeicherPruefen())
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setPruefFehler('Die OneDrive-Speicherübersicht konnte nicht geladen werden (angemeldet und online?).')
    } finally {
      setWirdGeprueft(false)
    }
  }

  async function aufraeumenHandler() {
    if (!uebersicht || uebersicht.verwaisteDateien.length === 0) return

    // Deutliche Warnung mit konkreten Zahlen, da dies OneDrive-Dateien
    // löscht (wenn auch in den dortigen Papierkorb, siehe
    // fotoInOneDriveLoeschen in graph.ts) - gleiches Muster wie bei der
    // Wiederherstellung aus einer Datensicherung (siehe Datensicherung.tsx).
    const bestaetigt = window.confirm(
      `${uebersicht.verwaisteDateien.length} nicht mehr referenzierte Foto(s) (ca. ${alsMegabyte(
        uebersicht.groesseVerwaistBytes,
      )} MB) werden aus OneDrive gelöscht. Sie landen dabei im regulären OneDrive-Papierkorb. Wirklich fortfahren?`,
    )
    if (!bestaetigt) return

    setAufraeumFehler(null)
    setAufraeumHinweis(null)
    setWirdAufgeraeumt(true)
    try {
      const ergebnis = await verwaisteOneDriveFotosLoeschen(uebersicht.verwaisteDateien)
      setAufraeumHinweis(
        ergebnis.anzahlFehlgeschlagen > 0
          ? `${ergebnis.anzahlGeloescht} Datei(en) gelöscht, ${ergebnis.anzahlFehlgeschlagen} fehlgeschlagen (Details siehe Konsole).`
          : `${ergebnis.anzahlGeloescht} Datei(en) gelöscht.`,
      )
      // Übersicht danach neu laden statt optimistisch anzunehmen, dass
      // wirklich alles wie erwartet gelöscht wurde - zeigt den tatsächlichen
      // neuen Stand, auch wenn oben einzelne Löschungen fehlgeschlagen sind.
      setUebersicht(await oneDriveSpeicherPruefen())
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setAufraeumFehler('Das Aufräumen ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdAufgeraeumt(false)
    }
  }

  return (
    <div className="speicherwartung">
      <div className="speicherwartung-zeile">
        <button type="button" className="sek-btn" onClick={verkleinerungStarten} disabled={wirdVerkleinert}>
          {wirdVerkleinert
            ? fortschritt
              ? `Verkleinere Fotos … (${fortschritt.erledigt} von ${fortschritt.gesamt})`
              : 'Verkleinerung wird gestartet …'
            : 'Bestandsfotos verkleinern'}
        </button>
        {verkleinerungHinweis && <span className="hint">{verkleinerungHinweis}</span>}
        {verkleinerungFehler && <p className="fehler">{verkleinerungFehler}</p>}
      </div>

      <div className="speicherwartung-zeile">
        <button type="button" className="sek-btn" onClick={oneDrivePruefenHandler} disabled={wirdGeprueft}>
          {wirdGeprueft ? 'Wird geprüft …' : 'OneDrive-Speicherbedarf prüfen'}
        </button>
        {pruefFehler && <p className="fehler">{pruefFehler}</p>}
        {uebersicht && (
          <span className="hint">
            {uebersicht.anzahlReferenziert} referenzierte(s) Foto(s), ca. {alsMegabyte(uebersicht.groesseReferenziertBytes)}{' '}
            MB
            {uebersicht.verwaisteDateien.length > 0 &&
              ` · ${uebersicht.verwaisteDateien.length} nicht mehr referenzierte(s) Foto(s), ca. ${alsMegabyte(
                uebersicht.groesseVerwaistBytes,
              )} MB`}
          </span>
        )}
        {uebersicht && uebersicht.verwaisteDateien.length > 0 && (
          <button type="button" className="sek-btn" onClick={aufraeumenHandler} disabled={wirdAufgeraeumt}>
            {wirdAufgeraeumt ? 'Wird aufgeräumt …' : `Verwaiste Fotos löschen (${uebersicht.verwaisteDateien.length})`}
          </button>
        )}
        {aufraeumHinweis && <span className="hint">{aufraeumHinweis}</span>}
        {aufraeumFehler && <p className="fehler">{aufraeumFehler}</p>}
      </div>
    </div>
  )
}

export default Speicherwartung

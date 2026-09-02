// Verkleinert nachträglich die Fotos bereits vorhandener Filme auf die
// aktuelle Zielgröße (Version 1.51, siehe FOTO_MAX_KANTE in db/fotos.ts).
// Hintergrund: Die im August 2026 auf 1600px gesenkte, seit Version 1.51 auf
// 1200px reduzierte Zielgröße gilt automatisch nur für NEU erfasste Fotos -
// bereits gespeicherte Bestandsfotos (teils sogar aus einer noch früheren
// Version ohne jede Verkleinerung) bleiben davon unberührt, obwohl gerade
// sie den lokalen Speicherbedarf dominieren (siehe Architekturkonzept,
// Abschnitt 3.3, zum ursprünglichen Opera-Speicherproblem). Diese einmalig
// anzustoßende Aktion holt das nach: für jeden Film wird geprüft, ob
// Vorder- und/oder Rückseiten-Foto die Zielgröße überschreiten, und nur in
// diesem Fall neu komprimiert.
//
// Technisch dieselbe Vorgehensweise wie beim manuellen Foto-Austausch im
// Bearbeiten-Formular (siehe filmAktualisierenHandler in App.tsx): Das neue,
// kleinere Foto bekommt einen neuen, zeitstempel-eindeutigen Dateinamen,
// der Datensatz wird darauf aktualisiert (was automatisch auch "zuletzt
// geändert" auf jetzt setzt), und erst danach wird die alte, größere Datei
// lokal gelöscht - in dieser Reihenfolge, damit im Fehlerfall nie eine
// Datei ganz verloren geht. Die automatisch aktualisierte Zeitstempel sorgt
// dafür, dass der bereits bestehende Sync-Mechanismus (siehe sync/sync.ts)
// die verkleinerten Fotos ganz ohne eigens dafür geschriebene Logik zu
// OneDrive hochlädt und von dort auf andere Geräte verteilt.
//
// Bewusst nacheinander statt parallel verarbeitet: Anders als die reinen
// Existenzprüfungen beim Sync (siehe parallelMitObergrenze in sync.ts) ist
// das Verkleinern selbst CPU-lastig (Bild dekodieren, auf eine Leinwand
// zeichnen, neu komprimieren) - im Browser-Hauptthread bringt Parallelität
// hierfür keinen echten Geschwindigkeitsvorteil, macht den Ablauf aber
// unnötig komplizierter. Da es sich um eine seltene, einmalige Wartungs-
// Aktion handelt, ist die reine Laufzeit zudem zweitrangig.

import { filmeLaden, filmAktualisieren, type Film, type FilmAktualisierenEingabe } from '../db/filme'
import {
  fotoAlsDateiLaden,
  fotoSpeichern,
  fotoMiniaturSpeichern,
  fotoMitMiniaturLoeschen,
  fotoLoeschen,
  FOTO_MAX_KANTE,
} from '../db/fotos'
import { bildVerkleinern, bildUeberschreitetKante } from '../bild/verkleinern'

export interface VerkleinerungsErgebnis {
  anzahlFilmeGeprueft: number
  anzahlFilmeAktualisiert: number
  anzahlFotosVerkleinert: number
  anzahlFehlgeschlagen: number
}

interface SeitenErgebnis {
  dateiname: string | undefined
  verkleinert: boolean
}

// Prüft und verkleinert bei Bedarf ein einzelnes Foto (Vorder- oder
// Rückseite). Bleibt die Datei unangetastet, wird schlicht der bisherige
// Dateiname zurückgegeben.
async function seiteBeiBedarfVerkleinern(
  filmId: string,
  seite: 'vorderseite' | 'rueckseite',
  bisherigerDateiname: string | undefined,
): Promise<SeitenErgebnis> {
  if (!bisherigerDateiname) return { dateiname: bisherigerDateiname, verkleinert: false }

  const datei = await fotoAlsDateiLaden(bisherigerDateiname)
  const ueberschritten = await bildUeberschreitetKante(datei, FOTO_MAX_KANTE)
  if (!ueberschritten) return { dateiname: bisherigerDateiname, verkleinert: false }

  const verkleinerteDatei = await bildVerkleinern(datei, FOTO_MAX_KANTE)
  const neuerDateiname = await fotoSpeichern(filmId, seite, verkleinerteDatei)

  if (seite === 'vorderseite') {
    // Die Miniaturansicht wird aus dem neuen, bereits verkleinerten Foto neu
    // erzeugt (nicht aus dem Original) - das ist für die Miniatur-Erzeugung
    // selbst unerheblich (sie skaliert ohnehin auf 400px herunter), spart
    // hier aber unnötiges erneutes Lesen der Originaldatei.
    await fotoMiniaturSpeichern(neuerDateiname, verkleinerteDatei)
    await fotoMitMiniaturLoeschen(bisherigerDateiname)
  } else {
    await fotoLoeschen(bisherigerDateiname)
  }

  return { dateiname: neuerDateiname, verkleinert: true }
}

// Baut aus einem geladenen Film plus den (ggf. neuen) Foto-Dateinamen genau
// das Eingabe-Objekt, das filmAktualisieren() erwartet - explizit statt per
// Objekt-Spread, weil Film zusätzliche, dort nicht erlaubte Felder trägt
// (erfasstAm, geloeschtAm, ausgeliehenAn/-Am).
function eingabeFuerAktualisierung(
  film: Film,
  fotoDateiname: string,
  fotoRueckseiteDateiname: string | undefined,
): FilmAktualisierenEingabe {
  return {
    id: film.id,
    titel: film.titel,
    format: film.format,
    fassung: film.fassung,
    typ: film.typ,
    staffel: film.staffel,
    fotoDateiname,
    fotoRueckseiteDateiname,
    fsk: film.fsk,
    laufzeitMinuten: film.laufzeitMinuten,
    barcode: film.barcode,
    regisseur: film.regisseur,
    darsteller: film.darsteller,
    handlung: film.handlung,
    originaltitel: film.originaltitel,
    jahr: film.jahr,
    genre: film.genre,
    produktionsland: film.produktionsland,
    sprache: film.sprache,
    imdbBewertung: film.imdbBewertung,
    tags: film.tags,
  }
}

// Geht die komplette (nicht gelöschte) Sammlung durch und verkleinert bei
// Bedarf die Fotos. "fortschritt" wird nach jedem geprüften Film aufgerufen
// (für eine Fortschrittsanzeige in der Oberfläche, siehe Speicherwartung.tsx).
// Ein Fehler bei einem einzelnen Film bricht die gesamte Aktion nicht ab -
// er wird übersprungen und am Ende mitgezählt (gleiches Prinzip wie bei
// Datensicherung/Wiederherstellung, siehe backup/backup.ts).
export async function bestandsfotosVerkleinern(
  fortschritt?: (erledigt: number, gesamt: number) => void,
): Promise<VerkleinerungsErgebnis> {
  const filme = await filmeLaden()

  let anzahlFilmeAktualisiert = 0
  let anzahlFotosVerkleinert = 0
  let anzahlFehlgeschlagen = 0

  for (let i = 0; i < filme.length; i++) {
    const film = filme[i]
    try {
      const vorderseite = await seiteBeiBedarfVerkleinern(film.id, 'vorderseite', film.fotoDateiname)
      const rueckseite = await seiteBeiBedarfVerkleinern(film.id, 'rueckseite', film.fotoRueckseiteDateiname)

      if (vorderseite.verkleinert || rueckseite.verkleinert) {
        await filmAktualisieren(
          eingabeFuerAktualisierung(film, vorderseite.dateiname ?? film.fotoDateiname, rueckseite.dateiname),
        )
        anzahlFilmeAktualisiert += 1
        anzahlFotosVerkleinert += (vorderseite.verkleinert ? 1 : 0) + (rueckseite.verkleinert ? 1 : 0)
      }
    } catch (fehlerObjekt) {
      console.error(`Fotos von "${film.titel}" konnten nicht verkleinert werden:`, fehlerObjekt)
      anzahlFehlgeschlagen += 1
    }
    fortschritt?.(i + 1, filme.length)
  }

  return { anzahlFilmeGeprueft: filme.length, anzahlFilmeAktualisiert, anzahlFotosVerkleinert, anzahlFehlgeschlagen }
}

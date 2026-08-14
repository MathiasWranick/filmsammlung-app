// Herzstück von Ausbaustufe 1 (Version 1.16): Führt die lokale Datenbank
// mit dem Stand in OneDrive zusammen. Die Strategie ist bewusst einfach
// gehalten (siehe Architekturkonzept, Abschnitt 3.3):
//
// - Pro Film (nicht die ganze Datei auf einmal) wird verglichen, welche
//   Version - lokal oder aus der Cloud - zuletzt geändert wurde
//   ("zuletztGeaendert", ein ISO-8601-Zeitstempel, der sich direkt als Text
//   vergleichen lässt, weil das Format immer gleich lang ist).
// - Ein Film, der nur auf einer Seite existiert (z. B. weil er gerade erst
//   auf einem anderen Gerät angelegt wurde), "gewinnt" automatisch.
// - Gelöschte Filme bleiben als Grabstein (geloeschtAm gesetzt) erhalten,
//   damit die Löschung auch auf Geräte übertragen wird, die zum
//   Löschzeitpunkt offline waren.
// - Fotos werden in Richtung des jeweiligen "Gewinners" abgeglichen, aber
//   nur, wenn sie auf der Zielseite noch fehlen (Existenzprüfung genügt
//   dank der zeitstempel-eindeutigen Dateinamen aus Version 1.13 - siehe
//   fotos.ts).
//
// Bekannte, bewusst in Kauf genommene Einschränkung dieser ersten Version:
// Wird ein Foto ersetzt, bleibt die alte Datei in OneDrive liegen (lokal
// wird sie dagegen aufgeräumt, siehe fotoLoeschen in fotos.ts). Das kostet
// etwas zusätzlichen Speicherplatz in OneDrive, verursacht aber keine
// falschen Anzeigen - eine Bereinigung kann bei Bedarf als späterer,
// kleiner Ausbauschritt nachgerüstet werden.

import { filmeFuerSyncLaden, filmeSyncStapelSchreiben, type Film } from '../db/filme'
import { fotoExistiertLokal, fotoAlsDateiLaden, fotoRohSpeichern } from '../db/fotos'
import {
  syncDatenLesen,
  syncDatenSchreiben,
  fotoHochladen,
  fotoHerunterladen,
  fotoExistiertInOneDrive,
} from './graph'

interface SyncDaten {
  filme: Film[]
}

function istSyncDaten(wert: unknown): wert is SyncDaten {
  return typeof wert === 'object' && wert !== null && Array.isArray((wert as SyncDaten).filme)
}

// Gleicht ein einzelnes Foto in die Richtung des "Gewinners" ab: Kommt der
// Gewinner-Datensatz von lokal, wird das Foto (falls in OneDrive noch
// nicht vorhanden) hochgeladen; kommt er aus der Cloud, wird das Foto
// (falls lokal noch nicht vorhanden) heruntergeladen.
async function fotoAbgleichen(dateiname: string | undefined, quelle: 'lokal' | 'remote'): Promise<void> {
  if (!dateiname) return

  if (quelle === 'lokal') {
    const bereitsRemoteVorhanden = await fotoExistiertInOneDrive(dateiname)
    if (bereitsRemoteVorhanden) return
    const datei = await fotoAlsDateiLaden(dateiname)
    await fotoHochladen(dateiname, datei)
  } else {
    const bereitsLokalVorhanden = await fotoExistiertLokal(dateiname)
    if (bereitsLokalVorhanden) return
    const daten = await fotoHerunterladen(dateiname)
    await fotoRohSpeichern(dateiname, daten)
  }
}

// Führt einen vollständigen Sync-Durchlauf aus: lädt lokalen und
// entfernten Stand, führt sie pro Film zusammen, gleicht die betroffenen
// Fotos ab, schreibt die "verlierenden" Filme lokal nach und schreibt den
// zusammengeführten Gesamtstand zurück nach OneDrive.
export async function synchronisieren(): Promise<{ anzahlAktualisiert: number }> {
  const [lokaleFilme, remoteDatenRoh] = await Promise.all([filmeFuerSyncLaden(), syncDatenLesen()])
  const remoteFilme = istSyncDaten(remoteDatenRoh) ? remoteDatenRoh.filme : []

  const lokalNachId = new Map(lokaleFilme.map((film) => [film.id, film]))
  const remoteNachId = new Map(remoteFilme.map((film) => [film.id, film]))
  const alleIds = new Set([...lokalNachId.keys(), ...remoteNachId.keys()])

  const zusammengefuehrteFilme: Film[] = []
  const lokalZuAktualisieren: Film[] = []
  let anzahlAktualisiert = 0

  for (const id of alleIds) {
    const lokal = lokalNachId.get(id)
    const remote = remoteNachId.get(id)

    let gewinner: Film
    let gewinnerQuelle: 'lokal' | 'remote'

    if (lokal && remote) {
      const lokalIstNeuerOderGleich = lokal.zuletztGeaendert >= remote.zuletztGeaendert
      gewinner = lokalIstNeuerOderGleich ? lokal : remote
      gewinnerQuelle = lokalIstNeuerOderGleich ? 'lokal' : 'remote'
    } else if (lokal) {
      gewinner = lokal
      gewinnerQuelle = 'lokal'
    } else {
      gewinner = remote as Film
      gewinnerQuelle = 'remote'
    }

    zusammengefuehrteFilme.push(gewinner)
    await fotoAbgleichen(gewinner.fotoDateiname, gewinnerQuelle)
    await fotoAbgleichen(gewinner.fotoRueckseiteDateiname, gewinnerQuelle)

    // Nur wenn die Cloud-Version gewonnen hat (oder der Film lokal noch gar
    // nicht existierte), muss lokal etwas nachgeschrieben werden - war die
    // lokale Version bereits aktuell oder führend, ist dort nichts zu tun.
    if (!lokal || gewinnerQuelle === 'remote') {
      lokalZuAktualisieren.push(gewinner)
      anzahlAktualisiert++
    }
  }

  if (lokalZuAktualisieren.length > 0) {
    await filmeSyncStapelSchreiben(lokalZuAktualisieren)
  }

  await syncDatenSchreiben({ filme: zusammengefuehrteFilme })

  return { anzahlAktualisiert }
}

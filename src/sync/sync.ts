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
//
// Version 1.53 - die von OneDrive gelesenen Rohdaten werden jetzt zusätzlich
// als blankes Array akzeptiert (nicht nur als Objekt mit "filme"-Feld) -
// siehe remoteFilmeAusRohdaten() unten. Hintergrund: Genau dieses Array-
// Format erzeugt auch die Datensicherung (backup/backup.ts), und ein Nutzer
// wollte im Notfall (vermutete beschädigte OneDrive-Datenbank) genau diese
// Backup-JSON von Hand direkt als OneDrive-Sync-Datei hochladen - naheliegend,
// da sie ja bereits den vollständigen Bestand enthält. Ohne diese Toleranz
// wurde das schlicht wie "noch keine Cloud-Daten vorhanden" behandelt (siehe
// remoteFilmeAusRohdaten() für die technische Erläuterung) - unschädlich,
// aber eben nicht das erwartete, sofort korrekt erkannte Verhalten.
//
// Version 1.52 - zwei Korrekturen, ausgelöst durch einen dauerhaft
// fehlschlagenden Erst-Sync (leere lokale Datenbank, z. B. Opera):
//
// 1. Für bereits gelöschte Filme (geloeschtAm gesetzt, "Grabstein" - siehe
//    Kommentar oben) wurde bislang trotzdem versucht, das zugehörige Foto zu
//    prüfen/herunterzuladen, obwohl ein gelöschter Film nirgends mehr
//    angezeigt wird und sein Foto folglich niemand mehr braucht. Bis
//    Version 1.51 fiel das nie auf, weil das Foto ja ohnehin noch in
//    OneDrive lag - seit es die Aufräum-Funktion für verwaiste Fotos gibt
//    (wartung/oneDriveAufraeumen.ts, die Fotos gelöschter Filme bewusst als
//    verwaist einstuft und entfernen darf), kann genau dieses Foto inzwischen
//    aber tatsächlich fehlen. Ein einzelner gelöschter Film mit fehlendem
//    Foto blockierte dadurch den KOMPLETTEN Sync - und zwar dauerhaft, weil
//    sich an der fehlenden Datei ja nichts ändert und der Fehler bei jedem
//    weiteren Versuch identisch wiederkehrt. Foto-Prüfungen laufen deshalb ab
//    sofort nur noch für Filme, die (im jeweiligen Sync-Durchlauf) NICHT als
//    gelöscht gelten.
// 2. Unabhängig davon, als zusätzliche Absicherung für jeden anderen,
//    unvorhergesehenen Fall: Ein einzelnes fehlgeschlagenes Foto (Download
//    oder Upload) bricht den Sync nicht mehr komplett ab, sondern wird
//    übersprungen und gezählt (gleiches Prinzip wie bei Datensicherung,
//    Bestands-Verkleinerung und OneDrive-Aufräumen). Der "letzter
//    erfolgreicher Sync"-Zeitstempel (siehe unten) wird dabei bewusst NUR
//    gesetzt, wenn wirklich jedes Foto in diesem Durchlauf geglückt ist -
//    sonst würde das betroffene Foto beim nächsten Sync fälschlich als
//    "schon geprüft" übersprungen und die Lücke bliebe unbemerkt dauerhaft
//    bestehen. Siehe Architekturkonzept, Änderungshistorie Version 1.52.
//
// Version 1.49 - zwei Verbesserungen gegen einen vom Nutzer als spürbar
// langsam gemeldeten Sync bei größerer Sammlung:
//
// 1. Foto-Existenzprüfungen liefen bisher für JEDEN Film der Sammlung bei
//    JEDEM Sync, unabhängig davon, ob sich an diesem Film überhaupt etwas
//    geändert hatte. Da Fotos bei der Erfassung Pflicht sind, gilt: Ein
//    Film, der sich seit dem letzten nachweislich vollständig erfolgreichen
//    Sync nicht verändert hat, wurde bei genau jenem Durchlauf bereits
//    bestätigt abgeglichen und muss nicht erneut geprüft werden. Dafür wird
//    lokal (siehe letzterErfolgreicherSyncLesen/-Schreiben unten) der
//    Zeitpunkt des letzten komplett fehlerfrei durchgelaufenen Syncs
//    gespeichert - und zwar bewusst erst ganz am Ende von
//    synchronisieren(), nachdem wirklich jeder Schritt geglückt ist. Jeder
//    Fehlschlag (egal ob der Sync gar nicht erst richtig anlief oder
//    mittendrin abbrach) lässt diesen Zeitpunkt dadurch automatisch
//    unverändert stehen, ganz ohne die beiden Fälle eigens unterscheiden zu
//    müssen: Beim nächsten Versuch werden dann wieder alle Filme geprüft,
//    die seit diesem letzten bestätigten Stand irgendwo geändert wurden.
//    Gibt es (noch) keinen gespeicherten Zeitpunkt (erster Sync auf einem
//    Gerät, oder der Wert ging z. B. durch eine Browser-Datenlöschung
//    verloren), werden sicherheitshalber wieder alle Filme geprüft - der
//    unkritische, nur etwas langsamere Normalfall.
// 2. Die dadurch tatsächlich noch nötigen Prüfungen laufen jetzt mit
//    begrenzter Gleichzeitigkeit statt streng nacheinander (siehe
//    GLEICHZEITIGKEIT_FOTOS/parallelMitObergrenze unten) - komplett
//    unbegrenzt parallel würde bei einer großen Sammlung (Zielbestand ca.
//    1.000 Filme) das Risiko einer Anfragen-Drosselung durch Microsoft
//    Graph bergen.

import { angemeldetesKontoLaden } from '../auth/msal'
import { filmeFuerSyncLaden, filmeSyncStapelSchreiben, type Film } from '../db/filme'
import {
  fotoExistiertLokal,
  fotoAlsDateiLaden,
  fotoRohSpeichern,
  fotoLoeschen,
  fotoMitMiniaturLoeschen,
} from '../db/fotos'
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

// Liest die Filmliste aus den rohen, von OneDrive gelesenen Daten - seit
// Version 1.53 zusätzlich tolerant gegenüber einem blanken Array (ohne
// umschließendes "filme"-Feld), weil genau dieses Format auch die
// Datensicherung erzeugt (siehe backup/backup.ts, "filme.json" in der ZIP -
// bewusst ein reines Array, u. a. damit eine komplett lokale Wiederher-
// stellung ganz ohne OneDrive möglich bleibt). Hintergrund: Ein Praxisfall
// zeigte, dass ein Nutzer im Notfall (vermutete beschädigte OneDrive-
// Datenbank) genau diese Backup-JSON von Hand direkt als OneDrive-Sync-Datei
// hochladen wollte - naheliegend, schließlich enthält sie ja bereits den
// vollständigen Datenbestand. Ohne diese Toleranz erkannte die App das
// (technisch andersartig geformte) Ergebnis nicht als gültige Sync-Daten und
// behandelte es sicherheitshalber wie "noch keine Cloud-Daten vorhanden" -
// technisch unschädlich (siehe unten, ein Sync-Durchlauf "heilt" das von
// selbst wieder, da am Ende ohnehin immer im Objekt-Format zurückgeschrieben
// wird), aber eben nicht das erwartete, sofort korrekt erkannte Verhalten.
// Das Backup-Format selbst bleibt davon unverändert.
function remoteFilmeAusRohdaten(wert: unknown): Film[] {
  if (Array.isArray(wert)) return wert as Film[]
  if (istSyncDaten(wert)) return wert.filme
  return []
}

// Speicherschlüssel für den Zeitpunkt des letzten vollständig erfolgreich
// abgeschlossenen Syncs (Version 1.49). Bewusst NICHT wie Sortierung/Ansicht
// (siehe FilmListe.tsx) eine reine Anzeige-Einstellung, sondern eine für die
// Sync-Optimierung sicherheitsrelevante Information - siehe Erläuterung am
// Dateianfang. Ebenfalls bewusst rein lokal je Gerät (localStorage, nicht
// über den Sync geteilt): Der Wert soll ausschließlich beschreiben, was
// DIESES Gerät zuletzt selbst bestätigt bekommen hat.
//
// Seit Version 1.50 bewusst je Microsoft-Konto getrennt (Schlüssel enthält
// die stabile Konto-ID) statt ein einziger, globaler Wert: Ein Praxistest
// zeigte, dass sich sonst ein (versehentlich per Windows-Single-Sign-On
// verbundenes) FALSCHES Konto und das eigentlich richtige Konto denselben
// Zeitpunkt "teilten" - ein technisch fehlerfrei durchgelaufener Sync gegen
// das falsche, leere Konto wurde dadurch fälschlich auch als Bestätigung
// für das richtige Konto gewertet, wodurch dort tatsächlich fehlende Fotos
// übersehen (nicht heruntergeladen) wurden. Getrennte Zeitpunkte je Konto
// schließen das aus: Ein Sync gegen ein Konto kann jetzt nie mehr fälschlich
// für ein anderes Konto "bürgen". Siehe Architekturkonzept, Änderungs-
// historie Version 1.50.
function letzterErfolgreicherSyncSpeicherschluessel(kontoId: string): string {
  return `filmsammlung-letzter-erfolgreicher-sync:${kontoId}`
}

// In try/catch, weil manche Browser (z. B. Safari im privaten Modus) den
// Zugriff auf localStorage verweigern können - dann greift einfach der
// sichere Normalfall (alle Fotos werden geprüft, siehe synchronisieren()).
function letzterErfolgreicherSyncLesen(kontoId: string): string | null {
  try {
    return window.localStorage.getItem(letzterErfolgreicherSyncSpeicherschluessel(kontoId))
  } catch {
    return null
  }
}

function letzterErfolgreicherSyncSchreiben(kontoId: string, zeitpunkt: string): void {
  try {
    window.localStorage.setItem(letzterErfolgreicherSyncSpeicherschluessel(kontoId), zeitpunkt)
  } catch {
    // Persistenz ist nur eine Optimierung - schlägt sie fehl, prüft der
    // nächste Sync-Versuch einfach wieder alle Fotos (sicherer Normalfall).
  }
}

// Obergrenze für gleichzeitig laufende Foto-Prüfungen/-Übertragungen
// (Version 1.49) - hoch genug für einen spürbaren Geschwindigkeitsgewinn
// gegenüber der bisherigen, streng sequentiellen Abarbeitung, niedrig genug
// um eine Anfragen-Drosselung durch Microsoft Graph bei einer großen
// Sammlung zu vermeiden.
const GLEICHZEITIGKEIT_FOTOS = 6

// Führt asynchrone Aufgaben mit einer festen Obergrenze an gleichzeitig
// laufenden Aufrufen aus (fester "Worker"-Pool: jeder Worker nimmt sich
// eine Aufgabe nach der anderen aus derselben Warteschlange, bis diese
// leer ist) - schneller als eine rein sequentielle Abarbeitung, aber nicht
// unbegrenzt parallel wie bei einem einzigen Promise.all über alle Aufgaben.
async function parallelMitObergrenze<T>(
  aufgaben: T[],
  obergrenze: number,
  ausfuehren: (aufgabe: T) => Promise<void>,
): Promise<void> {
  let naechsterIndex = 0

  async function worker(): Promise<void> {
    while (naechsterIndex < aufgaben.length) {
      const eigenerIndex = naechsterIndex++
      await ausfuehren(aufgaben[eigenerIndex])
    }
  }

  const anzahlWorker = Math.min(obergrenze, aufgaben.length)
  await Promise.all(Array.from({ length: anzahlWorker }, () => worker()))
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

interface FotoAufgabe {
  dateiname: string | undefined
  quelle: 'lokal' | 'remote'
}

// Ein lokal aufzuräumendes, durch die Cloud-Version ersetztes Foto (Version
// 1.51). Schließt eine bislang bewusst akzeptierte Lücke (siehe
// Architekturkonzept, Abschnitt 3.3, "Bekannte Einschränkung"): Ersetzt man
// ein Foto SELBST, wird die alte lokale Datei sauber gelöscht (siehe
// filmAktualisierenHandler in App.tsx) - kommt die Ersetzung dagegen per
// Sync von einem ANDEREN Gerät herein, blieb die alte lokale Datei bisher
// einfach liegen. Für ein einzelnes ersetztes Foto kaum spürbar, bei einer
// Sammel-Verkleinerung des gesamten Bestands (siehe
// wartung/fotosVerkleinern.ts) auf einem anderen Gerät summiert sich das
// dagegen schnell zu unnötigem, zusätzlichem Speicherverbrauch statt der
// eigentlich gewünschten Einsparung.
// "neuerDateiname" ist das Foto, das die alte Datei ersetzt - ist es
// gesetzt, darf die alte Datei erst gelöscht werden, wenn feststeht, dass
// genau dieser Download auch wirklich geglückt ist (siehe fehlgeschlagene-
// Dateien-Prüfung weiter unten, Version 1.52). Ist es NICHT gesetzt (Rück-
// seite wurde komplett entfernt statt ersetzt), gibt es nichts abzuwarten -
// dann darf sofort aufgeräumt werden, wie schon bisher.
interface AltesLokalesFoto {
  dateiname: string
  istVorderseite: boolean
  neuerDateiname: string | undefined
}

// Führt einen vollständigen Sync-Durchlauf aus: lädt lokalen und
// entfernten Stand, führt sie pro Film zusammen, gleicht die betroffenen
// Fotos ab, schreibt die "verlierenden" Filme lokal nach und schreibt den
// zusammengeführten Gesamtstand zurück nach OneDrive.
export async function synchronisieren(): Promise<{ anzahlAktualisiert: number; anzahlFotoFehler: number }> {
  // Das Konto wird gezielt ZUERST geladen (siehe letzterErfolgreicherSync-
  // Speicherschluessel oben, Version 1.50): Die Fotoprüfungs-Optimierung
  // unten hängt an der Konto-ID, ohne bekanntes Konto darf sie also gar
  // nicht erst greifen.
  const konto = await angemeldetesKontoLaden()
  if (!konto) throw new Error('Nicht bei Microsoft angemeldet.')

  const [lokaleFilme, remoteDatenRoh] = await Promise.all([filmeFuerSyncLaden(), syncDatenLesen()])
  const remoteFilme = remoteFilmeAusRohdaten(remoteDatenRoh)

  const lokalNachId = new Map(lokaleFilme.map((film) => [film.id, film]))
  const remoteNachId = new Map(remoteFilme.map((film) => [film.id, film]))
  const alleIds = new Set([...lokalNachId.keys(), ...remoteNachId.keys()])

  const letzterErfolgreicherSync = letzterErfolgreicherSyncLesen(konto.homeAccountId)

  const zusammengefuehrteFilme: Film[] = []
  const lokalZuAktualisieren: Film[] = []
  const fotoAufgaben: FotoAufgabe[] = []
  const alteLokaleFotos: AltesLokalesFoto[] = []
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

    // Foto-Prüfung nur für Filme, die seit dem letzten vollständig
    // erfolgreichen Sync (auf irgendeinem Gerät) neu hinzugekommen oder
    // geändert wurden - siehe ausführliche Erläuterung am Dateianfang. Und
    // (Version 1.52) NICHT für bereits gelöschte Filme ("Grabsteine") - ihr
    // Foto wird nirgends mehr angezeigt und kann inzwischen durch die
    // OneDrive-Aufräum-Funktion (siehe wartung/oneDriveAufraeumen.ts)
    // durchaus schon entfernt worden sein. Ohne diese Ausnahme würde ein
    // einzelner gelöschter Film mit fehlendem Foto den Sync unnötig
    // ausbremsen bzw. (vor der zusätzlichen Fehlertoleranz unten) sogar
    // komplett blockieren.
    if ((!letzterErfolgreicherSync || gewinner.zuletztGeaendert > letzterErfolgreicherSync) && !gewinner.geloeschtAm) {
      fotoAufgaben.push({ dateiname: gewinner.fotoDateiname, quelle: gewinnerQuelle })
      fotoAufgaben.push({ dateiname: gewinner.fotoRueckseiteDateiname, quelle: gewinnerQuelle })

      // Wird dabei ein bereits lokal vorhandenes Foto durch ein anderes aus
      // der Cloud ersetzt, gilt die alte lokale Datei ab jetzt als verwaist
      // (siehe AltesLokalesFoto oben) - tatsächlich gelöscht wird sie erst
      // ganz am Ende, nachdem das neue Foto nachweislich erfolgreich
      // heruntergeladen wurde (siehe unten, Prüfung gegen
      // "fehlgeschlageneDateien"). Bewusst NUR in diesem Zweig (nicht z. B.
      // schon bei jedem "Remote gewinnt"): Nur hier steht dank der
      // Watermark-Bedingung oben fest, dass die Foto-Prüfung für GENAU
      // dieses Foto in diesem Durchlauf auch wirklich mit ausgeführt wird -
      // ohne diese Einschränkung könnte (bei einem stark abweichenden
      // Gerätezeitstempel, siehe letzterErfolgreicherSync oben) die alte
      // Datei gelöscht werden, ohne dass die neue je heruntergeladen wurde.
      if (lokal && gewinnerQuelle === 'remote') {
        if (lokal.fotoDateiname && lokal.fotoDateiname !== gewinner.fotoDateiname) {
          alteLokaleFotos.push({ dateiname: lokal.fotoDateiname, istVorderseite: true, neuerDateiname: gewinner.fotoDateiname })
        }
        if (lokal.fotoRueckseiteDateiname && lokal.fotoRueckseiteDateiname !== gewinner.fotoRueckseiteDateiname) {
          alteLokaleFotos.push({
            dateiname: lokal.fotoRueckseiteDateiname,
            istVorderseite: false,
            neuerDateiname: gewinner.fotoRueckseiteDateiname,
          })
        }
      }
    }

    // Nur wenn die Cloud-Version gewonnen hat (oder der Film lokal noch gar
    // nicht existierte), muss lokal etwas nachgeschrieben werden - war die
    // lokale Version bereits aktuell oder führend, ist dort nichts zu tun.
    if (!lokal || gewinnerQuelle === 'remote') {
      lokalZuAktualisieren.push(gewinner)
      anzahlAktualisiert++
    }
  }

  // Version 1.52: Ein einzelnes fehlgeschlagenes Foto bricht den Sync nicht
  // mehr komplett ab (siehe Erläuterung am Dateianfang) - der Fehler wird
  // stattdessen protokolliert, das betroffene Foto in "fehlgeschlageneDateien"
  // vermerkt, und mit den übrigen Aufgaben normal weitergemacht.
  const fehlgeschlageneDateien = new Set<string>()
  let anzahlFotoFehler = 0

  await parallelMitObergrenze(fotoAufgaben, GLEICHZEITIGKEIT_FOTOS, async (aufgabe) => {
    try {
      await fotoAbgleichen(aufgabe.dateiname, aufgabe.quelle)
    } catch (fehlerObjekt) {
      console.error(`Foto "${aufgabe.dateiname ?? '(kein Dateiname)'}" konnte nicht abgeglichen werden - wird übersprungen:`, fehlerObjekt)
      if (aufgabe.dateiname) fehlgeschlageneDateien.add(aufgabe.dateiname)
      anzahlFotoFehler += 1
    }
  })

  if (lokalZuAktualisieren.length > 0) {
    await filmeSyncStapelSchreiben(lokalZuAktualisieren)
  }

  await syncDatenSchreiben({ filme: zusammengefuehrteFilme })

  // Die durch ein neues Foto ersetzten alten lokalen Fotos werden jetzt
  // aufgeräumt (Version 1.51, siehe AltesLokalesFoto oben) - aber (Version
  // 1.52) nur, wenn das ersetzende neue Foto auch nachweislich NICHT in
  // "fehlgeschlageneDateien" steht. Ohne diese Prüfung könnte (jetzt, wo ein
  // einzelner Download-Fehler den Sync nicht mehr abbricht) die alte Datei
  // gelöscht werden, obwohl die neue nie erfolgreich heruntergeladen wurde -
  // derselbe Datenverlust-Fall, den schon die Watermark-Bedingung oben
  // verhindern soll, hier nur durch die neue Fehlertoleranz ausgelöst.
  // fotoLoeschen/fotoMitMiniaturLoeschen sind bereits selbst tolerant
  // gegenüber fehlenden Dateien, ein Fehlschlag hier ist daher unkritisch
  // und wird bewusst nicht gesondert behandelt.
  for (const altesFoto of alteLokaleFotos) {
    if (altesFoto.neuerDateiname && fehlgeschlageneDateien.has(altesFoto.neuerDateiname)) continue
    if (altesFoto.istVorderseite) {
      await fotoMitMiniaturLoeschen(altesFoto.dateiname)
    } else {
      await fotoLoeschen(altesFoto.dateiname)
    }
  }

  // Der "letzter erfolgreicher Sync"-Zeitstempel wird bewusst NUR gesetzt,
  // wenn wirklich JEDES Foto in diesem Durchlauf geglückt ist (Version 1.52,
  // siehe Erläuterung am Dateianfang) - sonst würde ein weiterhin
  // fehlschlagendes Foto beim nächsten Sync fälschlich als "schon geprüft"
  // übersprungen und die Lücke bliebe unbemerkt dauerhaft bestehen. Der Sync
  // als Ganzes gilt trotzdem als abgeschlossen (kein throw) - nur eben mit
  // einer Foto-Lücke, die beim nächsten Versuch automatisch erneut geprüft
  // wird.
  if (anzahlFotoFehler === 0) {
    letzterErfolgreicherSyncSchreiben(konto.homeAccountId, new Date().toISOString())
  }

  return { anzahlAktualisiert, anzahlFotoFehler }
}

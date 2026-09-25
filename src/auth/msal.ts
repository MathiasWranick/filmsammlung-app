import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser'

// Die Anwendungs-ID ist bewusst KEIN Geheimnis (siehe Architekturkonzept,
// Abschnitt 3.3 - Version 1.14): Sie identifiziert nur die App gegenüber
// Microsoft, ersetzt aber keine Anmeldung, und darf deshalb offen im Code
// stehen - anders als die Gemini-/OMDb-Schlüssel, die als GitHub-Secret
// hinterlegt sind.
const MSAL_KONFIGURATION = {
  auth: {
    clientId: '40a6b715-fcf6-4c03-81e9-6e9c7ce80e0f',
    // "common" erlaubt sowohl Organisations- als auch private Microsoft-
    // Konten - passend zur bei der App-Registrierung gewählten Kontotyp-
    // Option ("Konten in einem beliebigen Organisationsverzeichnis und
    // private Microsoft-Konten").
    authority: 'https://login.microsoftonline.com/common',
    // Muss exakt der bei der App-Registrierung hinterlegten Redirect-URI
    // (Plattform: Single-Page-Anwendung) entsprechen, inklusive Schrägstrich
    // am Ende.
    redirectUri: 'https://mathiaswranick.github.io/filmsammlung-app/',
  },
  cache: {
    // localStorage statt des MSAL-Standards (sessionStorage) sorgt dafür,
    // dass die Anmeldung einen Browser-Neustart übersteht, nicht nur einen
    // einzelnen Tab/Fenster.
    cacheLocation: 'localStorage' as const,
  },
}

// Berechtigung, die wir bei der App-Registrierung eingerichtet haben (siehe
// Architekturkonzept, Abschnitt 3.3) - beschränkt den OneDrive-Zugriff
// bewusst auf einen eigenen App-Ordner statt der gesamten Ablage.
// "offline_access" muss hier nicht separat aufgeführt werden, MSAL fordert
// es automatisch mit an.
const BENOETIGTE_BERECHTIGUNGEN = ['Files.ReadWrite.AppFolder']

export const msalInstanz = new PublicClientApplication(MSAL_KONFIGURATION)

let initialisierung: Promise<void> | null = null

// MSAL muss vor jeder Nutzung einmal asynchron initialisiert werden
// (Vorgabe der Bibliothek). Die Funktion merkt sich das laufende Promise,
// damit die Initialisierung bei mehrfachem Aufruf nicht mehrfach passiert.
//
// Version 1.54: Direkt im Anschluss an initialize() wird zusätzlich
// handleRedirectPromise() aufgerufen (Umstieg von Popup- auf
// Redirect-Verfahren, siehe anmelden()/zugriffstokenHolen() unten). Kehrt
// die Seite gerade frisch von einer Microsoft-Anmelde-/Token-Weiterleitung
// zurück, liest dieser Aufruf das Ergebnis einmalig aus der URL und legt es
// im MSAL-eigenen Cache ab (danach z. B. über getAllAccounts() normal
// abrufbar) - läuft KEINE Weiterleitung gerade ab (normaler App-Start),
// liefert der Aufruf einfach "null" und hat sonst keine Wirkung. Kann daher
// gefahrlos bei jedem App-Start ausgeführt werden, MUSS laut MSAL-
// Dokumentation aber vor jeder anderen MSAL-Funktion abgeschlossen sein.
async function sicherstellenInitialisiert(): Promise<void> {
  if (!initialisierung) {
    initialisierung = msalInstanz.initialize().then(() => msalInstanz.handleRedirectPromise().then(() => undefined))
  }
  await initialisierung
}

// Liefert das aktuell angemeldete Konto zurück, falls vorhanden (z. B. nach
// einem Browser-Neustart, dank localStorage-Cache) - ohne dass sich dafür
// ein Anmelde-Fenster öffnet.
export async function angemeldetesKontoLaden(): Promise<AccountInfo | null> {
  await sicherstellenInitialisiert()
  const konten = msalInstanz.getAllAccounts()
  return konten.length > 0 ? konten[0] : null
}

// Eigener Fehlertyp (Version 1.54) für genau den einen Fall, in dem eine
// erneute, aktive Anmelde-Bestätigung nötig wäre, das aber gerade NICHT
// (siehe mitNutzerInteraktion unten) durch einen direkten Klick des Nutzers
// ausgelöst wurde. Erlaubt es den aufrufenden Stellen (z. B. App.tsx), dafür
// gezielt eine klare, verständliche Meldung zu zeigen statt der
// allgemeinen "Synchronisierung fehlgeschlagen"-Meldung.
export class AnmeldungErforderlichFehler extends Error {
  constructor() {
    super('Die Anmeldung ist abgelaufen und muss erneut bestätigt werden.')
    this.name = 'AnmeldungErforderlichFehler'
  }
}

// Version 1.54: Merkt sich, ob die gerade laufende Aktion durch einen
// direkten, bewussten Klick des Nutzers ausgelöst wurde (z. B. "Jetzt
// synchronisieren", "Mit Microsoft anmelden") - siehe mitNutzerInteraktion
// unten. Nur dann ist eine vollständige Seiten-Weiterleitung zur erneuten
// Anmeldung akzeptabel. Bei den zahlreichen automatischen
// Hintergrund-Synchronisierungen (App-Start, nach jeder Filmänderung,
// Wiederverbindung, siehe sync/sync.ts) würde eine unerwartete
// Weiterleitung sonst z. B. eine gerade offene, noch ungespeicherte
// Bearbeitung im Formular-Overlay ersatzlos verwerfen. Bewusst ein
// einfaches, modulweites Merkmal statt eines Parameters, der durch jede
// einzelne Funktion in graph.ts/sync.ts durchgereicht werden müsste -
// unproblematisch, weil ohnehin nie zwei Synchronisierungen gleichzeitig
// laufen (siehe syncAktivRef in App.tsx).
let nutzerInteraktionErlaubt = false

// Führt die übergebene Aktion so aus, dass währenddessen eine nötige
// Weiterleitung zur erneuten Anmeldung erlaubt ist (siehe
// zugriffstokenHolen unten) - IMMER unmittelbar um einen direkten
// Button-Klick herumlegen (z. B. onClick={() => mitNutzerInteraktion(...)}),
// nie um einen automatischen/zeitversetzten Aufruf.
export async function mitNutzerInteraktion<T>(aktion: () => Promise<T>): Promise<T> {
  nutzerInteraktionErlaubt = true
  try {
    return await aktion()
  } finally {
    nutzerInteraktionErlaubt = false
  }
}

// Löst die Microsoft-Anmeldung aus (Version 1.54: Weiterleitung statt
// Popup-Fenster, siehe Architekturkonzept, Änderungshistorie Version 1.54,
// zum Hintergrund - Microsofts Anmelde-Seiten senden inzwischen einen
// Cross-Origin-Opener-Policy-Header, der die Verbindung zwischen Popup und
// App dauerhaft kappt und die bisherige Popup-Erkennung zuverlässig
// zerstört). loginRedirect() navigiert die Seite vollständig weg zu
// Microsoft - dieser Aufruf "kehrt" praktisch nie im selben Seitenaufruf
// zurück. Das eigentliche Anmeldeergebnis wird erst nach der Rückkehr, beim
// dadurch ausgelösten erneuten App-Start, über handleRedirectPromise()
// verarbeitet (siehe sicherstellenInitialisiert oben) und ist danach ganz
// normal über angemeldetesKontoLaden() abrufbar.
//
// "prompt: 'select_account'" (seit Version 1.50 unverändert) erzwingt dabei
// immer eine aktive Kontoauswahl, statt dass der Browser das
// Anmeldefenster per Single-Sign-On automatisch und unbemerkt mit einem
// falschen, gerade am Gerät angemeldeten Konto ausfüllt.
export async function anmelden(): Promise<void> {
  await sicherstellenInitialisiert()
  await msalInstanz.loginRedirect({ scopes: BENOETIGTE_BERECHTIGUNGEN, prompt: 'select_account' })
}

// Analog zu anmelden() auf Redirect umgestellt (Version 1.54). Nach der
// Rückkehr ist kein Konto mehr vorhanden (MSAL räumt seinen Cache selbst
// auf) - ein erneuter App-Start zeigt das über angemeldetesKontoLaden()
// automatisch korrekt an, ein manuelles Zurücksetzen des UI-Zustands ist
// dafür nicht mehr nötig.
export async function abmelden(): Promise<void> {
  await sicherstellenInitialisiert()
  const konto = await angemeldetesKontoLaden()
  if (konto) {
    await msalInstanz.logoutRedirect({ account: konto })
  }
}

// Holt ein Zugriffstoken für die Microsoft Graph API - im Hintergrund
// ("silent"), ohne dass der Nutzer etwas davon merkt, solange die Anmeldung
// noch gültig ist.
//
// Version 1.54: Reicht die stille Erneuerung nicht mehr aus (Microsoft
// verlangt eine erneute Interaktion), wird NICHT mehr automatisch ein
// Popup geöffnet (siehe anmelden() oben zum Hintergrund, warum das
// inzwischen zuverlässig fehlschlägt). Stattdessen: Lief die aktuelle
// Aktion unter mitNutzerInteraktion() (siehe oben, z. B. "Jetzt
// synchronisieren" direkt angeklickt), ist eine Weiterleitung akzeptabel -
// genau wie bei anmelden() navigiert acquireTokenRedirect() die Seite dabei
// vollständig weg, diese Funktion liefert in diesem Fall bewusst nie ein
// Ergebnis zurück (die Seite ist ja gleich weg). Lief die Aktion dagegen
// automatisch im Hintergrund, wird stattdessen ein klarer, verständlicher
// Fehler geworfen (AnmeldungErforderlichFehler) - der Aufrufer (siehe
// App.tsx) zeigt dafür eine Meldung, die zum erneuten Klick auf "Jetzt
// synchronisieren" auffordert, statt ungefragt und überraschend mitten in
// einer eventuell gerade offenen, ungespeicherten Bearbeitung wegzuleiten.
export async function zugriffstokenHolen(): Promise<string> {
  await sicherstellenInitialisiert()
  const konto = await angemeldetesKontoLaden()
  if (!konto) throw new Error('Nicht bei Microsoft angemeldet.')

  try {
    const ergebnis = await msalInstanz.acquireTokenSilent({ scopes: BENOETIGTE_BERECHTIGUNGEN, account: konto })
    return ergebnis.accessToken
  } catch (fehler) {
    if (fehler instanceof InteractionRequiredAuthError) {
      if (!nutzerInteraktionErlaubt) {
        throw new AnmeldungErforderlichFehler()
      }
      await msalInstanz.acquireTokenRedirect({ scopes: BENOETIGTE_BERECHTIGUNGEN, account: konto })
      // Wird nie erreicht/aufgelöst - die Seite navigiert durch den obigen
      // Aufruf weg, bevor hier je ein Wert zurückgegeben werden könnte.
      return await new Promise<string>(() => {})
    }
    throw fehler
  }
}

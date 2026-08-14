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
async function sicherstellenInitialisiert(): Promise<void> {
  if (!initialisierung) {
    initialisierung = msalInstanz.initialize()
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

// Öffnet ein Popup-Fenster zur Microsoft-Anmeldung. Funktioniert nur
// zuverlässig, wenn direkt durch einen Klick ausgelöst (sonst blockieren
// Browser das Popup als vermeintliche Werbung) - deshalb immer unmittelbar
// aus einem Button-Klick heraus aufrufen, nie verzögert/automatisch.
export async function anmelden(): Promise<AccountInfo> {
  await sicherstellenInitialisiert()
  const ergebnis = await msalInstanz.loginPopup({ scopes: BENOETIGTE_BERECHTIGUNGEN })
  return ergebnis.account
}

export async function abmelden(): Promise<void> {
  await sicherstellenInitialisiert()
  const konto = await angemeldetesKontoLaden()
  if (konto) {
    await msalInstanz.logoutPopup({ account: konto })
  }
}

// Holt ein Zugriffstoken für die Microsoft Graph API - im Hintergrund
// ("silent"), ohne dass der Nutzer etwas davon merkt, solange die Anmeldung
// noch gültig ist. Nur falls das nicht mehr klappt (z. B. weil die
// Berechtigung zwischenzeitlich entzogen wurde), fragt ein Popup einmalig
// erneut nach.
export async function zugriffstokenHolen(): Promise<string> {
  await sicherstellenInitialisiert()
  const konto = await angemeldetesKontoLaden()
  if (!konto) throw new Error('Nicht bei Microsoft angemeldet.')

  try {
    const ergebnis = await msalInstanz.acquireTokenSilent({ scopes: BENOETIGTE_BERECHTIGUNGEN, account: konto })
    return ergebnis.accessToken
  } catch (fehler) {
    if (fehler instanceof InteractionRequiredAuthError) {
      const ergebnis = await msalInstanz.acquireTokenPopup({ scopes: BENOETIGTE_BERECHTIGUNGEN, account: konto })
      return ergebnis.accessToken
    }
    throw fehler
  }
}

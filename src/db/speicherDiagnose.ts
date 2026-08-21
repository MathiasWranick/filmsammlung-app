// Reine Diagnose-Hilfsfunktion (Version 1.45, ausgelöst durch einen vom
// Nutzer gemeldeten "QuotaExceededError" beim Sync im Desktop-Browser, siehe
// Architekturkonzept-Änderungshistorie). Der Fehler selbst ("Speicherplatz
// würde überschritten") lieferte in der Browser-Konsole nur einen minifizierten
// Stacktrace ohne Klarnamen - damit war nicht erkennbar, welche Datei genau
// betroffen war und wie der tatsächliche Speicherstand in dem Moment aussah
// (die Werte direkt danach manuell abgefragt sagen nichts über den Zustand
// WÄHREND des fehlgeschlagenen Schreibvorgangs aus, u. a. weil ein
// fehlgeschlagener Schreibversuch wieder zurückgerollt werden kann).
//
// Diese Funktion umschließt jeden einzelnen OPFS-Schreibvorgang (Fotos,
// Miniaturansichten, Datenbank-Datei) und protokolliert im Fehlerfall
// zusätzlich zur Fehlermeldung selbst: eine kurze, für Menschen lesbare
// Beschreibung, worum es sich bei der Datei handelt (inkl. Dateigröße), sowie
// den Speicherstand laut navigator.storage.estimate() GENAU in diesem
// Moment. Rein diagnostisch, verändert das eigentliche Verhalten nicht -
// im Erfolgsfall passiert exakt dasselbe wie vorher.
export async function protokolliertSchreiben(beschreibung: string, schreiben: () => Promise<void>): Promise<void> {
  try {
    await schreiben()
  } catch (fehler) {
    try {
      const schaetzung = await navigator.storage.estimate()
      console.error(
        `OPFS-Schreibfehler bei "${beschreibung}" - Speicherstand in diesem Moment: ` +
          `${schaetzung.usage ?? '?'} von ${schaetzung.quota ?? '?'} Byte belegt.`,
        fehler,
      )
    } catch {
      // Speicherstand konnte selbst nicht ermittelt werden - trotzdem
      // wenigstens die Beschreibung protokollieren, statt ganz zu schweigen.
      console.error(`OPFS-Schreibfehler bei "${beschreibung}" (Speicherstand konnte nicht ermittelt werden).`, fehler)
    }
    throw fehler
  }
}

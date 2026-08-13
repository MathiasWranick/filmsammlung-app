# Filmsammlung-App

Private Web-App zur Verwaltung einer physischen Filmsammlung (DVD/Blu-ray/4K),
angelehnt an "MyMovies". Läuft vollständig im Browser (Desktop + Android),
Datenhaltung lokal per SQLite, Synchronisation über OneDrive.

Details zu Anforderungen, Architektur und Projektplan siehe das
Architekturkonzept-Dokument im Projektverzeichnis.

## Entwicklung

```bash
npm install
npm run dev
```

## Veröffentlichung

Jeder Push auf `main` löst automatisch einen Build und eine Veröffentlichung
auf GitHub Pages aus (siehe `.github/workflows/deploy.yml`).

## KI-Bilderkennung (Gemini API)

Für die automatische Erkennung der Filmdaten aus den Cover-Fotos wird die
kostenlose Gemini-API von Google verwendet. Damit das im veröffentlichten
Build funktioniert, muss im Repository unter Settings -> Secrets and
variables -> Actions ein Secret namens `GEMINI_API_KEY` mit dem eigenen
API-Schlüssel (erstellt in Google AI Studio) hinterlegt sein. Ohne dieses
Secret startet die App weiterhin normal, die KI-Erkennung zeigt dann aber
eine entsprechende Fehlermeldung und die Filmdaten müssen manuell
eingegeben werden.

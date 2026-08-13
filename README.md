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

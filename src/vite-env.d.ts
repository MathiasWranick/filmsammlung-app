/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API-Schlüssel für die Gemini-Bilderkennung. Wird beim Bauen der App
  // (GitHub Actions) aus dem Repository-Secret GEMINI_API_KEY gesetzt.
  readonly VITE_GEMINI_API_KEY?: string
  // API-Schlüssel für die OMDb-Ergänzung (Stufe 0.3). Wird beim Bauen der
  // App (GitHub Actions) aus dem Repository-Secret OMDB_API_KEY gesetzt.
  readonly VITE_OMDB_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

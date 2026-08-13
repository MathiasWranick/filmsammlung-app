/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API-Schlüssel für die Gemini-Bilderkennung. Wird beim Bauen der App
  // (GitHub Actions) aus dem Repository-Secret GEMINI_API_KEY gesetzt.
  readonly VITE_GEMINI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

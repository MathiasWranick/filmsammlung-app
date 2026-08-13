import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages veröffentlicht dieses Projekt unter
// https://mathiaswranick.github.io/filmsammlung-app/ – deshalb muss
// "base" auf den Repository-Namen gesetzt werden, sonst finden CSS/JS
// ihre Dateien nach der Veröffentlichung nicht.
export default defineConfig({
  plugins: [react()],
  base: '/filmsammlung-app/',
})

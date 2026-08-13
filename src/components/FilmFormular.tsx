import { useState, type FormEvent } from 'react'
import type { Format } from '../db/filme'

const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

interface Props {
  onHinzufuegen: (eingabe: { titel: string; format: Format; foto: File }) => Promise<void>
}

function FilmFormular({ onHinzufuegen }: Props) {
  const [titel, setTitel] = useState('')
  const [format, setFormat] = useState<Format>('DVD')
  const [foto, setFoto] = useState<File | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function absenden(ereignis: FormEvent<HTMLFormElement>) {
    ereignis.preventDefault()
    const formElement = ereignis.currentTarget
    setFehler(null)

    if (!titel.trim()) {
      setFehler('Bitte einen Titel eingeben.')
      return
    }
    if (!foto) {
      setFehler('Bitte ein Foto der Rückseite auswählen.')
      return
    }

    setWirdGespeichert(true)
    try {
      await onHinzufuegen({ titel, format, foto })
      setTitel('')
      setFormat('DVD')
      setFoto(null)
      formElement.reset()
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      setFehler('Speichern ist fehlgeschlagen. Bitte nochmal versuchen.')
    } finally {
      setWirdGespeichert(false)
    }
  }

  return (
    <form onSubmit={absenden} className="formular">
      <h2>Film hinzufügen</h2>

      <label>
        Titel
        <input
          type="text"
          value={titel}
          onChange={(ereignis) => setTitel(ereignis.target.value)}
          placeholder="z. B. Inception"
        />
      </label>

      <label>
        Format
        <select value={format} onChange={(ereignis) => setFormat(ereignis.target.value as Format)}>
          {FORMATE.map((einzelnesFormat) => (
            <option key={einzelnesFormat} value={einzelnesFormat}>
              {einzelnesFormat}
            </option>
          ))}
        </select>
      </label>

      <label>
        Foto der Rückseite
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => setFoto(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}

      <button type="submit" disabled={wirdGespeichert}>
        {wirdGespeichert ? 'Wird gespeichert …' : 'Film speichern'}
      </button>
    </form>
  )
}

export default FilmFormular

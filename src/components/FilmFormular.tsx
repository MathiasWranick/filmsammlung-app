import { useState, type FormEvent } from 'react'
import type { Format } from '../db/filme'
import { erkenneText } from '../ocr/erkennung'
import { analysiereText } from '../ocr/textAnalyse'

const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

interface Props {
  onHinzufuegen: (eingabe: {
    titel: string
    format: Format
    foto: File
    fsk?: string
    laufzeitMinuten?: number
    barcode?: string
  }) => Promise<void>
}

function FilmFormular({ onHinzufuegen }: Props) {
  const [titel, setTitel] = useState('')
  const [format, setFormat] = useState<Format>('DVD')
  const [foto, setFoto] = useState<File | null>(null)
  const [fsk, setFsk] = useState('')
  const [laufzeit, setLaufzeit] = useState('')
  const [barcode, setBarcode] = useState('')
  const [texterkennungLaeuft, setTexterkennungLaeuft] = useState(false)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Wird aufgerufen, sobald ein Foto ausgewählt wurde. Erkennt automatisch
  // den aufgedruckten Text und schlägt daraus Titel/FSK/Laufzeit/Barcode
  // vor. Alle Vorschläge bleiben danach ganz normal editierbar - falls die
  // Erkennung daneben liegt, kann einfach von Hand korrigiert werden.
  async function fotoAusgewaehlt(datei: File | null) {
    setFoto(datei)
    if (!datei) return

    setFehler(null)
    setTexterkennungLaeuft(true)
    try {
      const rohtext = await erkenneText(datei)
      const vorschlag = analysiereText(rohtext)

      if (vorschlag.titelVorschlag && !titel.trim()) setTitel(vorschlag.titelVorschlag)
      if (vorschlag.fsk) setFsk(vorschlag.fsk)
      if (vorschlag.laufzeitMinuten) setLaufzeit(String(vorschlag.laufzeitMinuten))
      if (vorschlag.barcode) setBarcode(vorschlag.barcode)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      // Texterkennung ist nur eine Hilfe - schlägt sie fehl, kann trotzdem
      // ganz normal von Hand weiter erfasst werden.
    } finally {
      setTexterkennungLaeuft(false)
    }
  }

  async function absenden(ereignis: FormEvent<HTMLFormElement>) {
    ereignis.preventDefault()
    const formElement = ereignis.currentTarget
    setFehler(null)

    if (!foto) {
      setFehler('Bitte zuerst ein Foto der Rückseite auswählen.')
      return
    }
    if (!titel.trim()) {
      setFehler('Bitte einen Titel eingeben.')
      return
    }

    setWirdGespeichert(true)
    try {
      await onHinzufuegen({
        titel,
        format,
        foto,
        fsk: fsk.trim() || undefined,
        laufzeitMinuten: laufzeit.trim() ? Number(laufzeit) : undefined,
        barcode: barcode.trim() || undefined,
      })
      setTitel('')
      setFormat('DVD')
      setFoto(null)
      setFsk('')
      setLaufzeit('')
      setBarcode('')
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
        Foto der Rückseite
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => fotoAusgewaehlt(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      {texterkennungLaeuft && <p className="hint">Text wird erkannt …</p>}

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
        FSK
        <input
          type="text"
          value={fsk}
          onChange={(ereignis) => setFsk(ereignis.target.value)}
          placeholder="z. B. 12"
        />
      </label>

      <label>
        Laufzeit (Minuten)
        <input
          type="number"
          value={laufzeit}
          onChange={(ereignis) => setLaufzeit(ereignis.target.value)}
          placeholder="z. B. 148"
        />
      </label>

      <label>
        Barcode
        <input
          type="text"
          value={barcode}
          onChange={(ereignis) => setBarcode(ereignis.target.value)}
          placeholder="EAN, rein informativ"
        />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}

      <button type="submit" disabled={wirdGespeichert || texterkennungLaeuft}>
        {wirdGespeichert ? 'Wird gespeichert …' : 'Film speichern'}
      </button>
    </form>
  )
}

export default FilmFormular

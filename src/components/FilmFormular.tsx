import { useState, type FormEvent } from 'react'
import type { Format } from '../db/filme'
import { erkenneFilmdaten, ErkennungsFehler } from '../ki/bilderkennung'

const FORMATE: Format[] = ['DVD', 'Blu-ray', '4K UHD', 'Sonstiges']

interface Props {
  onHinzufuegen: (eingabe: {
    titel: string
    format: Format
    fotoVorderseite: File
    fotoRueckseite: File
    fsk?: string
    laufzeitMinuten?: number
    barcode?: string
    regisseur?: string
    darsteller?: string
    handlung?: string
  }) => Promise<void>
}

function FilmFormular({ onHinzufuegen }: Props) {
  const [titel, setTitel] = useState('')
  const [format, setFormat] = useState<Format>('DVD')
  const [fotoVorderseite, setFotoVorderseite] = useState<File | null>(null)
  const [fotoRueckseite, setFotoRueckseite] = useState<File | null>(null)
  const [fsk, setFsk] = useState('')
  const [laufzeit, setLaufzeit] = useState('')
  const [barcode, setBarcode] = useState('')
  const [regisseur, setRegisseur] = useState('')
  const [darsteller, setDarsteller] = useState('')
  const [handlung, setHandlung] = useState('')

  const [erkennungLaeuft, setErkennungLaeuft] = useState(false)
  const [erkennungsHinweis, setErkennungsHinweis] = useState<string | null>(null)
  const [wirdGespeichert, setWirdGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Die KI-Erkennung kostet (wenn auch nur minimal) Kontingent, deshalb
  // läuft sie nicht automatisch beim Foto-Auswählen, sondern erst auf
  // Knopfdruck.
  async function erkennungStarten() {
    if (!fotoVorderseite || !fotoRueckseite) return

    setErkennungsHinweis(null)
    setErkennungLaeuft(true)
    try {
      const ergebnis = await erkenneFilmdaten(fotoVorderseite, fotoRueckseite)

      if (ergebnis.titel && !titel.trim()) setTitel(ergebnis.titel)
      if (ergebnis.format && FORMATE.includes(ergebnis.format as Format)) {
        setFormat(ergebnis.format as Format)
      }
      if (ergebnis.fsk) setFsk(ergebnis.fsk)
      if (ergebnis.laufzeitMinuten) setLaufzeit(String(ergebnis.laufzeitMinuten))
      if (ergebnis.barcode) setBarcode(ergebnis.barcode)
      if (ergebnis.regisseur) setRegisseur(ergebnis.regisseur)
      if (ergebnis.darsteller) setDarsteller(ergebnis.darsteller)
      if (ergebnis.handlung) setHandlung(ergebnis.handlung)
    } catch (fehlerObjekt) {
      console.error(fehlerObjekt)
      if (fehlerObjekt instanceof ErkennungsFehler) {
        setErkennungsHinweis(fehlerObjekt.message)
      } else {
        setErkennungsHinweis('Die KI-Erkennung ist fehlgeschlagen. Die Daten können manuell eingegeben werden.')
      }
    } finally {
      setErkennungLaeuft(false)
    }
  }

  async function absenden(ereignis: FormEvent<HTMLFormElement>) {
    ereignis.preventDefault()
    const formElement = ereignis.currentTarget
    setFehler(null)

    if (!fotoVorderseite) {
      setFehler('Bitte zuerst ein Foto der Vorderseite auswählen.')
      return
    }
    if (!fotoRueckseite) {
      setFehler('Bitte auch ein Foto der Rückseite auswählen (dort stehen die meisten Detailangaben).')
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
        fotoVorderseite,
        fotoRueckseite,
        fsk: fsk.trim() || undefined,
        laufzeitMinuten: laufzeit.trim() ? Number(laufzeit) : undefined,
        barcode: barcode.trim() || undefined,
        regisseur: regisseur.trim() || undefined,
        darsteller: darsteller.trim() || undefined,
        handlung: handlung.trim() || undefined,
      })
      setTitel('')
      setFormat('DVD')
      setFotoVorderseite(null)
      setFotoRueckseite(null)
      setFsk('')
      setLaufzeit('')
      setBarcode('')
      setRegisseur('')
      setDarsteller('')
      setHandlung('')
      setErkennungsHinweis(null)
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
        Foto Vorderseite (wird als Vorschaubild verwendet)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => setFotoVorderseite(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      <label>
        Foto Rückseite (hier stehen die meisten Detailangaben)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(ereignis) => setFotoRueckseite(ereignis.target.files?.[0] ?? null)}
        />
      </label>

      <button
        type="button"
        onClick={erkennungStarten}
        disabled={!fotoVorderseite || !fotoRueckseite || erkennungLaeuft}
      >
        {erkennungLaeuft ? 'Wird erkannt …' : 'Mit KI erkennen'}
      </button>

      {erkennungsHinweis && <p className="hint">{erkennungsHinweis}</p>}

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
        Regisseur
        <input type="text" value={regisseur} onChange={(ereignis) => setRegisseur(ereignis.target.value)} />
      </label>

      <label>
        Darsteller
        <input type="text" value={darsteller} onChange={(ereignis) => setDarsteller(ereignis.target.value)} />
      </label>

      <label>
        FSK
        <input type="text" value={fsk} onChange={(ereignis) => setFsk(ereignis.target.value)} placeholder="z. B. 12" />
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

      <label>
        Handlung
        <textarea value={handlung} onChange={(ereignis) => setHandlung(ereignis.target.value)} rows={3} />
      </label>

      {fehler && <p className="fehler">{fehler}</p>}

      <button type="submit" disabled={wirdGespeichert || erkennungLaeuft}>
        {wirdGespeichert ? 'Wird gespeichert …' : 'Film speichern'}
      </button>
    </form>
  )
}

export default FilmFormular

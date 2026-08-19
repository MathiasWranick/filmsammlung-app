// Verleih-Katalog zum Teilen der Sammlung mit anderen Personen (Version 1.39,
// "Spin-Off"-Idee des Nutzers) - komplett unabhängig vom OneDrive-Sync: Statt
// den Empfänger:innen Zugriff aufs eigene OneDrive oder eine eigene Anmeldung
// einzurichten, erzeugt diese Datei einen einzigen, in sich geschlossenen
// HTML-Schnappschuss der Sammlung (Daten direkt eingebettet, kein Server, kein
// Nachladen), der z. B. per Mail oder Messenger verschickt und einfach im
// Browser geöffnet werden kann. Der Stand ist dabei bewusst fix - Änderungen
// an der Sammlung erfordern einen neuen, erneut heruntergeladenen und
// verschickten Katalog. Enthält nur eine bewusst eng gewählte Teilmenge der
// Felder (siehe VerleihFilm) - insbesondere ohne "Ausgeliehen an/am" (würde
// den Namen einer dritten Person preisgeben UND veraltet erfahrungsgemäß
// schneller als die Sammlung selbst neu exportiert wird) und ohne Fotos
// (würden die Datei unnötig groß machen, Sammlung besteht aus Text-Metadaten).
import { filmeLaden, type Film } from '../db/filme'

// Bewusst kurze Feldnamen, damit die eingebettete JSON-Nutzlast klein bleibt -
// bei ~1.000 Filmen macht das für die E-Mail-/Messenger-Tauglichkeit einen
// spürbaren Unterschied.
export interface VerleihFilm {
  titel: string
  format: string
  typ: string
  fassung?: string
  staffel?: string
  genre?: string
  jahr?: number
  fsk?: string
  laufzeit?: number
  handlung?: string
  bewertung?: string
}

function felderFuerVerleih(film: Film): VerleihFilm {
  return {
    titel: film.titel,
    format: film.format,
    typ: film.typ,
    fassung: film.fassung,
    staffel: film.staffel,
    genre: film.genre,
    jahr: film.jahr,
    fsk: film.fsk,
    laufzeit: film.laufzeitMinuten,
    handlung: film.handlung,
    bewertung: film.imdbBewertung,
  }
}

function heutigesDatumDeutsch(): string {
  const jetzt = new Date()
  const zweistellig = (zahl: number) => String(zahl).padStart(2, '0')
  return `${zweistellig(jetzt.getDate())}.${zweistellig(jetzt.getMonth() + 1)}.${jetzt.getFullYear()}`
}

// Erzeugt das komplette, eigenständige HTML-Dokument als Text. Die Daten
// werden als JSON in einem <script type="application/json">-Block
// eingebettet (nicht als JS-Objektliteral direkt im Code) - dadurch sind
// Sonderzeichen in Filmtexten (Anführungszeichen, Zeilenumbrüche in der
// Handlung usw.) automatisch korrekt escaped, ohne eigene Escaping-Logik.
// Einzig "<" wird zusätzlich zu "<" escaped, damit ein zufälliges
// "</script>" mitten in einem Freitextfeld (z. B. der Handlung) das
// umschließende <script>-Tag nicht vorzeitig beendet.
export function verleihKatalogHtmlErzeugen(filme: VerleihFilm[]): string {
  const datenJson = JSON.stringify(filme).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Zusätzlich zum :root { color-scheme: ... } in der CSS unten auch als
     eigenes <meta>-Tag gesetzt: Manche Browser/Vorschau-Ansichten (z. B.
     eingebettete Browser von Mail- oder Messenger-Apps, oder das direkte
     Öffnen einer lokal heruntergeladenen Datei) werten dieses Tag
     zuverlässiger aus als eine reine CSS-Angabe und greifen sonst auf eine
     eigene, vom eigentlichen Geräte-/Browser-Einstellung abweichende
     Dunkeldarstellung zurück. -->
<meta name="color-scheme" content="light dark" />
<title>Filmsammlung – Verleih-Katalog</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; padding: 1.25rem 1rem 3rem; max-width: 32rem; margin-inline: auto; overflow-x: hidden;
    background: canvas; color: canvastext; }
  h1 { font-size: 1.3rem; margin: 0 0 0.15rem; }
  .stand { color: #6b7280; font-size: 0.8rem; margin: 0 0 1rem; }
  .kopf-reihe { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.25rem; }
  .wunschliste-btn { position: relative; padding: 0.5rem 0.9rem; font-size: 0.9rem; font-family: inherit; font-weight: 600;
    border: 1px solid #d1d5db; border-radius: 0.4rem; background: canvas; color: canvastext; cursor: pointer; }
  .wunschliste-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.1rem; height: 1.1rem;
    padding: 0 0.3rem; border-radius: 999px; background: canvastext; color: canvas; font-size: 0.7rem; font-weight: 700;
    margin-left: 0.35rem; }

  .abschnitt { border: 1px solid #d1d5db; border-radius: 0.5rem; margin-bottom: 1rem; overflow: hidden; }
  .abschnitt-kopf { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; width: 100%;
    padding: 0.6rem 0.75rem; font: inherit; font-size: 0.9rem; font-weight: 600; color: inherit; background: none;
    border: none; cursor: pointer; text-align: left; }
  .abschnitt-pfeil { font-size: 0.75rem; color: #6b7280; transition: transform 0.15s ease; }
  .abschnitt-pfeil.auf { transform: rotate(180deg); }
  .abschnitt-body { padding: 0.75rem; border-top: 1px solid #d1d5db; display: none; flex-direction: column; gap: 0.6rem; }
  .abschnitt-body.offen { display: flex; }
  .filterleiste { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .filterleiste input, .filterleiste select { padding: 0.4rem; font-size: 0.9rem; font-family: inherit; flex: 1 1 9rem; }
  .filterleiste label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.9rem; flex: 1 1 100%; }
  .filter-fuss { display: flex; justify-content: flex-end; }
  .sek-btn { padding: 0.45rem 0.75rem; font-size: 0.85rem; font-family: inherit; font-weight: 500; border: 1px solid #d1d5db;
    border-radius: 0.4rem; background: canvas; color: canvastext; cursor: pointer; }
  .sek-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sortier-inline { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; }
  .sortier-inline select { padding: 0.35rem 0.4rem; font-size: 0.9rem; font-family: inherit; }

  .film-liste { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .film-karte { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem 0.7rem; border: 1px solid #e5e7eb;
    border-radius: 0.5rem; cursor: pointer; background: canvas; color: canvastext; }
  .film-karte input[type="checkbox"] { margin-top: 0.2rem; width: 1.1rem; height: 1.1rem; flex-shrink: 0; }
  .film-karte strong { display: block; }
  .film-karte .hint { color: #6b7280; font-size: 0.85rem; }
  .keine-treffer { color: #6b7280; }

  .overlay-hintergrund { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: none; align-items: center;
    justify-content: center; padding: 1rem; z-index: 100; }
  .overlay-hintergrund.offen { display: flex; }
  .overlay-inhalt { background: canvas; color: canvastext; border-radius: 0.5rem; max-width: 32rem; width: 100%;
    max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  .overlay-kopf { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1rem 0.5rem;
    border-bottom: 1px solid #e5e7eb; }
  .overlay-kopf h2 { margin: 0; font-size: 1.1rem; }
  .overlay-schliessen { background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer;
    padding: 0.25rem 0.5rem; color: #6b7280; }
  .overlay-body { padding: 1rem; overflow-y: auto; }
  .overlay-fuss { padding: 0.75rem 1rem; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 0.5rem; }
  @media (max-width: 40rem) {
    .overlay-hintergrund { padding: 0; }
    .overlay-inhalt { max-width: 100%; max-height: 100vh; height: 100%; border-radius: 0; }
  }

  .anzeige-felder { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.75rem; margin: 0; }
  .anzeige-felder dt { font-weight: 600; color: #6b7280; }
  .anzeige-felder dd { margin: 0; }

  .wunschliste-eintraege { list-style: none; padding: 0; margin: 0 0 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .wunschliste-eintraege li { padding: 0.4rem 0.6rem; border: 1px solid #e5e7eb; border-radius: 0.4rem; }
  .email-btn { display: inline-block; padding: 0.6rem 1rem; font-size: 0.95rem; font-weight: 600; border-radius: 0.4rem;
    border: 1px solid #d1d5db; background: canvas; color: canvastext; text-decoration: none; cursor: pointer; }
  .email-btn[aria-disabled="true"] { opacity: 0.5; pointer-events: none; }
</style>
</head>
<body>

<div class="kopf-reihe">
  <div>
    <h1>Filmsammlung – Verleih-Katalog</h1>
    <p class="stand">Stand: ${heutigesDatumDeutsch()} · fester Schnappschuss, keine Live-Daten</p>
  </div>
  <button type="button" class="wunschliste-btn" id="wunschliste-oeffnen">
    Wunschliste<span class="wunschliste-badge" id="wunschliste-badge" hidden>0</span>
  </button>
</div>

<div class="abschnitt">
  <button type="button" class="abschnitt-kopf" id="filter-kopf" aria-expanded="false">
    <span>Suche / Filter</span>
    <span class="abschnitt-pfeil" id="filter-pfeil">▾</span>
  </button>
  <div class="abschnitt-body" id="filter-body">
    <div class="filterleiste">
      <input type="text" id="filter-titel" placeholder="Titel suchen …" />
      <select id="filter-format"><option value="">Alle Formate</option></select>
      <select id="filter-typ"><option value="">Filme &amp; Serien</option></select>
      <select id="filter-fsk"><option value="">Alle FSK-Stufen</option></select>
      <input type="text" id="filter-genre" placeholder="Genre enthält …" />
      <label>
        <input type="checkbox" id="filter-nur-ausgewaehlt" />
        Nur ausgewählte (Wunschliste) anzeigen
      </label>
    </div>
    <div class="filter-fuss">
      <button type="button" class="sek-btn" id="filter-zuruecksetzen">Filter zurücksetzen</button>
    </div>
  </div>
</div>

<div class="abschnitt">
  <button type="button" class="abschnitt-kopf" id="sortier-kopf" aria-expanded="false">
    <span>Sortieren</span>
    <span class="abschnitt-pfeil" id="sortier-pfeil">▾</span>
  </button>
  <div class="abschnitt-body" id="sortier-body">
    <div class="sortier-inline">
      <select id="sortier-feld">
        <option value="titel">Titel</option>
        <option value="jahr">Erscheinungsjahr</option>
      </select>
      <select id="sortier-richtung">
        <option value="aufsteigend">Aufsteigend</option>
        <option value="absteigend">Absteigend</option>
      </select>
    </div>
  </div>
</div>

<p class="hint" id="treffer-anzahl"></p>
<ul class="film-liste" id="film-liste"></ul>
<p class="keine-treffer" id="keine-treffer" hidden>Keine Filme gefunden – Suche/Filter anpassen.</p>

<div class="overlay-hintergrund" id="detail-overlay">
  <div class="overlay-inhalt">
    <div class="overlay-kopf">
      <h2 id="detail-titel"></h2>
      <button type="button" class="overlay-schliessen" id="detail-schliessen" aria-label="Schließen">×</button>
    </div>
    <div class="overlay-body">
      <dl class="anzeige-felder" id="detail-felder"></dl>
    </div>
  </div>
</div>

<div class="overlay-hintergrund" id="wunschliste-overlay">
  <div class="overlay-inhalt">
    <div class="overlay-kopf">
      <h2>Wunschliste</h2>
      <button type="button" class="overlay-schliessen" id="wunschliste-schliessen" aria-label="Schließen">×</button>
    </div>
    <div class="overlay-body">
      <p class="hint">Diese Filme würde ich mir gerne ausleihen:</p>
      <ul class="wunschliste-eintraege" id="wunschliste-eintraege"></ul>
      <p class="hint" id="wunschliste-leer" hidden>Noch keine Filme ausgewählt – einfach in der Liste ankreuzen.</p>
    </div>
    <div class="overlay-fuss">
      <a href="#" class="email-btn" id="wunschliste-mail" aria-disabled="true">Per E-Mail senden</a>
    </div>
  </div>
</div>

<script type="application/json" id="filme-daten">${datenJson}</script>
<script>
(function () {
  'use strict';
  var filme = JSON.parse(document.getElementById('filme-daten').textContent);
  var ausgewaehlt = new Set();

  function feldText(wert) {
    if (wert === undefined || wert === null || wert === '') return null;
    return String(wert);
  }

  // Jahr und FSK bewusst NICHT in der Kurzinfo-Zeile (anders als in der
  // Haupt-App) - ein Praxistest mit schmaler Bildschirmbreite zeigte, dass
  // die Zeile sonst umbricht. Beide Angaben stehen weiterhin vollständig im
  // Detail-Overlay.
  function kurzinfo(film) {
    var teile = [film.format];
    teile.push(film.typ === 'Serie' ? ('Serie' + (film.staffel ? ' (Staffel ' + film.staffel + ')' : '')) : 'Film');
    if (film.genre) teile.push(film.genre);
    return teile.join(' · ');
  }

  // Feste Liste statt aus den Daten abgeleitet - dieselbe Freigabestufen-
  // Domäne wie im FSK-Filter der Haupt-App (dort ebenfalls fest codiert,
  // siehe FilmListe.tsx), unabhängig davon, welche Stufen in der aktuellen
  // Sammlung gerade tatsächlich vorkommen.
  var FSK_STUFEN = ['0', '6', '12', '16', '18'];

  // Auswahllisten für die Format-/Typ-Filter aus den tatsächlich
  // vorkommenden Werten aufbauen, statt einer fest codierten Liste - bleibt
  // dadurch automatisch korrekt, auch wenn nicht jedes Format vorkommt.
  var formatSelect = document.getElementById('filter-format');
  var typSelect = document.getElementById('filter-typ');
  var fskSelect = document.getElementById('filter-fsk');
  var formate = Array.from(new Set(filme.map(function (f) { return f.format; }))).sort();
  formate.forEach(function (format) {
    var option = document.createElement('option');
    option.value = format;
    option.textContent = format;
    formatSelect.appendChild(option);
  });
  var typen = Array.from(new Set(filme.map(function (f) { return f.typ; }))).sort();
  typen.forEach(function (typ) {
    var option = document.createElement('option');
    option.value = typ;
    option.textContent = typ;
    typSelect.appendChild(option);
  });
  FSK_STUFEN.forEach(function (stufe) {
    var option = document.createElement('option');
    option.value = stufe;
    option.textContent = 'FSK ' + stufe;
    fskSelect.appendChild(option);
  });

  var filterKopf = document.getElementById('filter-kopf');
  var filterBody = document.getElementById('filter-body');
  var filterPfeil = document.getElementById('filter-pfeil');
  filterKopf.addEventListener('click', function () {
    var offen = filterBody.classList.toggle('offen');
    filterPfeil.classList.toggle('auf', offen);
    filterKopf.setAttribute('aria-expanded', String(offen));
  });

  var sortierKopf = document.getElementById('sortier-kopf');
  var sortierBody = document.getElementById('sortier-body');
  var sortierPfeil = document.getElementById('sortier-pfeil');
  sortierKopf.addEventListener('click', function () {
    var offen = sortierBody.classList.toggle('offen');
    sortierPfeil.classList.toggle('auf', offen);
    sortierKopf.setAttribute('aria-expanded', String(offen));
  });

  var titelEingabe = document.getElementById('filter-titel');
  var genreEingabe = document.getElementById('filter-genre');
  var nurAusgewaehltCheckbox = document.getElementById('filter-nur-ausgewaehlt');
  var filterZuruecksetzenBtn = document.getElementById('filter-zuruecksetzen');
  var sortierFeldSelect = document.getElementById('sortier-feld');
  var sortierRichtungSelect = document.getElementById('sortier-richtung');
  var listeContainer = document.getElementById('film-liste');
  var trefferAnzahl = document.getElementById('treffer-anzahl');
  var keineTreffer = document.getElementById('keine-treffer');

  // Jedes Filterfeld grenzt unabhängig von den anderen ein (UND-
  // Verknüpfung) - so wie in der Haupt-App lassen sich also mehrere Filter
  // gleichzeitig setzen, z. B. Format "Blu-ray" UND FSK 16 UND Genre
  // "Action" gleichzeitig.
  function gefilterteFilme() {
    var titelbegriff = titelEingabe.value.trim().toLowerCase();
    var format = formatSelect.value;
    var typ = typSelect.value;
    var fsk = fskSelect.value;
    var genrebegriff = genreEingabe.value.trim().toLowerCase();
    var nurAusgewaehlt = nurAusgewaehltCheckbox.checked;
    return filme.filter(function (film, index) {
      if (format && film.format !== format) return false;
      if (typ && film.typ !== typ) return false;
      if (fsk && film.fsk !== fsk) return false;
      if (titelbegriff && film.titel.toLowerCase().indexOf(titelbegriff) === -1) return false;
      if (genrebegriff && !(film.genre && film.genre.toLowerCase().indexOf(genrebegriff) !== -1)) return false;
      if (nurAusgewaehlt && !ausgewaehlt.has(index)) return false;
      film._index = index;
      return true;
    });
  }

  // Sortiert die Liste, analog zur Sortierung in der Haupt-App
  // (FilmListe.tsx): Titel alphabetisch (deutsche Sortierregeln) oder Jahr
  // numerisch. Filme ohne Erscheinungsjahr landen dabei bewusst IMMER am
  // Ende, unabhängig von der gewählten Richtung - "kein Jahr bekannt" soll
  // nicht wie "frühestes Jahr" wirken, sobald man auf absteigend umschaltet.
  // Die Auf-/Absteigend-Richtung wirkt sich deshalb gezielt nur auf den
  // Vergleich zweier tatsächlich vorhandener Werte aus, nicht auf die
  // Sonderbehandlung fehlender Werte. Bei Gleichstand (gleiches Jahr, oder
  // Sortierung nach Titel) entscheidet zusätzlich der Titel, damit die
  // Reihenfolge nachvollziehbar bleibt.
  function sortiereFilme(treffer) {
    var feld = sortierFeldSelect.value;
    var richtung = sortierRichtungSelect.value;
    treffer.sort(function (a, b) {
      if (feld === 'jahr') {
        if (a.jahr === undefined && b.jahr === undefined) return a.titel.localeCompare(b.titel, 'de');
        if (a.jahr === undefined) return 1;
        if (b.jahr === undefined) return -1;
        if (a.jahr !== b.jahr) return richtung === 'absteigend' ? b.jahr - a.jahr : a.jahr - b.jahr;
        return a.titel.localeCompare(b.titel, 'de');
      }
      var ergebnis = a.titel.localeCompare(b.titel, 'de');
      return richtung === 'absteigend' ? -ergebnis : ergebnis;
    });
  }

  function zeileFuerFeld(dl, label, wert) {
    var text = feldText(wert);
    if (text === null) return;
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.textContent = text;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function detailAnzeigen(index) {
    var film = filme[index];
    document.getElementById('detail-titel').textContent = film.titel;
    var dl = document.getElementById('detail-felder');
    dl.textContent = '';
    zeileFuerFeld(dl, 'Format', film.format);
    zeileFuerFeld(dl, 'Typ', film.typ);
    if (film.typ === 'Serie') zeileFuerFeld(dl, 'Staffel', film.staffel);
    zeileFuerFeld(dl, 'Fassung/Edition', film.fassung);
    zeileFuerFeld(dl, 'Jahr', film.jahr);
    zeileFuerFeld(dl, 'Genre', film.genre);
    zeileFuerFeld(dl, 'FSK', film.fsk ? ('FSK ' + film.fsk) : undefined);
    zeileFuerFeld(dl, 'Laufzeit', film.laufzeit ? (film.laufzeit + ' Min.') : undefined);
    zeileFuerFeld(dl, 'IMDb-Bewertung', film.bewertung);
    zeileFuerFeld(dl, 'Handlung', film.handlung);
    document.getElementById('detail-overlay').classList.add('offen');
  }

  function liste_rendern() {
    var treffer = gefilterteFilme();
    sortiereFilme(treffer);
    listeContainer.textContent = '';
    keineTreffer.hidden = treffer.length > 0;
    trefferAnzahl.textContent = treffer.length + ' von ' + filme.length + ' Filmen angezeigt';

    treffer.forEach(function (film) {
      var index = film._index;
      var li = document.createElement('li');
      li.className = 'film-karte';

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = ausgewaehlt.has(index);
      checkbox.setAttribute('aria-label', 'Für Wunschliste auswählen: ' + film.titel);
      checkbox.addEventListener('click', function (ereignis) { ereignis.stopPropagation(); });
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) { ausgewaehlt.add(index); } else { ausgewaehlt.delete(index); }
        wunschliste_aktualisieren();
      });

      var textBereich = document.createElement('div');
      var titelZeile = document.createElement('strong');
      titelZeile.textContent = film.titel;
      var infoZeile = document.createElement('div');
      infoZeile.className = 'hint';
      infoZeile.textContent = kurzinfo(film);
      textBereich.appendChild(titelZeile);
      textBereich.appendChild(infoZeile);

      li.appendChild(checkbox);
      li.appendChild(textBereich);
      li.addEventListener('click', function () { detailAnzeigen(index); });

      listeContainer.appendChild(li);
    });
  }

  titelEingabe.addEventListener('input', liste_rendern);
  formatSelect.addEventListener('change', liste_rendern);
  typSelect.addEventListener('change', liste_rendern);
  fskSelect.addEventListener('change', liste_rendern);
  genreEingabe.addEventListener('input', liste_rendern);
  nurAusgewaehltCheckbox.addEventListener('change', liste_rendern);
  sortierFeldSelect.addEventListener('change', liste_rendern);
  sortierRichtungSelect.addEventListener('change', liste_rendern);

  filterZuruecksetzenBtn.addEventListener('click', function () {
    titelEingabe.value = '';
    formatSelect.value = '';
    typSelect.value = '';
    fskSelect.value = '';
    genreEingabe.value = '';
    nurAusgewaehltCheckbox.checked = false;
    liste_rendern();
  });

  // Detail-Overlay schließen (X, Hintergrund-Klick, Escape) - dasselbe
  // Bedienmuster wie in der Haupt-App (Overlay.tsx).
  var detailOverlay = document.getElementById('detail-overlay');
  document.getElementById('detail-schliessen').addEventListener('click', function () {
    detailOverlay.classList.remove('offen');
  });
  detailOverlay.addEventListener('click', function (ereignis) {
    if (ereignis.target === detailOverlay) detailOverlay.classList.remove('offen');
  });
  detailOverlay.querySelector('.overlay-inhalt').addEventListener('click', function (ereignis) {
    ereignis.stopPropagation();
  });

  // Wunschliste-Overlay
  var wunschlisteOverlay = document.getElementById('wunschliste-overlay');
  var wunschlisteBadge = document.getElementById('wunschliste-badge');
  var wunschlisteEintraege = document.getElementById('wunschliste-eintraege');
  var wunschlisteLeer = document.getElementById('wunschliste-leer');
  var wunschlisteMail = document.getElementById('wunschliste-mail');

  function wunschliste_aktualisieren() {
    var anzahl = ausgewaehlt.size;
    wunschlisteBadge.hidden = anzahl === 0;
    wunschlisteBadge.textContent = String(anzahl);
    liste_rendern();

    wunschlisteEintraege.textContent = '';
    wunschlisteLeer.hidden = anzahl > 0;
    var titelListe = [];
    Array.from(ausgewaehlt).sort(function (a, b) { return a - b; }).forEach(function (index) {
      var film = filme[index];
      titelListe.push(film.titel + ' (' + film.format + ')');
      var li = document.createElement('li');
      li.textContent = film.titel + ' – ' + kurzinfo(film);
      wunschlisteEintraege.appendChild(li);
    });

    if (anzahl === 0) {
      wunschlisteMail.setAttribute('aria-disabled', 'true');
      wunschlisteMail.removeAttribute('href');
    } else {
      wunschlisteMail.removeAttribute('aria-disabled');
      var betreff = 'Verleihwunsch: ' + anzahl + ' Film(e) aus deiner Sammlung';
      var text = 'Hallo,\\n\\nfolgende Filme würde ich mir gerne ausleihen:\\n\\n- ' + titelListe.join('\\n- ') + '\\n\\nDanke!';
      wunschlisteMail.setAttribute('href', 'mailto:?subject=' + encodeURIComponent(betreff) + '&body=' + encodeURIComponent(text));
    }
  }

  document.getElementById('wunschliste-oeffnen').addEventListener('click', function () {
    wunschlisteOverlay.classList.add('offen');
  });
  document.getElementById('wunschliste-schliessen').addEventListener('click', function () {
    wunschlisteOverlay.classList.remove('offen');
  });
  wunschlisteOverlay.addEventListener('click', function (ereignis) {
    if (ereignis.target === wunschlisteOverlay) wunschlisteOverlay.classList.remove('offen');
  });
  wunschlisteOverlay.querySelector('.overlay-inhalt').addEventListener('click', function (ereignis) {
    ereignis.stopPropagation();
  });

  document.addEventListener('keydown', function (ereignis) {
    if (ereignis.key !== 'Escape') return;
    detailOverlay.classList.remove('offen');
    wunschlisteOverlay.classList.remove('offen');
  });

  liste_rendern();
  wunschliste_aktualisieren();
})();
</script>
</body>
</html>
`
}

function datumFuerDateiname(): string {
  const jetzt = new Date()
  const zweistellig = (zahl: number) => String(zahl).padStart(2, '0')
  return `${jetzt.getFullYear()}-${zweistellig(jetzt.getMonth() + 1)}-${zweistellig(jetzt.getDate())}`
}

export interface VerleihKatalogErgebnis {
  anzahlFilme: number
  dateiname: string
}

// Erstellt den Verleih-Katalog und löst direkt den Browser-Download aus -
// über einen kurzzeitig erzeugten, unsichtbaren Download-Link (dasselbe
// Muster wie bei der Datensicherung in backup.ts).
export async function verleihKatalogHerunterladen(): Promise<VerleihKatalogErgebnis> {
  const filme = await filmeLaden()
  const verleihFilme = filme.map(felderFuerVerleih)
  const html = verleihKatalogHtmlErzeugen(verleihFilme)
  const dateiname = `filmsammlung-verleih-katalog-${datumFuerDateiname()}.html`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = dateiname
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  return { anzahlFilme: verleihFilme.length, dateiname }
}

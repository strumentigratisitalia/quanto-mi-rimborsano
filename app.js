(function () {
  function track(ev) { try { if (window.goatcounter && goatcounter.count) goatcounter.count({ path: ev, title: ev, event: true }); } catch (e) {} }
  var $ = function (id) { return document.getElementById(id); };
  var volo = $('volo'), treno = $('treno');
  var airports = null, loading = null, sel = { da: null, a: null };
  var last = null;

  // Schede
  ['volo', 'treno'].forEach(function (k) {
    $('tab-' + k).onclick = function () {
      ['volo', 'treno'].forEach(function (j) {
        $('tab-' + j).setAttribute('aria-selected', j === k ? 'true' : 'false');
        $(j).hidden = j !== k;
      });
      $('result').hidden = true;
    };
  });

  // Aeroporti
  function loadAirports() {
    if (!loading) loading = fetch('aeroporti.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      airports = d.map(function (x) {
        return { iata: x[0], city: x[1], name: x[2], country: x[3], lat: x[4], lon: x[5], ue: x[6],
          key: norm(x[0] + ' ' + x[1] + ' ' + x[2] + ' ' + x[3]) };
      });
    }).catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var POPULAR = ['FCO', 'MXP', 'LIN', 'BGY', 'NAP', 'VCE', 'BLQ', 'CTA', 'PMO', 'BRI', 'CAG', 'PSA', 'TRN', 'FLR', 'BDS', 'SUF', 'OLB', 'VRN', 'LHR', 'STN', 'CDG', 'BCN', 'MAD', 'AMS', 'FRA', 'MUC', 'JFK', 'DXB', 'IST', 'ATH'];
  function search(q) {
    q = norm(q.trim());
    if (q.length < 2) return [];
    var exact = [], starts = [], rest = [];
    airports.forEach(function (a) {
      if (norm(a.iata) === q) exact.push(a);
      else if (norm(a.city).indexOf(q) === 0) starts.push(a);
      else if (a.key.indexOf(q) >= 0) rest.push(a);
    });
    var rank = function (a) { var i = POPULAR.indexOf(a.iata); return i < 0 ? 999 : i; };
    starts.sort(function (x, y) { return rank(x) - rank(y); });
    return exact.concat(starts, rest).slice(0, 7);
  }
  function setupAp(id) {
    var input = $(id), list = $(id + '-list'), items = [], active = -1;
    input.addEventListener('focus', function () { loadAirports().catch(function () {}); });
    input.addEventListener('input', function () {
      sel[id] = null; updateVettore();
      loadAirports().then(function () {
        items = search(input.value); active = -1; draw();
      }, function () {
        list.innerHTML = '<li>Elenco aeroporti non caricato. Controlla la connessione e riscrivi.</li>'; list.hidden = false;
      });
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { choose(items[active]); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    function draw() {
      list.innerHTML = '';
      items.forEach(function (a, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = id + '-o' + i;
        if (i === active) { li.className = 'on'; input.setAttribute('aria-activedescendant', li.id); }
        var b = document.createElement('b'); b.textContent = a.iata;
        var s = document.createElement('span'); s.textContent = a.city + ', ' + a.country;
        var sm = document.createElement('small'); sm.textContent = a.name;
        li.append(b, s, sm);
        li.onmousedown = function (e) { e.preventDefault(); choose(a); };
        list.append(li);
      });
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    }
    function choose(a) {
      sel[id] = a; input.value = a.city + ' (' + a.iata + ')'; close(); updateVettore();
    }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  }
  setupAp('da'); setupAp('a');

  function updateVettore() {
    var d = sel.da, a = sel.a;
    $('f-vettore').hidden = !(d && a && d.ue === 0 && a.ue !== 0);
  }

  // Campi condizionali
  function sync() {
    var caso = volo.caso.value;
    $('f-ritardo').hidden = caso !== 'ritardo';
    $('f-preavviso').hidden = caso !== 'cancellato';
    $('f-alt').hidden = caso === 'ritardo';
    $('alt-times').hidden = volo.alt.value !== 'si';
    $('f-causa').hidden = caso === 'negato';
  }
  volo.addEventListener('change', sync);
  sync();

  function fail(id, msg) { var e = $(id); e.textContent = msg; e.hidden = !msg; }

  volo.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!sel.da || !sel.a) return fail('volo-err', 'Scegli partenza e destinazione dall\'elenco che compare mentre scrivi.');
    if (sel.da.iata === sel.a.iata) return fail('volo-err', 'Partenza e destinazione sono lo stesso aeroporto.');
    fail('volo-err', '');
    var caso = volo.caso.value;
    var alt = caso !== 'ritardo' && volo.alt.value === 'si' ? { partenzaPrima: +volo.altPrima.value, arrivoDopo: +volo.altDopo.value } : null;
    var r = Calcolo.volo({
      da: sel.da, a: sel.a, vettoreUe: volo.vettoreUe.value, caso: caso,
      ritardo: +volo.ritardo.value, preavviso: volo.preavviso.value, alternativa: alt,
      causa: caso === 'negato' ? 'nonso' : volo.causa.value, passeggeri: clampP(volo.passeggeri.value)
    });
    track('calcolo-volo');
    last = { tipo: 'volo', r: r, caso: caso, da: sel.da, a: sel.a, pax: clampP(volo.passeggeri.value) };
    show();
  });

  treno.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var prezzo = parseFloat(String(treno.prezzo.value).replace(',', '.'));
    var min = parseInt(treno.minuti.value, 10);
    if (!(prezzo > 0)) return fail('treno-err', 'Scrivi il prezzo del biglietto, per esempio 49,90.');
    if (!(min >= 0)) return fail('treno-err', 'Scrivi i minuti di ritardo all\'arrivo.');
    fail('treno-err', '');
    var r = Calcolo.treno({ vettore: treno.vettore.value, prezzo: prezzo, ritardo: min, causa: treno.causaT.value, passeggeri: clampP(treno.passeggeriT.value) });
    track('calcolo-treno');
    last = { tipo: 'treno', r: r, vettore: treno.vettore.value, prezzo: prezzo, min: min, pax: clampP(treno.passeggeriT.value) };
    show();
  });

  function clampP(v) { v = parseInt(v, 10) || 1; return Math.max(1, Math.min(9, v)); }
  function money(x, cur) { return (cur || '€') === '£' ? '£' + fmt(x) : fmt(x) + ' €'; }
  function fmt(x) { return x.toLocaleString('it-IT', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

  var cardBlob = null;
  var VETTORI = { frecce: 'Trenitalia (Frecce)', ic: 'Trenitalia (Intercity)', regionale: 'Trenitalia (Regionale)', italo: 'Italo', altro: 'la compagnia ferroviaria' };

  function show() {
    var r = last.r, res = $('result');
    res.hidden = false;
    $('stub').className = 'stub' + (r.dovuto ? '' : ' no');
    if (r.dovuto) {
      $('rLabel').textContent = r.probabile === 'bassa' ? (last.pax > 1 ? 'Potrebbero spettarti, a testa' : 'Potrebbero spettarti') : (last.pax > 1 ? 'Ti spettano, a testa' : 'Ti spettano');
      $('rAmount').textContent = money(r.importo, r.valuta);
      var forma = last.tipo === 'treno' ? r.forma : 'in denaro, se lo chiedi';
      $('rSub').textContent = last.pax > 1 ? 'In totale ' + money(r.totale, r.valuta) + ' per ' + last.pax + ' passeggeri, ' + forma : forma.charAt(0).toUpperCase() + forma.slice(1);
    } else {
      $('rLabel').textContent = 'Compensazione';
      $('rAmount').textContent = 'Non dovuta';
      $('rSub').textContent = 'in base alle risposte che hai dato';
    }
    var side = $('rSide'); side.innerHTML = '';
    if (last.tipo === 'volo') {
      addSide(side, last.da.iata + ' → ' + last.a.iata);
      addSide(side, r.km.toLocaleString('it-IT') + ' km');
      addSide(side, r.regime === 'uk' ? 'UK261' : 'Reg. 261/2004');
    } else {
      addSide(side, VETTORI[last.vettore]);
      addSide(side, last.min + ' min');
      addSide(side, 'Biglietto ' + money(last.prezzo));
    }
    $('rWhy').textContent = r.motivo;
    var w = $('rWarn'); w.innerHTML = '';
    r.avvisi.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; w.append(li); });
    $('share').hidden = !r.dovuto;
    $('howto').hidden = !r.dovuto;
    if (r.dovuto) { fillSteps(); fillLetter(); }
    cardBlob = null;
    if (r.dovuto) card().then(function (b) { cardBlob = b; }, function () {});
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function addSide(el, t) { var s = document.createElement('span'); s.textContent = t; el.append(s); }

  function li(html) { var e = document.createElement('li'); e.innerHTML = html; return e; }
  function fillSteps() {
    var s = $('steps'); s.innerHTML = '';
    if (last.tipo === 'volo') {
      s.append(li('Scrivi alla compagnia dal suo modulo reclami online, oppure per PEC o raccomandata. Usa il testo qui sotto e allega la carta d\'imbarco e la prenotazione.'));
      s.append(li('Fallo presto: in Italia i tribunali non sono d\'accordo sul termine, quindi conviene mandare il reclamo <strong>entro 6 mesi</strong> dal volo.'));
      s.append(li('Se dopo 6 settimane non ti hanno pagato o ti hanno risposto di no, fai la conciliazione gratuita su <a href="https://www.autorita-trasporti.it/conciliaweb/" target="_blank" rel="noopener">ConciliaWeb</a> e segnala il caso all\'<a href="https://www.enac.gov.it/passeggeri/diritti-dei-passeggeri/modalita-di-reclamo-per-negato-imbarco-cancellazione-ritardo/" target="_blank" rel="noopener">ENAC</a>.'));
      s.append(li('Non serve un\'agenzia di recupero: trattengono una parte della somma per fare quello che puoi fare tu con questa lettera.'));
    } else {
      var link = last.vettore === 'italo' ? '<a href="https://www.italotreno.com/it/contatti-supporto/gestione-reclami" target="_blank" rel="noopener">la pagina reclami di Italo</a>'
        : last.vettore === 'altro' ? 'il modulo reclami della compagnia'
        : '<a href="https://www.trenitalia.com/it/informazioni/indennizzo-per-ritardodeltreno.html" target="_blank" rel="noopener">la pagina indennizzi di Trenitalia</a> (o l\'app, se hai il biglietto digitale)';
      s.append(li('Chiedi l\'indennizzo da ' + link + '.' + (last.vettore === 'italo' ? ' Per i ritardi oltre un\'ora Italo spesso lo accredita da sola: controlla prima la tua area personale.' : '')));
      s.append(li('Hai tempo fino a <strong>12 mesi</strong> dal viaggio con Trenitalia; con Italo e le altre compagnie conviene farlo <strong>entro 3 mesi</strong>.'));
      s.append(li('Se non rispondono entro un mese o rifiutano senza motivo, puoi fare reclamo all\'<a href="https://autorita-trasporti.it/tutela-diritti-dei-passeggeri-trasporto-ferroviario" target="_blank" rel="noopener">Autorità di regolazione dei trasporti</a> e usare la conciliazione gratuita ConciliaWeb.'));
    }
  }

  function fillLetter() {
    var r = last.r, t;
    if (last.tipo === 'volo') {
      var cosa = last.caso === 'ritardo' ? 'è arrivato a destinazione con oltre tre ore di ritardo' : last.caso === 'cancellato' ? 'è stato cancellato' : 'non mi è stato consentito l\'imbarco contro la mia volontà';
      t = 'Oggetto: Richiesta di compensazione pecuniaria ai sensi del Reg. (CE) 261/2004\n\n' +
        'Spett.le [nome della compagnia],\n\n' +
        'il volo [numero del volo] del [data], da ' + last.da.city + ' (' + last.da.iata + ') a ' + last.a.city + ' (' + last.a.iata + '), prenotazione [codice di prenotazione], ' + cosa + '.\n\n' +
        'Ai sensi ' + (last.caso === 'negato' ? 'degli artt. 4 e 7' : last.caso === 'cancellato' ? 'degli artt. 5 e 7' : 'degli artt. 6 e 7') + ' del Regolamento (CE) 261/2004' + (last.caso === 'ritardo' ? ', come interpretato dalla Corte di giustizia UE (cause C-402/07 e C-432/07),' : '') + ' chiedo la compensazione di ' + money(r.importo, r.valuta) + ' per ' + (last.pax > 1 ? 'ciascuno dei ' + last.pax + ' passeggeri, per un totale di ' + money(r.totale, r.valuta) : 'passeggero') + ', per una tratta di ' + r.km.toLocaleString('it-IT') + ' km.\n\n' +
        'Vi chiedo di versare l\'importo con bonifico entro 30 giorni sull\'IBAN [IBAN] intestato a [nome e cognome]. In mancanza, mi rivolgerò alla conciliazione dell\'Autorità di regolazione dei trasporti e all\'ENAC.\n\n' +
        'Allego carta d\'imbarco e conferma di prenotazione.\n\nDistinti saluti,\n[nome e cognome]\n[indirizzo, email, telefono]';
    } else {
      t = 'Oggetto: Richiesta di indennizzo per ritardo, Reg. (UE) 2021/782\n\n' +
        'Spett.le ' + (last.vettore === 'italo' ? 'Italo - NTV S.p.A.' : last.vettore === 'altro' ? '[nome della compagnia]' : 'Trenitalia S.p.A.') + ',\n\n' +
        'il treno [numero del treno] del [data], da [stazione di partenza] a [stazione di arrivo], biglietto [codice del biglietto] dal prezzo di ' + money(last.prezzo) + ', è arrivato a destinazione con ' + last.min + ' minuti di ritardo.\n\n' +
        'Ai sensi dell\'art. 19 del Regolamento (UE) 2021/782 e delle vostre condizioni di trasporto chiedo l\'indennizzo di ' + money(r.totale) + (last.pax > 1 ? ' per ' + last.pax + ' biglietti' : '') + ', da corrispondere ' + (last.vettore === 'frecce' && last.min < 60 ? 'come bonus' : 'in denaro') + '.\n\n' +
        'Distinti saluti,\n[nome e cognome]\n[email, telefono]';
    }
    $('letter').value = t;
  }

  $('copyLetter').onclick = function () {
    track('copia-reclamo');
    var b = this, t = $('letter').value;
    var ok = function () { b.textContent = 'Copiato'; setTimeout(function () { b.textContent = 'Copia il reclamo'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function () { $('letter').select(); });
    else $('letter').select();
  };
  $('again').onclick = function () { $('result').hidden = true; window.scrollTo({ top: $('volo').offsetTop - 80, behavior: 'smooth' }); };

  $('share').onclick = function () {
    track('condividi-rimborso');
    var r = last.r, site = location.origin + location.pathname.replace(/index\.html$/, '');
    var text = (last.tipo === 'volo' ? 'Il mio volo era in ritardo: mi spettano ' : 'Il mio treno era in ritardo: mi spettano ') + money(r.totale, r.valuta) + '. Controlla quanto spetta a te: ' + site;
    // La card è già pronta da show(): share() parte subito, dentro il tocco dell'utente.
    var file = cardBlob && new File([cardBlob], 'rimborso.png', { type: 'image/png' });
    var wa = function () { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); };
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: text }).catch(function (e) { if (e && e.name !== 'AbortError') wa(); });
    else if (navigator.share) navigator.share({ text: text }).catch(function (e) { if (e && e.name !== 'AbortError') wa(); });
    else wa();
  };

  function card() {
    var c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
    var x = c.getContext('2d'), r = last.r;
    return document.fonts.ready.then(function () {
      x.fillStyle = '#ffd400'; x.fillRect(0, 0, 1080, 1920);
      x.fillStyle = '#141414';
      x.font = '800 64px Archivo'; x.textAlign = 'left';
      x.fillText(last.tipo === 'volo' ? 'Il mio volo era' : 'Il mio treno era', 90, 420);
      x.fillText('in ritardo.', 90, 500);
      x.font = '500 54px Archivo';
      x.fillText('Mi spettano', 90, 700);
      x.font = '900 260px Archivo';
      x.fillText(money(r.totale, r.valuta).replace(' ', ' '), 80, 960, 920);
      x.fillRect(90, 1060, 900, 8);
      x.font = '600 48px Archivo';
      x.fillText(last.tipo === 'volo' ? last.da.iata + ' → ' + last.a.iata + '   ' + r.km.toLocaleString('it-IT') + ' km' : VETTORI[last.vettore] + '   ' + last.min + ' min', 90, 1150, 900);
      x.font = '800 60px Archivo';
      x.fillText('E a te quanto spetta?', 90, 1560);
      x.font = '600 48px Archivo';
      x.fillText('Cerca: Quanto mi rimborsano', 90, 1640);
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    });
  }
})();

// Regole di calcolo. Fonti: Reg. (CE) 261/2004 e giurisprudenza CGUE (voli),
// UK261 (CAA), Reg. (UE) 2021/782, condizioni Trenitalia (ott. 2026) e
// contratto di trasporto Italo (giu. 2025). Verificate il 27/10/2026.
(function (global) {
  function distanza(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }

  // v: { da, a (aeroporti con lat, lon, ue: 0/1/2), vettoreUe: 'si'|'no'|'nonso',
  //      caso: 'ritardo'|'cancellato'|'negato', ritardo: minuti all'arrivo,
  //      preavviso: '14'|'7'|'0', alternativa: { partenzaPrima: min, arrivoDopo: min } | null,
  //      causa: 'tecnica'|'sciopero'|'nonso'|'eccezionale', passeggeri }
  function volo(v) {
    var km = distanza(v.da, v.a);
    var daUe = v.da.ue === 1, aUe = v.a.ue === 1, daUk = v.da.ue === 2, aUk = v.a.ue === 2;
    var regime = null, avvisi = [];
    if (daUe) regime = 'ue';
    else if (daUk) { regime = 'uk'; if (aUe) avvisi.push('Se la compagnia è europea (per esempio ITA Airways, Ryanair, Lufthansa) puoi chiedere invece la compensazione europea, in euro: 250, 400 o 600 €.'); }
    else if (aUe && v.vettoreUe !== 'no') regime = 'ue';
    else if (aUk && v.vettoreUe !== 'no') { regime = 'uk'; avvisi.push('Per i voli verso il Regno Unito da Paesi extra europei la copertura dipende dalla compagnia: verificala con la CAA britannica.'); }
    if (!daUe && !daUk && (aUe || aUk) && v.vettoreUe === 'nonso') {
      avvisi.push('Partendo da fuori Europa sei coperto solo se la compagnia è europea (per esempio ITA Airways, Lufthansa, Ryanair, Air France). Se non lo è, non ti spetta la compensazione.');
    }
    var res = { km: km, regime: regime, importo: 0, valuta: '€', motivo: '', avvisi: avvisi, dovuto: false };
    if (!regime) {
      res.motivo = 'Il volo non parte dall\'Europa e non arriva in Europa con una compagnia europea, quindi il regolamento 261 non si applica.';
      return res;
    }
    var intra = daUe && aUe;
    var fascia = km <= 1500 ? 1 : (km <= 3500 || (intra && regime === 'ue')) ? 2 : 3;
    var base = regime === 'uk' ? [0, 220, 350, 520][fascia] : [0, 250, 400, 600][fascia];
    if (regime === 'uk') res.valuta = '£';
    var soglia50 = [0, 120, 180, 240][fascia];

    if (v.caso === 'ritardo') {
      if (v.ritardo < 180) {
        res.motivo = 'La compensazione scatta con almeno 3 ore di ritardo all\'arrivo (quando si apre il portellone). Ti restano comunque i diritti all\'assistenza.';
        return res;
      }
      res.importo = base;
      if (fascia === 3 && v.ritardo < 240) { res.importo = base / 2; if (regime === 'uk') res.importo = 260; res.motivo = 'Sopra i 3.500 km, con un ritardo tra 3 e 4 ore la compensazione è dimezzata.'; }
      else res.motivo = 'Sei arrivato con 3 ore o più di ritardo su una tratta di ' + fmtKm(km) + '.';
    } else if (v.caso === 'cancellato') {
      var alt = v.alternativa;
      if (v.preavviso === '14') { res.motivo = 'Se la cancellazione ti è stata comunicata almeno 14 giorni prima, la compensazione non è dovuta. Hai comunque diritto al rimborso del biglietto o a un volo alternativo.'; return res; }
      if (alt && v.preavviso === '7' && alt.partenzaPrima <= 120 && alt.arrivoDopo < 240) { res.motivo = 'Avvisato tra 7 e 14 giorni prima, con un volo alternativo che parte al massimo 2 ore prima e arriva meno di 4 ore dopo: la compensazione non è dovuta.'; return res; }
      if (alt && v.preavviso === '0' && alt.partenzaPrima <= 60 && alt.arrivoDopo < 120) { res.motivo = 'Avvisato meno di 7 giorni prima, con un volo alternativo che parte al massimo 1 ora prima e arriva meno di 2 ore dopo: la compensazione non è dovuta.'; return res; }
      res.importo = base;
      if (alt && alt.arrivoDopo <= soglia50) { res.importo = base / 2; res.motivo = 'Il volo alternativo ti ha fatto arrivare entro ' + soglia50 / 60 + ' ore dall\'orario previsto, quindi la compagnia può dimezzare la compensazione.'; }
      else res.motivo = 'Il volo è stato cancellato con poco preavviso su una tratta di ' + fmtKm(km) + '.';
    } else {
      res.importo = base;
      var alt2 = v.alternativa;
      if (alt2 && alt2.arrivoDopo <= soglia50) { res.importo = base / 2; res.motivo = 'Con il volo alternativo sei arrivato entro ' + soglia50 / 60 + ' ore, quindi la compagnia può dimezzare la compensazione.'; }
      else res.motivo = 'Ti è stato negato l\'imbarco contro la tua volontà: la compensazione va pagata subito, in aeroporto.';
    }

    if (v.causa === 'eccezionale' && v.caso !== 'negato') {
      res.avvisi.unshift('Se la causa è davvero meteo estremo, controllo del traffico aereo o sicurezza, la compagnia può rifiutare. Spetta però a lei dimostrarlo: se ti risponde con una formula generica, puoi contestare.');
      res.probabile = 'bassa';
    }
    if (v.causa === 'tecnica' || v.causa === 'sciopero') {
      res.avvisi.push(v.causa === 'tecnica' ? 'Un guasto tecnico di norma non è una circostanza eccezionale (Corte di giustizia UE, causa C-549/07).' : 'Lo sciopero del personale della compagnia non è una circostanza eccezionale (Corte di giustizia UE, causa C-28/20).');
    }
    res.dovuto = res.importo > 0;
    res.totale = res.importo * (v.passeggeri || 1);
    return res;
  }

  // t: { vettore: 'frecce'|'ic'|'regionale'|'italo'|'altro', prezzo, ritardo, causa: 'normale'|'esterna', passeggeri }
  function treno(t) {
    var r = t.ritardo, p = t.prezzo, res = { importo: 0, forma: '', motivo: '', avvisi: [], dovuto: false };
    if (t.causa === 'esterna') {
      res.motivo = 'Con maltempo estremo, calamità o fatti di terzi non evitabili (persone sui binari, furti di cavi, interventi delle forze dell\'ordine) l\'indennizzo non è dovuto. Lo sciopero del personale invece non lo esclude: in quel caso scegli l\'altra risposta.';
      res.totale = 0;
      return res;
    }
    var pct = r >= 120 ? 50 : r >= 60 ? 25 : 0;
    if (t.vettore === 'frecce' && r >= 30 && r < 60) {
      res.importo = round2(p * 0.25);
      res.forma = 'in bonus Trenitalia, non convertibile in denaro e valido 12 mesi';
      res.motivo = 'Sulle Frecce un ritardo tra 30 e 59 minuti dà diritto a un bonus del 25%.';
    } else if (!pct) {
      res.motivo = t.vettore === 'frecce' ? 'Sotto i 30 minuti di ritardo non spetta nessun indennizzo.' : 'L\'indennizzo parte da 60 minuti di ritardo all\'arrivo.';
    } else {
      res.importo = round2(p * pct / 100);
      res.motivo = 'Ritardo ' + (pct === 50 ? 'di 2 ore o più' : 'tra 60 e 119 minuti') + ': ti spetta il ' + pct + '% del prezzo del biglietto.';
      if (t.vettore === 'regionale') {
        if ((pct === 25 && p < 16) || (pct === 50 && p < 8) || res.importo < 4) {
          res.importo = 0;
          res.motivo = 'Sui regionali Trenitalia non paga indennizzi sotto i 4 €: servono biglietti da almeno 16 € (ritardo di 60-119 minuti) o da almeno 8 € (2 ore o più).';
        } else res.forma = 'in buoni o, se lo chiedi, in denaro (automatico con il biglietto digitale regionale pagato con carta)';
      } else if (t.vettore === 'italo') {
        res.forma = 'in voucher Italo valido un anno, convertibile in denaro se supera i 4 €';
      } else if (t.vettore === 'frecce' || t.vettore === 'ic') {
        res.forma = 'in denaro o in bonus, a tua scelta';
      } else {
        res.forma = 'in denaro, se lo chiedi';
        if (res.importo < 4) res.avvisi.push('Sotto i 4 € l\'impresa può legittimamente non pagare.');
      }
    }
    res.dovuto = res.importo > 0;
    res.totale = round2(res.importo * (t.passeggeri || 1));
    return res;
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function fmtKm(km) { return km.toLocaleString('it-IT') + ' km'; }

  global.Calcolo = { volo: volo, treno: treno, distanza: distanza };
})(typeof window !== 'undefined' ? window : globalThis);

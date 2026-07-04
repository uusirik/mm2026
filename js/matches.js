// matches.js — otteludata ja pisteytylogiikka

export const MATCHES = [
  {id:'A1',g:'A',h:'Meksiko',a:'Etelä-Afrikka',dt:'2026-06-11T19:00:00Z'},
  {id:'A2',g:'A',h:'Etelä-Korea',a:'Tšekki',dt:'2026-06-12T02:00:00Z'},
  {id:'B1',g:'B',h:'Kanada',a:'Bosnia & Hertsegovina',dt:'2026-06-12T19:00:00Z'},
  {id:'D1',g:'D',h:'USA',a:'Paraguay',dt:'2026-06-13T01:00:00Z'},
  {id:'B2',g:'B',h:'Qatar',a:'Sveitsi',dt:'2026-06-13T19:00:00Z'},
  {id:'C1',g:'C',h:'Brasilia',a:'Marokko',dt:'2026-06-13T22:00:00Z'},
  {id:'C2',g:'C',h:'Haiti',a:'Skotlanti',dt:'2026-06-14T01:00:00Z'},
  {id:'D2',g:'D',h:'Australia',a:'Turkki',dt:'2026-06-14T04:00:00Z'},
  {id:'E1',g:'E',h:'Saksa',a:'Curaçao',dt:'2026-06-14T17:00:00Z'},
  {id:'F1',g:'F',h:'Alankomaat',a:'Japani',dt:'2026-06-14T20:00:00Z'},
  {id:'E2',g:'E',h:'Norsunluurannikko',a:'Ecuador',dt:'2026-06-14T23:00:00Z'},
  {id:'F2',g:'F',h:'Ruotsi',a:'Tunisia',dt:'2026-06-15T02:00:00Z'},
  {id:'H1',g:'H',h:'Espanja',a:'Kap Verde',dt:'2026-06-15T16:00:00Z'},
  {id:'G1',g:'G',h:'Belgia',a:'Egypti',dt:'2026-06-15T19:00:00Z'},
  {id:'H2',g:'H',h:'Saudi-Arabia',a:'Uruguay',dt:'2026-06-15T22:00:00Z'},
  {id:'G2',g:'G',h:'Iran',a:'Uusi-Seelanti',dt:'2026-06-16T01:00:00Z'},
  {id:'I1',g:'I',h:'Ranska',a:'Senegal',dt:'2026-06-16T19:00:00Z'},
  {id:'I2',g:'I',h:'Irak',a:'Norja',dt:'2026-06-16T22:00:00Z'},
  {id:'J1',g:'J',h:'Argentiina',a:'Algeria',dt:'2026-06-17T01:00:00Z'},
  {id:'J2',g:'J',h:'Itävalta',a:'Jordania',dt:'2026-06-17T04:00:00Z'},
  {id:'K1',g:'K',h:'Portugali',a:'Kongon DT',dt:'2026-06-17T17:00:00Z'},
  {id:'L1',g:'L',h:'Englanti',a:'Kroatia',dt:'2026-06-17T20:00:00Z'},
  {id:'L2',g:'L',h:'Ghana',a:'Panama',dt:'2026-06-17T23:00:00Z'},
  {id:'K2',g:'K',h:'Uzbekistan',a:'Kolumbia',dt:'2026-06-18T02:00:00Z'},
  {id:'A3',g:'A',h:'Tšekki',a:'Etelä-Afrikka',dt:'2026-06-18T16:00:00Z'},
  {id:'B3',g:'B',h:'Sveitsi',a:'Bosnia & Hertsegovina',dt:'2026-06-18T19:00:00Z'},
  {id:'B4',g:'B',h:'Kanada',a:'Qatar',dt:'2026-06-18T22:00:00Z'},
  {id:'A4',g:'A',h:'Meksiko',a:'Etelä-Korea',dt:'2026-06-19T01:00:00Z'},
  {id:'D3',g:'D',h:'USA',a:'Australia',dt:'2026-06-19T19:00:00Z'},
  {id:'C3',g:'C',h:'Skotlanti',a:'Marokko',dt:'2026-06-19T22:00:00Z'},
  {id:'C4',g:'C',h:'Brasilia',a:'Haiti',dt:'2026-06-20T00:30:00Z'},
  {id:'D4',g:'D',h:'Turkki',a:'Paraguay',dt:'2026-06-20T03:00:00Z'},
  {id:'F3',g:'F',h:'Alankomaat',a:'Ruotsi',dt:'2026-06-20T17:00:00Z'},
  {id:'E3',g:'E',h:'Saksa',a:'Norsunluurannikko',dt:'2026-06-20T20:00:00Z'},
  {id:'E4',g:'E',h:'Ecuador',a:'Curaçao',dt:'2026-06-21T00:00:00Z'},
  {id:'F4',g:'F',h:'Tunisia',a:'Japani',dt:'2026-06-21T04:00:00Z'},
  {id:'H3',g:'H',h:'Espanja',a:'Saudi-Arabia',dt:'2026-06-21T16:00:00Z'},
  {id:'G3',g:'G',h:'Belgia',a:'Iran',dt:'2026-06-21T19:00:00Z'},
  {id:'H4',g:'H',h:'Uruguay',a:'Kap Verde',dt:'2026-06-21T22:00:00Z'},
  {id:'G4',g:'G',h:'Uusi-Seelanti',a:'Egypti',dt:'2026-06-22T01:00:00Z'},
  {id:'J3',g:'J',h:'Argentiina',a:'Itävalta',dt:'2026-06-22T17:00:00Z'},
  {id:'I3',g:'I',h:'Ranska',a:'Irak',dt:'2026-06-22T21:00:00Z'},
  {id:'I4',g:'I',h:'Norja',a:'Senegal',dt:'2026-06-23T00:00:00Z'},
  {id:'J4',g:'J',h:'Jordania',a:'Algeria',dt:'2026-06-23T03:00:00Z'},
  {id:'K3',g:'K',h:'Portugali',a:'Uzbekistan',dt:'2026-06-23T17:00:00Z'},
  {id:'L3',g:'L',h:'Englanti',a:'Ghana',dt:'2026-06-23T20:00:00Z'},
  {id:'L4',g:'L',h:'Panama',a:'Kroatia',dt:'2026-06-23T23:00:00Z'},
  {id:'K4',g:'K',h:'Kolumbia',a:'Kongon DT',dt:'2026-06-24T02:00:00Z'},
  {id:'B5',g:'B',h:'Sveitsi',a:'Kanada',dt:'2026-06-24T19:00:00Z'},
  {id:'B6',g:'B',h:'Bosnia & Hertsegovina',a:'Qatar',dt:'2026-06-24T19:00:00Z'},
  {id:'C5',g:'C',h:'Skotlanti',a:'Brasilia',dt:'2026-06-24T22:00:00Z'},
  {id:'C6',g:'C',h:'Marokko',a:'Haiti',dt:'2026-06-24T22:00:00Z'},
  {id:'A5',g:'A',h:'Tšekki',a:'Meksiko',dt:'2026-06-25T01:00:00Z'},
  {id:'A6',g:'A',h:'Etelä-Afrikka',a:'Etelä-Korea',dt:'2026-06-25T01:00:00Z'},
  {id:'E5',g:'E',h:'Curaçao',a:'Norsunluurannikko',dt:'2026-06-25T20:00:00Z'},
  {id:'E6',g:'E',h:'Ecuador',a:'Saksa',dt:'2026-06-25T20:00:00Z'},
  {id:'F5',g:'F',h:'Japani',a:'Ruotsi',dt:'2026-06-25T23:00:00Z'},
  {id:'F6',g:'F',h:'Tunisia',a:'Alankomaat',dt:'2026-06-25T23:00:00Z'},
  {id:'D5',g:'D',h:'Turkki',a:'USA',dt:'2026-06-26T02:00:00Z'},
  {id:'D6',g:'D',h:'Paraguay',a:'Australia',dt:'2026-06-26T02:00:00Z'},
  {id:'I5',g:'I',h:'Norja',a:'Ranska',dt:'2026-06-26T19:00:00Z'},
  {id:'I6',g:'I',h:'Senegal',a:'Irak',dt:'2026-06-26T19:00:00Z'},
  {id:'H5',g:'H',h:'Kap Verde',a:'Saudi-Arabia',dt:'2026-06-27T00:00:00Z'},
  {id:'H6',g:'H',h:'Uruguay',a:'Espanja',dt:'2026-06-27T00:00:00Z'},
  {id:'G5',g:'G',h:'Egypti',a:'Iran',dt:'2026-06-27T03:00:00Z'},
  {id:'G6',g:'G',h:'Uusi-Seelanti',a:'Belgia',dt:'2026-06-27T03:00:00Z'},
  {id:'L5',g:'L',h:'Panama',a:'Englanti',dt:'2026-06-27T21:00:00Z'},
  {id:'L6',g:'L',h:'Kroatia',a:'Ghana',dt:'2026-06-27T21:00:00Z'},
  {id:'K5',g:'K',h:'Kolumbia',a:'Portugali',dt:'2026-06-27T23:30:00Z'},
  {id:'K6',g:'K',h:'Kongon DT',a:'Uzbekistan',dt:'2026-06-27T23:30:00Z'},
  {id:'J5',g:'J',h:'Algeria',a:'Itävalta',dt:'2026-06-28T02:00:00Z'},
  {id:'J6',g:'J',h:'Jordania',a:'Argentiina',dt:'2026-06-28T02:00:00Z'},

  // ── Jatkosarja — avautuu veikattavaksi kun otteluparit selviävät ──────────
  // Viimeinen 32
  {id:'R32_01',g:'R32',h:'TBD',a:'TBD',dt:'2026-06-29T18:00:00Z',tbd:true},
  {id:'R32_02',g:'R32',h:'TBD',a:'TBD',dt:'2026-06-29T21:00:00Z',tbd:true},
  {id:'R32_03',g:'R32',h:'TBD',a:'TBD',dt:'2026-06-30T01:00:00Z',tbd:true},
  {id:'R32_04',g:'R32',h:'TBD',a:'TBD',dt:'2026-06-30T18:00:00Z',tbd:true},
  {id:'R32_05',g:'R32',h:'TBD',a:'TBD',dt:'2026-06-30T21:00:00Z',tbd:true},
  {id:'R32_06',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-01T01:00:00Z',tbd:true},
  {id:'R32_07',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-01T18:00:00Z',tbd:true},
  {id:'R32_08',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-01T21:00:00Z',tbd:true},
  {id:'R32_09',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-02T01:00:00Z',tbd:true},
  {id:'R32_10',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-02T18:00:00Z',tbd:true},
  {id:'R32_11',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-02T21:00:00Z',tbd:true},
  {id:'R32_12',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-03T01:00:00Z',tbd:true},
  {id:'R32_13',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-03T18:00:00Z',tbd:true},
  {id:'R32_14',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-03T21:00:00Z',tbd:true},
  {id:'R32_15',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-04T01:00:00Z',tbd:true},
  {id:'R32_16',g:'R32',h:'TBD',a:'TBD',dt:'2026-07-04T18:00:00Z',tbd:true},

  // Viimeinen 16
  {id:'R16_1',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-06T18:00:00Z',tbd:true},
  {id:'R16_2',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-06T21:00:00Z',tbd:true},
  {id:'R16_3',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-07T18:00:00Z',tbd:true},
  {id:'R16_4',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-07T21:00:00Z',tbd:true},
  {id:'R16_5',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-08T18:00:00Z',tbd:true},
  {id:'R16_6',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-08T21:00:00Z',tbd:true},
  {id:'R16_7',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-09T18:00:00Z',tbd:true},
  {id:'R16_8',g:'R16',h:'TBD',a:'TBD',dt:'2026-07-09T21:00:00Z',tbd:true},

  // Puolivälierät
  {id:'QF_1',g:'QF',h:'TBD',a:'TBD',dt:'2026-07-11T18:00:00Z',tbd:true},
  {id:'QF_2',g:'QF',h:'TBD',a:'TBD',dt:'2026-07-11T21:00:00Z',tbd:true},
  {id:'QF_3',g:'QF',h:'TBD',a:'TBD',dt:'2026-07-12T18:00:00Z',tbd:true},
  {id:'QF_4',g:'QF',h:'TBD',a:'TBD',dt:'2026-07-12T21:00:00Z',tbd:true},

  // Välierät
  {id:'SF_1',g:'SF',h:'TBD',a:'TBD',dt:'2026-07-15T19:00:00Z',tbd:true},
  {id:'SF_2',g:'SF',h:'TBD',a:'TBD',dt:'2026-07-16T19:00:00Z',tbd:true},

  // Pronssiottelu
  {id:'3P',g:'3P',h:'TBD',a:'TBD',dt:'2026-07-18T19:00:00Z',tbd:true},

  // Finaali
  {id:'FIN',g:'FIN',h:'TBD',a:'TBD',dt:'2026-07-19T19:00:00Z',tbd:true},
];

/**
 * Laske pisteet yhdelle veikkaukselle
 *
 * Pistelaskusäännöt (kuvan mukaan):
 *  4p — tulos täysin oikein (1/X/2 + molemmat maalit) [normaali ottelu]
 *  3p — voittaja + toisen joukkueen maalimäärä oikein [normaali ottelu]
 *  2p — vain voittaja oikein [normaali ottelu]
 *  1p — vain toisen joukkueen maalimäärä oikein (väärä voittaja) [normaali ottelu]
 *  3p — loppusijoitus täysin oikein [jatkoaika/rangaistukset]
 *  2p — loppusijoituksessa väärällä sijalla mutta taisteli oikeassa mitaliottelussa [jatkoaika]
 *  1p — bonus: peli oikein tai joukkue väärässä mitaliottelussa [jatkoaika]
 *  0p — ei osumia
 *
 * @param {Object} bet        { prediction: '1'|'x'|'2', home_goals: int, away_goals: int }
 * @param {Object} match      { result: '1'|'x'|'2', home_goals: int, away_goals: int, extra_time: bool }
 * @returns {{ points: number, label: string }}
 */
export function calcPoints(bet, match) {
  if (!match.result) return { points: null, label: null };

  const correctResult = bet.prediction === match.result;
  const correctHome   = bet.home_goals  === match.home_goals;
  const correctAway   = bet.away_goals  === match.away_goals;
  const exactScore    = correctHome && correctAway;

  if (!match.extra_time) {
    // --- Normaali ottelu ---
    if (correctResult && exactScore)
      return { points: 4, label: 'Täysin oikein' };

    if (correctResult) {
      if (correctHome || correctAway)
        return { points: 3, label: 'Voittaja + toisen maalit' };
      return { points: 2, label: 'Vain voittaja' };
    }

    // Väärä tulos — tarkista yksittäiset maalit
    if (correctHome || correctAway)
      return { points: 1, label: 'Toisen joukkueen maalit' };

    return { points: 0, label: 'Ei osumia' };

  } else {
    // --- Jatkoaika / rangaistukset ---
    if (correctResult && exactScore)
      return { points: 3, label: 'Loppusijoitus täysin oikein' };

    // Veikkasi tasapeliä (x), ottelu ratkesi jatkoajalla → taisteli oikeassa mitaliottelussa
    if (!correctResult && bet.prediction === 'x')
      return { points: 2, label: 'Taisteli oikeassa mitaliottelussa' };

    // Veikkasi oikean voittajan mutta maalit väärin tai x→väärä puoli
    if (correctResult)
      return { points: 1, label: 'Bonus: peli oikein' };

    // Väärä joukkue mitaliottelussa
    if ((bet.prediction === '1' && match.result === '2') ||
        (bet.prediction === '2' && match.result === '1'))
      return { points: 1, label: 'Joukkue väärässä mitaliottelussa' };

    return { points: 0, label: 'Ei osumia' };
  }
}

// YLE Fudistietäjä -pisteytys
export function calcPointsYLE(bet, match) {
  if (!match.result) return { points: null, label: null };
  const correctResult = bet.prediction === match.result;
  const correctHome   = bet.home_goals === match.home_goals;
  const correctAway   = bet.away_goals === match.away_goals;
  if (correctResult && correctHome && correctAway) return { points: 30, label: 'Täysin oikein' };
  let pts = 0;
  const parts = [];
  if (correctResult) { pts += 10; parts.push('Lopputulos'); }
  if (correctHome)   { pts += 5;  parts.push('Kotimaalit'); }
  if (correctAway)   { pts += 5;  parts.push('Vierasmaalit'); }
  return { points: pts, label: parts.length ? parts.join(' + ') : 'Ei osumia' };
}

export function isLocked(match) {
  if (match.tbd) return true;
  const dt = match.kickoff || match.dt;
  return Date.now() >= new Date(dt).getTime();
}

export function fmtDate(dtStr) {
  const d = new Date(dtStr);
  return d.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
    + ' ' + d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
}

export function matchResult(match) {
  if (match.result === null || match.result === undefined) return null;
  return {
    label: match.result.toUpperCase(),
    score: `${match.home_goals}–${match.away_goals}${match.extra_time ? ' (ja)' : ''}`,
  };
}

/** validate.js — instant input hints (the server validates again). */

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];

export function isValidAadhaar(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!/^[2-9]\d{11}$/.test(d)) return false;
  let c = 0;
  d.split('').reverse().map(Number).forEach((n, i) => { c = D[c][P[i % 8][n]]; });
  return c === 0;
}

/** Returns an i18n key for a warning, or null when the value looks fine. */
export function fieldWarning(key, value) {
  const v = value === null || value === undefined ? '' : String(value).trim();
  if (!v) return null;
  switch (key) {
    case 'id_number': return isValidAadhaar(v) ? null : 'invalidAadhaar';
    case 'phone': {
      let d = v.replace(/\D/g, '');
      if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
      return /^[6-9]\d{9}$/.test(d) ? null : 'invalidMobile';
    }
    case 'pincode': return /^[1-8]\d{5}$/.test(v.replace(/\s/g, '')) ? null : 'invalidPin';
    case 'pan': return /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/.test(v.toUpperCase().replace(/\s/g, '')) ? null : 'invalidPan';
    case 'ifsc_code': return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase().replace(/\s/g, '')) ? null : 'invalidIfsc';
    default: return null;
  }
}

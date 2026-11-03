// Postgres jsonb::text canonical form: object keys ordered by (byte length, then bytes), ", " and ": " separators.
const crypto = require('crypto');
function jt(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(jt).join(', ') + ']';
  if (typeof v === 'object') { const ks = Object.keys(v).filter(k => v[k] !== undefined).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || (Buffer.from(a) < Buffer.from(b) ? -1 : Buffer.from(a) > Buffer.from(b) ? 1 : 0));
    return '{' + ks.map(k => JSON.stringify(k) + ': ' + jt(v[k])).join(', ') + '}'; }
  return JSON.stringify(v);
}
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
module.exports = { jt, md5 };
if (require.main === module) { const R = require('./rounds.json'); R.forEach(r => { const d = Object.assign({}, r.g); delete d.settledMoney; console.log(r.code, md5(jt(d))); }); }

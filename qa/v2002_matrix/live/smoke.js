const L = require('./lib'); console.log(Object.keys(L.O).map(k => k + ':' + Object.keys(L.O[k]).length).join(' ')); process.exit(0);

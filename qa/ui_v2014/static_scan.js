'use strict';
// Static scan: onclick/on* handler function names and literal getElementById/$() ids
// whose definitions don't exist anywhere in the file. Usage: node static_scan.js [file]
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const src = fs.readFileSync(file, 'utf8');

// ---- defined names ----
const defined = new Set();
const reDef = [/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g, /\bwindow\[['"]([A-Za-z_$][\w$]*)['"]\]\s*=/g];
reDef.forEach(re => { let m; while ((m = re.exec(src))) defined.add(m[1]); });
const BUILTIN = new Set(('if,return,event,this,window,document,history,location,setTimeout,clearTimeout,confirm,alert,prompt,Number,String,JSON,Math,Date,Array,Object,parseInt,parseFloat,encodeURIComponent,decodeURIComponent,navigator,localStorage,sessionStorage,console,typeof,void,new,try,catch,function,open,print,scrollTo,fetch,Promise,isNaN,Boolean,RegExp,Error,Set,Map,requestAnimationFrame,getComputedStyle,structuredClone,Intl,URL,Blob,FormData,CSS,escape,unescape,top,self,parent,close,focus,blur,stopPropagation,preventDefault,closest,querySelector,remove,click,select,classList,toggle,add,contains,matches,showModal,scrollIntoView,setAttribute,getAttribute,removeAttribute,dispatchEvent,appendChild,removeChild,cloneNode,catch,then,finally,forEach,map,filter,find,some,every,includes,indexOf,join,split,slice,trim,toLowerCase,toUpperCase,replace,push,pop,shift,unshift,splice,keys,values,entries,assign,from,of,isArray,stringify,parse,round,floor,ceil,max,min,abs,now,toFixed,toString,getElementById,querySelectorAll,closest,reload,back,go,replaceState,pushState,assign,writeText,share,vibrate,play,pause,load,submit,reset,checkValidity,requestSubmit,switch,while,for,do,else,case,delete,in,instanceof,with,yield,await,async,let,const,var,super,import,export,default,debugger,continue,break,throw,class,extends,static,get,set,null,undefined,true,false,NaN,Infinity,globalThis').split(','));

// ---- handler calls in on*="..." attributes (static HTML and inside JS strings) ----
const handlers = {}; // fn -> [line]
const lineOf = idx => src.slice(0, idx).split('\n').length;
const reAttr = /\bon(?:click|change|input|submit|keyup|keydown|blur|focus|touchstart|pointerdown|mousedown)\s*=\s*(\\?["'])([\s\S]*?)\1/g;
let m;
while ((m = reAttr.exec(src))) {
  const body = m[2];
  const reCall = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g; let c;
  while ((c = reCall.exec(body))) {
    const fn = c[2];
    if (BUILTIN.has(fn)) continue;
    (handlers[fn] = handlers[fn] || []).push(lineOf(m.index));
  }
}
const missingHandlers = Object.keys(handlers).filter(fn => !defined.has(fn)).map(fn => ({ fn, lines: handlers[fn].slice(0, 6), count: handlers[fn].length }));

// ---- ids ----
const idsDefined = new Set();
[/\bid\s*=\s*\\?["']([^"'\\$<>{}+ ]+)\\?["']/g, /\.id\s*=\s*['"]([^'"]+)['"]/g, /setAttribute\(\s*['"]id['"]\s*,\s*['"]([^'"]+)['"]/g, /\bid:\s*['"]([^'"]+)['"]/g].forEach(re => { let x; while ((x = re.exec(src))) idsDefined.add(x[1]); });
// prefixes used in dynamic ids: id="foo-' + x  -> 'foo-'
const dynPrefixes = new Set();
{ const re = /\bid\s*=\s*\\?["']([\w-]*?)(?:['"]\s*\+|\$\{)/g; let x; while ((x = re.exec(src))) if (x[1]) dynPrefixes.add(x[1]); }
const refs = {};
[/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g, /(?:^|[^\w$.])\$\(\s*['"]([^'"]+)['"]\s*\)/g, /querySelector(?:All)?\(\s*['"]#([\w-]+)['"]\s*\)/g].forEach(re => { let x; while ((x = re.exec(src))) (refs[x[1]] = refs[x[1]] || []).push(lineOf(x.index)); });
const missingIds = Object.keys(refs).filter(id => !idsDefined.has(id) && ![...dynPrefixes].some(p => id.startsWith(p) && p.length >= 3)).map(id => ({ id, lines: refs[id].slice(0, 6), count: refs[id].length }));

const out = { file: path.basename(file), definedNames: defined.size, handlerFns: Object.keys(handlers).length, missingHandlers, idRefs: Object.keys(refs).length, missingIds };
if (require.main === module) console.log(JSON.stringify(out, null, 1));
module.exports = out;

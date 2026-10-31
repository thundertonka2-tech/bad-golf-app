import sys
OLD_VER, NEW_VER = 'v2026.11.1981', 'v2026.11.1982'
edits = [
("""        const html = keys.map(k => '<option value="' + k + '">' + label(k) + '</option>').join('');
        const fEl = $('nine-front'), bEl = $('nine-back');
        if (!fEl || !bEl) return;
        const fWas = fEl.value, bWas = bEl.value;
        fEl.innerHTML = html; bEl.innerHTML = html;
        fEl.value = fWas; bEl.value = bWas;
        // Default to two fully-mapped nines when the facility has them and the
        // player has not chosen yet. Only ever changes the DEFAULT.
        const full = keys.filter(k => (cnt[k] || 0) >= 9);
        if (full.length >= 2 && ((cnt[fWas] || 0) < 9 || (cnt[bWas] || 0) < 9)) {
          fEl.value = full[0]; bEl.value = full[1];
        }""",
 """        const fEl = $('nine-front'), bEl = $('nine-back');
        if (!fEl || !bEl) return;
        /* v1982 (Kevin, Firewheel Bridges 10/30): "I tried 3 times Champion/Masters but it had us
           playing Masters/Champion. At home it played right." This lookup used to REPLACE both
           selects' option lists (innerHTML) when it landed and re-set their values. At home it
           lands in milliseconds; on course data it lands a second or two later - while the player
           has the iPhone picker wheel open - and swapping a <select>'s options under an open wheel
           can commit a neighbouring option. Now the option LABELS are updated in place (same
           elements, same values, nothing re-created), and the mapped-nines default is applied only
           when the player has not touched either select yet. */
        const relabel = el => { try { Array.from(el.options).forEach(o => { const t = label(o.value); if (o.textContent !== t) o.textContent = t; }); } catch (e) {} };
        relabel(fEl); relabel(bEl);
        const fWas = fEl.value, bWas = bEl.value;
        const full = keys.filter(k => (cnt[k] || 0) >= 9);
        const touched = !!(fEl._bgTouched || bEl._bgTouched);
        if (!touched && full.length >= 2 && ((cnt[fWas] || 0) < 9 || (cnt[bWas] || 0) < 9)) {
          fEl.value = full[0]; bEl.value = full[1];
        }""",
 "relabel in place"),
("""  $('nine-front').innerHTML = opts; $('nine-back').innerHTML = opts;
  $('nine-front').value = keys[0];
  $('nine-back').value = keys[1] || keys[0];
  $('nine-picker-warn').style.display = 'none';""",
 """  $('nine-front').innerHTML = opts; $('nine-back').innerHTML = opts;
  $('nine-front').value = keys[0];
  $('nine-back').value = keys[1] || keys[0];
  $('nine-picker-warn').style.display = 'none';
  // v1982: remember whether the player has touched a select (the GPS lookup must not move a chosen
  // nine), and say the pairing on the confirm button so what is about to start is unmistakable.
  try {
    [$('nine-front'), $('nine-back')].forEach(el => { el._bgTouched = false; ['pointerdown', 'focus', 'input', 'change'].forEach(ev => el.addEventListener(ev, () => { el._bgTouched = true; try { if (typeof window._bgNinePaintConfirm === 'function') window._bgNinePaintConfirm(); } catch (e) {} })); });
    window._bgNinePaintConfirm = () => {
      try {
        const on = !!($('nine-single-toggle') && $('nine-single-toggle').checked);
        const f = nineSet[$('nine-front').value], b = nineSet[$('nine-back').value];
        const btn = $('nine-confirm'); if (!btn) return;
        btn.textContent = on ? ('Play ' + ((f && f.name) || 'this nine')) : ('Play ' + ((f && f.name) || '?') + ' / ' + ((b && b.name) || '?'));
      } catch (e) {}
    };
  } catch (e) {}""",
 "touched + confirm label"),
("""    if ($('nine-confirm')) $('nine-confirm').textContent = on ? 'Use this nine' : 'Use these nines';
    $('nine-picker-warn').style.display = 'none';""",
 """    if ($('nine-confirm')) $('nine-confirm').textContent = on ? 'Use this nine' : 'Use these nines';
    try { if (typeof window._bgNinePaintConfirm === 'function') window._bgNinePaintConfirm(); } catch (e) {}   // v1982: "Play Champion / Masters"
    $('nine-picker-warn').style.display = 'none';""",
 "confirm label on mode"),
("<!--BGVER=" + OLD_VER + "-->", "<!--BGVER=" + NEW_VER + "-->", "BGVER"),
("const BG_BUILD = '" + OLD_VER + "';", "const BG_BUILD = '" + NEW_VER + "';", "BG_BUILD"),
]
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old); assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched')

import sys
OLD_VER, NEW_VER = 'v2026.11.1980', 'v2026.11.1981'
edits = [
# 1. global: a tap on a button / list row while typing must not blur the field mid-tap
("""      try { window.visualViewport.addEventListener('resize', function () { window._bgVvResizedAt = Date.now(); }); } catch (e) {}   // v1952: course picker tap guard""",
 """      try { window.visualViewport.addEventListener('resize', function () { window._bgVvResizedAt = Date.now(); }); } catch (e) {}   // v1952: course picker tap guard
      /* v1981 (Hoon, 10/30): "pressing a button with the keyboard displayed on my phone is very
         glitchy ... I can't select Firewheel Old at the top of the results unless I press it
         perfectly on the right side or I minimize my keyboard. Same with Add screenshot."
         On Android the tap sequence is: finger down on the row -> the search field loses focus ->
         the keyboard closes -> the viewport resizes and the list jumps -> only THEN the click
         fires, now at a different spot (and the v1952 guard below saw a resize 100 ms ago and
         threw the click away). Keep the focus - and the keyboard - exactly where they are while a
         tap on a button or list row is in flight: nothing moves, the click lands on what the
         finger pressed, and the handler decides afterwards whether to drop the keyboard. */
      try {
        document.addEventListener('pointerdown', function (e) {
          try {
            var a = document.activeElement;
            if (!a || !/^(INPUT|TEXTAREA)$/.test(a.tagName || '') || /^(checkbox|radio|range|file|color)$/i.test(a.type || '')) return;
            var t = e.target && e.target.closest ? e.target.closest('button, [role="button"], .course-list-row, .home-invite-row, .roster-row, .bg-chip') : null;
            if (!t || t === a || t.contains(a)) return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable) return;
            e.preventDefault();          // no blur, no keyboard collapse, no reflow under the finger
            // A real <button> still takes focus on a touch tap (Chrome's tap-focus runs after
            // pointerdown); a tabindex=-1 button does not and still clicks. Park it for the tap.
            if (t.tagName === 'BUTTON' && !t.hasAttribute('tabindex')) {
              t.setAttribute('tabindex', '-1');
              setTimeout(function () { try { if (t.getAttribute('tabindex') === '-1') t.removeAttribute('tabindex'); } catch (e2) {} }, 700);
            }
            window._bgKbHeldAt = Date.now();
          } catch (err) {}
        }, { capture: true, passive: false });
      } catch (e) {}""",
 "hold focus during tap"),
# 2. the picker guard: only a tap that STARTED after the list moved is a stray
("""    row.onclick = async () => {
      // v1952 (Hoon): a tap that lands right after the keyboard closed (the list moved
      // under the finger) is not a choice. Ignore it; the next tap counts.
      try { if (window._bgVvResizedAt && (Date.now() - window._bgVvResizedAt) < 350) return; } catch (e) {}
      if (row.dataset.courseId) { selectCourseById(row.dataset.courseId); return; }""",
 """    row.onpointerdown = () => { row._bgDownAt = Date.now(); };
    row.onclick = async () => {
      // v1952 (Hoon): a tap that lands right after the keyboard closed (the list moved
      // under the finger) is not a choice. Ignore it; the next tap counts.
      // v1981 (Hoon again): ...but a tap whose finger was ALREADY on this row when the keyboard
      // closed IS the choice (Android closes the keyboard between finger-down and click). Only a
      // tap that started after the resize is a stray.
      try { if (window._bgVvResizedAt && (Date.now() - window._bgVvResizedAt) < 350 && !(row._bgDownAt && row._bgDownAt <= window._bgVvResizedAt)) return; } catch (e) {}
      try { const _cs = $('course-search'); if (_cs && document.activeElement === _cs) _cs.blur(); } catch (e) {}   // v1981: the choice is made - now the keyboard can go
      if (row.dataset.courseId) { selectCourseById(row.dataset.courseId); return; }""",
 "picker guard"),
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

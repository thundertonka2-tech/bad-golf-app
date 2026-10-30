import sys
edits = [
("""    if (st.askedAt && (Date.now() - st.askedAt) < 90 * 24 * 3600 * 1000) return false;""",
 """    if (st.askedAt && (Date.now() - st.askedAt) < 30 * 24 * 3600 * 1000) return false;   // v1978 (Tyler): at most once every 30 days (was 90) - the Round Rating ask now runs after every round, so this one stays rare""",
 "store ask 30d"),
("""// Returns true when the prompt was SHOWN (regardless of the answer) so the
// post-finish dispatcher knows not to stack a second prompt on top.
async function bgMaybeAskRating(g) {""",
 """// v1978: is the App Store ask due right now? (same rules bgMaybeAskRating applies, without showing it)
function bgStoreAskDue(g) {
  try {
    if (!g || !Array.isArray(g.players) || g.players.length < 2) return false;
    const st = _bgRateState();
    if (st.done) return false;
    return !(st.askedAt && (Date.now() - st.askedAt) < 30 * 24 * 3600 * 1000);
  } catch (e) { return false; }
}
// Returns true when the prompt was SHOWN (regardless of the answer) so the
// post-finish dispatcher knows not to stack a second prompt on top.
async function bgMaybeAskRating(g) {""",
 "store due helper"),
("""          // v1978 (Tyler): the Round Rating ask for the course just played comes first; the
          // App Store ask and the invite nudge only run when it was not shown (one prompt max).
          let shown = false;
          try { if (typeof bgRRMaybeAsk === 'function') shown = await bgRRMaybeAsk(g); } catch (e) { shown = false; }
          if (!shown) shown = await bgMaybeAskRating(g);
          if (!shown) await bgMaybeNudgeInvite();""",
 """          // v1978 (Tyler, 10/30): "make sure we aren't prompting them too much at the end." ONE
          // prompt per finished round, ever. The Round Rating ask runs after every round; the App
          // Store review ask is capped at once every 30 days and, on the day it is due, takes the
          // slot instead (that round's Round Rating is marked asked so Home doesn't re-ask it).
          // The invite nudge only runs when neither showed.
          let shown = false;
          const _storeDue = (typeof bgStoreAskDue === 'function') && bgStoreAskDue(g);
          if (!_storeDue) { try { if (typeof bgRRMaybeAsk === 'function') shown = await bgRRMaybeAsk(g); } catch (e) { shown = false; } }
          if (!shown) { shown = await bgMaybeAskRating(g); if (shown && g && g.code) { try { localStorage.setItem('golf:rr-asked:' + g.code, '1'); } catch (e) {} } }
          if (!shown) await bgMaybeNudgeInvite();""",
 "chain"),
]
for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old); assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched')

#!/usr/bin/env python3
"""
v1138 -- the read contract, finished. 20 error-discarding reads converted.

Background: qa/bg_query_lint.py --audit lists every `const { data } = await supa.`
read that drops `error`. v1133-v1135 fixed the six the FINDING doc ranked. A full
audit of the remaining 46 found 20 where a failed read produces WRONG BEHAVIOUR
rather than missing data -- and two of those were worse than anything previously
recorded (see the handoff). The other 26 genuinely degrade and are left alone on
purpose: converting them would be churn.

Every edit is anchored on an exact string with `assert count == 1`, and applied
identically to golf-app.html and www/index.html.
"""
import sys, re

FILES = ['golf-app.html', 'www/index.html']
OLD_BUILD = "v2026.11.1137"
NEW_BUILD = "v2026.11.1138"

E = []   # (label, anchor, replacement)


def edit(label, anchor, replacement):
    E.append((label, anchor, replacement))


# ─── 1. t2LaunchDayRounds — a dropped read launched NOTHING, silently ──────────
edit('t2LaunchDayRounds:members',
"""  if (_eligibleGroupIds.length) { try { const { data } = await supa.from('tournament_group_members').select('*').in('group_id', _eligibleGroupIds); _allLaunchMembers = data || []; } catch (e) {} }""",
"""  // v1138: a dropped read left _allLaunchMembers empty, so EVERY group built
  // gp = [] and hit `if (!gp.length) continue` below -- the launch created no
  // rounds, set no group codes and said nothing at all. That is exactly the
  // v986 (T37) symptom documented further down ("its player got NO scorecard,
  // its group_code stayed null, and the day sat waiting forever with nothing on
  // screen to explain why"), reproduced by first-tee wifi instead of a group of
  // one. Refuse the whole launch rather than half-launch it in silence.
  if (_eligibleGroupIds.length) {
    const _lmRead = await _bgRead(() => supa.from('tournament_group_members').select('*').in('group_id', _eligibleGroupIds), 't2LaunchDayRounds:members');
    if (!_lmRead.ok) {
      _t2LaunchInFlight = false;
      try { showToast("Couldn't reach the groups \\u2014 nothing was launched. Check your signal and try again.", 7000); } catch (e) {}
      return;
    }
    _allLaunchMembers = _lmRead.data || [];
  }""")

# ─── 2. t2ChatLoad — `exists` conflated "no row" with "couldn't ask" ───────────
edit('t2ChatLoad:ok',
"""    const { data } = await supa.from('games').select('data,updated_at').eq('code', t2ChatCode(tid)).maybeSingle();
    const msgs = (data && Array.isArray(data.data)) ? data.data : [];
    return withMeta ? { msgs: msgs, updated_at: (data && data.updated_at) || null, exists: !!data } : msgs;""",
"""    // v1138: a failed read returned exists:false, and t2ChatPost's last-resort
    // branch then upserted [oneMessage] over the entire history. `ok` reports
    // whether the server actually answered, so exists:false now means "no row"
    // rather than "we could not ask".
    const _r = await _bgRead(() => supa.from('games').select('data,updated_at').eq('code', t2ChatCode(tid)).maybeSingle(), 't2ChatLoad');
    const data = _r.ok ? _r.data : null;
    const msgs = (data && Array.isArray(data.data)) ? data.data : [];
    return withMeta ? { msgs: msgs, updated_at: (data && data.updated_at) || null, exists: !!data, ok: _r.ok } : msgs;""")

# ─── 3. t2ChatPost — the CAS-free fallback that could wipe the chat ───────────
edit('t2ChatPost:lastWriter',
"""      const cur = await t2ChatLoad(tid);
      const next = cur.concat([m]).slice(-400);
      await supa.from('games').upsert({ code: t2ChatCode(tid), data: next, updated_at: new Date().toISOString() });
      return true;""",
"""      // v1138: this is the last-writer path and it carries NO compare-and-swap.
      // If the re-read failed, `cur` was [] and the upsert replaced the whole
      // chat with a single message. Only take this path on a read we trust.
      const _curMeta = await t2ChatLoad(tid, true);
      if (!_curMeta.ok) {
        try { showToast("Couldn't reach the chat \\u2014 your message wasn't sent. Try again."); } catch (e) {}
        return false;
      }
      const next = (_curMeta.msgs || []).concat([m]).slice(-400);
      await supa.from('games').upsert({ code: t2ChatCode(tid), data: next, updated_at: new Date().toISOString() });
      return true;""")

# ─── 4. openT2Round — a dropped read made WHOEVER opened it the scorer ────────
edit('openT2Round:captain',
"""            try { const { data: _gr } = await supa.from('tournament_groups').select('captain').eq('id', g.t2.groupId).maybeSingle(); _cap = (_gr && _gr.captain) || ''; } catch (e) {}""",
"""            // v1138: a dropped read gave _cap = '' and the `else` below made
          // whoever opened the round the scorer -- two phones scoring one card.
          // Scoring is deliberately NOT blocked (that would strand a group with
          // nobody able to enter a score); the ambiguity is surfaced instead.
          const _grRead = await _bgRead(() => supa.from('tournament_groups').select('captain').eq('id', g.t2.groupId).maybeSingle(), 'openT2Round:captain');
          _cap = (_grRead.ok && _grRead.data && _grRead.data.captain) || '';
          if (!_grRead.ok) { try { showToast("Couldn't confirm the scorekeeper \\u2014 check with your group before entering scores.", 6000); } catch (e) {} }""")

# ─── 5. t2MoveHere — next-slot collapsed to 1 and collided ───────────────────
edit('t2MoveHere:slot',
"""      const { data: _mem } = await supa.from('tournament_group_members').select('slot').eq('group_id', btn.dataset.gid);
      _slot = (_mem || []).reduce((mx, r) => Math.max(mx, parseInt(r && r.slot, 10) || 0), 0) + 1;
    } catch (e) {}""",
"""      // v1138: the `99` seed and the catch were both dead for the likely failure
      // -- the read returns { data: null }, it does not throw. _mem was null, the
      // reduce ran over [], and _slot became 1, colliding with whoever already
      // held slot 1. Refuse the move instead of corrupting the tee order.
      const _memRead = await _bgRead(() => supa.from('tournament_group_members').select('slot').eq('group_id', btn.dataset.gid), 't2MoveHere:slots');
      if (!_memRead.ok) {
        try { showToast("Couldn't read that group \\u2014 nobody was moved. Try again."); } catch (e) {}
        _t2SwapSel = null;
        return;
      }
      _slot = (_memRead.data || []).reduce((mx, r) => Math.max(mx, parseInt(r && r.slot, 10) || 0), 0) + 1;
    } catch (e) {}""")

# ─── 6. t2SetGroupCode — the verify read, same hole v1134 closed elsewhere ────
edit('t2SetGroupCode:verify',
"""    const { data: cur } = await supa.from('tournament_groups').select('game_code').eq('id', groupId).maybeSingle();
    return !!(cur && cur.game_code === code);""",
"""    // v1138: this verify read exists because the compare-and-swap above can match
    // zero rows with no error. If the VERIFY itself failed, `cur` was null and we
    // returned false -- "I did not claim this group" -- when we may well have.
    // Structurally the t2RemovePlayer hole v1134 closed. false is still the answer
    // (the caller must not assume it owns the code), but it is now distinguishable
    // in the log from a genuine loss.
    const _curRead = await _bgRead(() => supa.from('tournament_groups').select('game_code').eq('id', groupId).maybeSingle(), 't2SetGroupCode:verify');
    if (!_curRead.ok) { try { console.warn('t2SetGroupCode: verify read failed for ' + groupId + ' — reporting NOT claimed, but this is unknown, not a loss'); } catch (e) {} return false; }
    const cur = _curRead.data;
    return !!(cur && cur.game_code === code);""")

# ─── 7. t2PersistStandings — failed read re-inserted duplicate match rows ────
edit('t2PersistStandings:existing',
"""          const { data } = await supa.from('tournament_matches')
            .select('id,status,a_points,b_points,group_id').in('group_id', gids.slice(i, i + 200));
          (data || []).forEach(r => { if (r && r.group_id && !existingByGroup[r.group_id]) existingByGroup[r.group_id] = r; });
        } catch (e) {}""",
"""          // v1138: this read is what stops a re-run inserting a SECOND row per
          // group. A failed read produced an empty existingByGroup, so every group
          // looked new and the inserts duplicated. Abort rather than double-write.
          const _exRead = await _bgRead(() => supa.from('tournament_matches')
            .select('id,status,a_points,b_points,group_id').in('group_id', gids.slice(i, i + 200)), 't2PersistStandings:existing');
          if (!_exRead.ok) { try { console.warn('t2PersistStandings: existing-row read failed — skipping persist so nothing is duplicated'); } catch (e) {} return false; }
          (_exRead.data || []).forEach(r => { if (r && r.group_id && !existingByGroup[r.group_id]) existingByGroup[r.group_id] = r; });
        } catch (e) {}""")

# ─── 8. t2NotifyAllPlayers — failed read re-invited everybody ────────────────
edit('t2NotifyAllPlayers:already',
"""    try { const { data } = await supa.from('game_invites').select('to_user').eq('game_code', 'T2:' + t.id); (data || []).forEach(r => already.add(r.to_user)); } catch (e) {}""",
"""    // v1138: `already` is the only thing stopping a re-invite storm. A failed read
    // left it empty, so everyone who had already been invited got invited again.
    const _invRead = await _bgRead(() => supa.from('game_invites').select('to_user').eq('game_code', 'T2:' + t.id), 't2NotifyAllPlayers:already');
    if (!_invRead.ok) { try { console.warn('t2NotifyAllPlayers: could not read existing invites — sending none rather than duplicating'); } catch (e) {} return; }
    (_invRead.data || []).forEach(r => already.add(r.to_user));""")

with open('/tmp/_patch1138_part1.done', 'w') as f:
    f.write('ok')

# part 2 is appended by _patch1138b.py
if __name__ == '__main__':
    import _patch1138b
    E.extend(_patch1138b.E2)
    EXPECTED_EDITS = 19
    assert len(E) == EXPECTED_EDITS, 'expected %d edits, collected %d' % (EXPECTED_EDITS, len(E))

    def indent_of(line):
        return len(line) - len(line.lstrip(' '))

    def apply_edit(lines, label, anchor, repl):
        """Match on STRIPPED lines and re-indent the replacement to whatever the
        file actually uses. Hand-typing leading whitespace across 19 edits in a
        5 MB file is a guaranteed own-goal; the anchor's shape is the contract,
        its indentation is not."""
        a = [l.strip() for l in anchor.split('\n')]
        k = len(a)
        hits = [i for i in range(len(lines) - k + 1)
                if [x.strip() for x in lines[i:i + k]] == a]
        if not hits and k == 1:
            # A few anchors are a PREFIX of their line rather than the whole line
            # (the tail differs between the two builders). Fall back to a unique
            # substring replace, still asserted on count.
            joined = '\n'.join(lines)
            n = joined.count(anchor.strip())
            assert n == 1, 'ANCHOR %s (substring) matched %d times' % (label, n)
            return joined.replace(anchor.strip(), repl.strip(), 1).split('\n')
        assert len(hits) == 1, 'ANCHOR %s matched %d times' % (label, len(hits))
        i = hits[0]
        delta = indent_of(lines[i]) - indent_of(anchor.split('\n')[0])
        out = []
        for l in repl.split('\n'):
            if not l.strip():
                out.append('')
            elif delta >= 0:
                out.append(' ' * delta + l)
            else:
                out.append(l[-delta:] if l[:-delta].strip() == '' else l)
        return lines[:i] + out + lines[i + k:]

    for path in FILES:
        src = open(path, encoding='utf-8').read()
        lines = src.split('\n')
        for label, anchor, repl in E:
            lines = apply_edit(lines, label, anchor, repl)
        src = '\n'.join(lines)
        n = src.count(OLD_BUILD)
        assert n >= 1, 'build stamp %s not found in %s' % (OLD_BUILD, path)
        src = src.replace(OLD_BUILD, NEW_BUILD)
        open(path, 'w', encoding='utf-8').write(src)
        print('patched %-16s  %d edits + build stamp %s -> %s' % (path, len(E), OLD_BUILD, NEW_BUILD))

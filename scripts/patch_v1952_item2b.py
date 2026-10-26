#!/usr/bin/env python3
"""v1952 item 2b — the event page's Units tab also shows who pays whom (the games-card's award list)."""
import sys

EDITS = [(
"""        h += '</div><div class="small-text" style="color:var(--text-muted);text-align:center">Units · tap a player for each game</div>';
      }
    }
  } else if (S.tab === 'tee') {""",
"""        h += '</div><div class="small-text" style="color:var(--text-muted);text-align:center">Units · tap a player for each game</div>';
        /* v1952 (Tyler, 10/26): the texted results now link here instead of attaching the
           games card, so the card's award list lives here too: who pays whom, fewest transfers. */
        try {
          const _md = {}; rows.forEach(r => { _md[r.id] = Number(r.net) || 0; });
          const _st = calculateSettlements(_md, pay.players || []) || [];
          const _nm = id => { const p = (pay.players || []).find(pp => pp && pp.id === id); return p ? (displayFull(p) || p.name || '?') : '?'; };
          h += '<div class="evp-sec" style="margin-top:14px">Final standings' + (pay.allFinished === false ? ' <span class="small-text" style="font-weight:400;color:var(--text-muted)">(provisional)</span>' : '') + '</div><div class="evp-card">';
          if (!_st.length) h += '<div class="evp-row"><span class="n">All square — nobody trails anybody</span></div>';
          else _st.forEach(s => { h += '<div class="evp-row"><span class="n" data-noi18n>' + esc(_nm(s.fromId)) + ' → ' + esc(_nm(s.toId)) + '</span><span class="v">' + esc(bgWhole(s.amount)) + '</span></div>'; });
          h += '</div>';
        } catch (e) {}
      }
    }
  } else if (S.tab === 'tee') {""",
"2b units settlements")]

def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: {len(EDITS)} edits applied')

for p in sys.argv[1:]:
    patch(p)

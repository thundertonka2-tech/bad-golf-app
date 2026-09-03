# Button system phase 2 — what v1455 deliberately did NOT touch

Generated from v2026.11.1454. These are the three carve-outs, listed row by row
so the curation pass has something to work from.


## A. 46 style values built by JS at runtime (the conditional IS the design)

| line | class | style value |
|---|---|---|
| 10470 | `bg-btn bg-btn--danger` | `margin-top:6px;' + btn + '` |
| 10471 | `bg-btn bg-btn--danger` | `margin-top:8px;' + btn + '` |
| 10472 | `bg-btn bg-btn--danger` | `margin-top:8px;' + btn + '` |
| 10994 | `bg-btn` | `border:none;border-radius:999px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;' + (_dashRangeKey === k ? 'background:var(--accent);co` |
| 11309 | `bg-btn bg-btn--chip adm-act` | `flex:1 1 30%;min-width:96px;' + (bg ? 'background:' + bg + ';border-color:' + bg + ';color:#fff;' : '') + 'padding:9px 6px;font-size:13px` |
| 13430 | `bg-btn bg-btn--primary bg-btn--sm att-addw small` | `display:' + (hasW ? 'none' : 'inline-block') + ';margin-top:8px;padding:6px 12px;font-size:12px` |
| 21191 | `bg-btn bg-btn--full` | `width:100%;margin-top:16px;padding:15px;border-radius:12px;border:none;background:'+cfg.col+';color:#fff;font-size:16px;font-weight:800;cursor:pointer` |
| 22022 | `bg-btn bg-btn--full` | `width:100%;text-align:left;padding:14px 16px;margin-top:8px;border-radius:11px;border:1px solid var(--border,var(--border));background:' + (danger ? '` |
| 22027 | `bg-btn bg-btn--primary` | `flex:0 0 auto;padding:9px 14px;border-radius:9px;border:none;background:' + (nextId ? 'var(--accent,var(--accent))' : 'var(--text-muted)') + ';color:#` |
| 22077 | `bg-btn bg-btn--primary bg-btn--full` | `width:100%;box-sizing:border-box;min-height:48px;padding:12px 14px;margin-top:8px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;bor` |
| 50405 | `bg-btn bg-btn--full full` | `' + _btn + '` |
| 50406 | `bg-btn bg-btn--full full` | `' + _btn + '` |
| 51879 | `bg-btn bg-inbox-row-btn` | `background:' + (x.unread ? 'var(--surface-2)' : 'transparent') + '` |
| 52242 | `bg-btn bd-edit` | `' + linkCss + ';' + fs + ';margin-left:10px` |
| 52243 | `bg-btn bg-btn--danger bg-btn--ghost bg-btn--icon bd-del` | `' + linkCss + ';' + fs + ';margin-left:10px;color:var(--danger)` |
| 52251 | `bg-btn bg-btn--ghost bd-edit-cancel` | `flex:0 0 auto;' + linkCss + '` |
| 52286 | `bg-btn bd-more-replies` | `' + linkCss + ';margin-top:2px` |
| 52290 | `bg-btn bg-btn--sm bd-reply small` | `' + linkCss + '` |
| 52617 | `bg-btn hl-bump` | `' + btnCss + '` |
| 52618 | `bg-btn hl-cmt-toggle` | `' + btnCss + '` |
| 54546 | `bg-btn bg-btn--seg swk-holes' + (r.holes === v ? ' primary' ` | `flex:1;min-width:0;min-height:38px;padding:0;font-size:13px;font-weight:700;border-radius:7px;'
    + (r.holes === v ? '' : 'background:transparent;bo` |
| 55791 | `bg-btn fr-s-add` | `' + btn + '` |
| 55798 | `bg-btn bg-btn--danger bg-btn--ghost bg-btn--icon fr-s-remove` | `' + btn + ';border-color:var(--danger);color:var(--danger)` |
| 55801 | `bg-btn bg-btn--primary fr-s-accept` | `' + btn + '` |
| 64304 | `bg-btn bg-btn--full full t2-capopt` | `margin-bottom:6px;font-weight:600' + (normalizeNameSegment(nm) === normalizeNameSegment(current \|\| '') ? ';border:1px solid var(--accent);color:var(` |
| 65130 | `bg-btn bg-btn--full full t2-open-round` | `margin-top:6px;background:' + (info.finished ? 'var(--money-pos)' : 'var(--accent)') + ';color:#fff;border:none;font-weight:800;padding:12px;border-ra` |
| 66205 | `bg-btn t2sh-day` | `flex:0 0 auto;padding:7px 13px;border-radius:999px;font-weight:600;font-size:13px;line-height:1.1;border:1px solid ' + (on ? 'var(--accent)' : 'var(--` |
| 66353 | `bg-btn bg-btn--full full t2ah-b` | `margin-bottom:6px;text-align:left;' + (style \|\| '') + '` |
| 67243 | `bg-btn bg-btn--sm small t2-wd-btn` | `flex:0 0 auto' + (wd ? ';color:var(--accent);border-color:var(--accent)' : '') + '` |
| 68537 | `bg-btn t2c-cap` | `flex:0 0 auto;width:20px;height:20px;border-radius:50%;padding:0;cursor:pointer;' + (on ? 'background:#e5352b;border:2px solid #e5352b' : 'background:` |
| 71172 | `bg-btn t2-logo-stock` | `border:1px solid var(--border);background:' + sl[1] + ';' +
      'border-radius:50%;width:52px;height:52px;font-size:26px;cursor:pointer` |
| 71735 | `bg-btn bg-btn--full full` | `' + (_dgN ? '' : 'margin-top:64px;') + 'background:' + (_dgN ? 'var(--money-pos)' : 'linear-gradient(135deg,#3b8ad6,#0c447c)') + ';color:#fff;border:n` |
| 71789 | `bg-btn bg-btn--primary bg-btn--full full` | `margin-bottom:10px;background:var(--accent);color:#fff;border:none;font-weight:800;font-size:16px;padding:15px' + (_wfEventReady ? '' : ';opacity:.5')` |
| 71817 | `bg-btn bg-btn--primary bg-btn--full full t2-wiz-startbtn` | `margin-top:8px;background:var(--accent);color:#fff;border:none;font-weight:800;font-size:16px;padding:15px;border-radius:12px' + (_wfEventReady ? '' :` |
| 72212 | `bg-btn bg-btn--full t2-day-config-btn' + _wfLk(_wfDi.dateDon` | `width:100%;padding:13px;font-weight:700;font-size:14px;border-radius:11px;border:none;color:#fff;background:' + _cfgBg + '` |
| 78363 | `bg-btn bg-btn--sm small t2-filt-btn` | `flex:1;font-weight:600;' +
      (on ? 'background:var(--accent);color:#fff;border-color:var(--accent)' : '') + '` |
| 78915 | `bg-btn bg-btn--sm small` | `flex:1;padding:8px 6px'
    + (_bgGpsScScope === k ? ';background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700' : '') + '` |
| 79863 | `bg-btn bg-btn--full full ldw-pick` | `text-align:left;margin-bottom:6px;' + (cur.pid === p.id ? 'border:1px solid var(--accent);color:var(--accent);font-weight:700' : '') + '` |
| 81842 | `bg-btn bg-btn--full full lg-row-round` | `margin-top:5px;background:' + (_st === 'complete' ? 'var(--money-pos)' : 'var(--accent)') + ';color:#fff;border:none;font-weight:800;padding:10px;bord` |
| 81867 | `bg-btn bg-btn--full full lg-row-round` | `margin-top:6px;background:' + (_fin ? 'var(--money-pos)' : 'var(--accent)') + ';color:#fff;border:none;font-weight:800;padding:12px;border-radius:10px` |
| 83606 | `bg-btn bg-btn--ghost bg-btn--full danger full` | `margin-top:' + (nm ? '8px' : '0') + '` |
| 83995 | `bg-btn bg-btn--ghost bg-btn--full danger full` | `margin-top:' + (amCommish && mus.length && lgInSetup(sid) ? '8px' : '0') + '` |
| 88337 | `bg-btn bg-btn--danger bg-btn--full danger full` | `margin-top:' + (amCommish && teams.length >= 2 && lgInSetup(sid) ? '8px' : '0') + '` |
| 100868 | `bg-btn bg-btn--full full bg-slot-pick` | `text-align:left;margin-bottom:6px;' + (taken ? 'opacity:0.45;' : '') + '` |
| 102179 | `bg-btn bg-btn--sm small club-up` | `' + arrow + '` |
| 102180 | `bg-btn bg-btn--sm small club-down` | `' + arrow + '` |

## B. 1 style attribute emitted only by a ternary

| line | class | style value |
|---|---|---|
| 86267 | `bg-btn bg-btn--sm small` | `border-color:var(--bg-brand);font-weight:800` |

## C. 3 `--seg` buttons with inline styles (the component gives them nothing)

| line | class | label | style |
|---|---|---|---|
| 57944 | `bg-btn bg-btn--seg rb-tab` | "' + escapeHtml(label) + '" | `flex:1 1 0;min-width:0;padding:10px 6px;font-weight:700;font-size:14px;border-radius:9px;w` |
| 79411 | `bg-btn bg-btn--seg evlb-tab` | '\\u{1F3C6} Tournament' | `flex:1 1 0;min-width:96px;padding:10px 6px;font-weight:700;font-size:14px;border-radius:9p` |
| 79412 | `bg-btn bg-btn--seg evlb-tab` | "Group ' + escapeHtml(Strin" | `flex:1 1 0;min-width:96px;padding:10px 6px;font-weight:700;font-size:14px;border-radius:9p` |

## D. 40 base-only buttons with inline styles (phase 1 could infer no role)

| line | class | label | style |
|---|---|---|---|
| 4654 | `bg-btn` | '✏️ Rename course (admin)' | `display:none;margin-top:8px;background:#111;color:#fff;border:1px solid #111;border-radius` |
| 6677 | `bg-btn` | '🔓 Reopen round' | `display:none;border:1px solid var(--gold);color:var(--gold);font-weight:600` |
| 7839 | `bg-btn` | '📤 Share handicap' | `white-space:normal;line-height:1.2;min-height:48px` |
| 7840 | `bg-btn` | '♻️ Recalculate handicap' | `white-space:normal;line-height:1.2;min-height:48px` |
| 7841 | `bg-btn` | '↩️ Restore rounds' | `white-space:normal;line-height:1.2;min-height:48px` |
| 7842 | `bg-btn` | '⛳ Recompute fairways' | `white-space:normal;line-height:1.2;min-height:48px` |
| 7845 | `bg-btn` | '🔄 Resync my stats' | `white-space:normal;line-height:1.2;min-height:48px` |
| 7972 | `bg-btn` | 'Forgot password?' | `background:transparent;border:none;color:var(--accent-dark);text-decoration:underline;curs` |
| 8015 | `bg-btn` | 'Daily' | `flex:1;min-width:0;min-height:44px;font-size:12px;font-weight:700;padding:4px 6px` |
| 8016 | `bg-btn` | 'Weekly' | `flex:1;min-width:0;min-height:44px;font-size:12px;font-weight:700;padding:4px 6px` |
| 8017 | `bg-btn` | 'Monthly' | `flex:1;min-width:0;min-height:44px;font-size:12px;font-weight:700;padding:4px 6px` |
| 8545 | `bg-btn` | '📤 Invite players to this r' | `font-weight:600;border:1px solid var(--accent);color:var(--accent)` |
| 8550 | `bg-btn` | '🏠 Return home' | `border:1px solid var(--accent);color:var(--accent)` |
| 8945 | `bg-btn` | 'Skip' | `background:none;border:none;color:var(--text-muted);font-size:14px;font-weight:600;cursor:` |
| 12750 | `adm-snap-tile bg-btn` | "'\n      + '' + icon + ' '" | `flex:1 1 calc(50% - 4px);min-width:132px;min-height:76px;text-align:left;padding:10px 11px` |
| 14052 | `bg-btn` | 'Update' | `background:#fff;color:var(--accent);border:none;border-radius:10px;padding:9px 14px;font-w` |
| 20660 | `amc-go bg-btn` | "' + label + ' ' + inner +" | `flex:1;text-align:left;background:transparent;border:none;padding:0;font:inherit;color:var` |
| 21794 | `bg-btn crq-attach` | "📎'+(crqAttachCount(c.id)||" | `padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;c` |
| 21795 | `bg-btn crq-copy1` | '📋 Copy' | `padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;c` |
| 21800 | `bg-btn crq-hist` | "🕘 History ('+crEventCount(" | `flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparen` |
| 21801 | `bg-btn crq-work` | '📝 Log work' | `flex:1;padding:11px;border-radius:9px;border:1px solid var(--border);background:transparen` |
| 21987 | `bg-btn` | "' + actLabel + '" | `flex:0 0 auto;padding:7px 14px;border-radius:8px;border:none;background:var(--accent,var(-` |
| 22025 | `bg-btn` | '‹ List' | `flex:0 0 auto;padding:9px 12px;border-radius:9px;border:1px solid var(--border,var(--borde` |
| 28760 | `'+(!is18?'primary':'')+' bg-btn` | '9 holes' | `flex:1;padding:8px;border-radius:8px` |
| 28761 | `'+(is18?'primary':'')+' bg-btn` | '18 (play twice)' | `flex:1;padding:8px;border-radius:8px` |
| 40942 | `bg-btn` | '\\u{1F3E0} Play my home cou' | `background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:6px` |
| 54506 | `' '') (_swk.cadence + : === ? bg-btn cls primary' v` | "' + label + '" | `flex:1;min-width:0;min-height:44px;font-size:12px;font-weight:700;padding:4px 6px` |
| 54509 | `bg-btn` | 'Single' | `flex:1;min-width:0;min-height:44px;font-size:12px;font-weight:700;padding:4px 6px` |
| 54606 | `bg-btn swk-reuse` | "'\n      + _swkEsc(c.name)" | `min-height:44px;border-radius:22px;font-size:12px;padding:4px 12px` |
| 66421 | `bg-btn t2tn-logo` | "' + (logo ? t2LogoHtml(log" | `flex:0 0 auto;border:1px solid var(--border);background:var(--surface-2);border-radius:12p` |
| 71665 | `bg-btn` | '👥 Bad Golf Users' | `flex:1 1 50%;min-width:0;background:var(--accent);color:#fff;border:none;font-weight:700;p` |
| 71666 | `bg-btn` | '+ New Player' | `flex:1 1 50%;min-width:0;background:#fff;color:var(--accent);border:1px solid var(--accent` |
| 71701 | `bg-btn t2-team-logo-btn` | "' + (logo ? t2LogoHtml(log" | `flex:0 0 auto;border:1px solid var(--border);background:var(--surface-2);border-radius:12p` |
| 73736 | `bg-btn or-tg-cancelall` | 'Cancel all' | `flex:1;color:var(--money-neg);border-color:var(--money-neg)` |
| 77915 | `bg-btn` | 'Fit' | `min-height:38px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.5);bac` |
| 101514 | `bg-btn` | 'Update now' | `margin-top:16px;padding:14px 28px;font-size:16px;font-weight:800;background:#fff;color:#0c` |
| 101526 | `bg-btn` | 'Update' | `flex:0 0 auto;background:#fff;color:#0c447c;border:none;border-radius:10px;padding:8px 12p` |
| 104286 | `bg-btn sr-export` | 'Export' | `background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;padding:5px 10p` |
| 104329 | `bg-btn` | '↺ Match my Rounds list' | `background:#1d6fd6;border:none;color:#fff;border-radius:8px;padding:9px 14px;cursor:pointe` |
| 104670 | `bg-btn` | "✔ Merge '+matches.length+'" | `background:#2b8a3e;border:none;color:#fff;border-radius:8px;padding:9px 16px;cursor:pointe` |
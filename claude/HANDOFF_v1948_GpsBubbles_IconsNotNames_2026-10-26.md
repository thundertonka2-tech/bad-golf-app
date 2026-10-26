# v1948 — GPS bubbles: game icons instead of game names — 2026-10-26

**Ask (Tyler):** "You used the icon here for match play but use the game name for other bubbles. Make them all an icon to save space." Also: "Make sure whatever you do it is mobile friendly."

Build: BG_BUILD = BGVER = v2026.11.1948 (both files, identical app scripts).

## Changes
Icons come from `BG_GAME_ICON` / `bgGameIcon()`, so they match the setup screens.

**Units status chips (`gpsMyStatuses`, bottom of the GPS map):**
- vs-initials → ⚔️ + initials
- TEAM → 👥
- BEST BALL → 🏌️
- COMBO → ➕
- NASSAU F/B/T → 🚩 F/B/T
- QUOTA → 🎯
- HKL → 🔥
- Vegas → 🌴, Daytona Vegas → 🔀
- cross-group match → ⚔️, cross Nassau → 🚩
- NET chip → 💵

The `.mm-ic` class sizes the glyphs at 13px.

**Right-stack bubbles:**

| Before | After |
|---|---|
| LP | 📐 |
| LD | 💥 |
| QUOTA | 🎯 |
| LEADER (Low Net Pool) | 🥇 |
| SPLIX 6'S | ✂️ |
| NINERS | 9️⃣ |
| STBLFD | 📊 |
| BBB | 🔔 |
| Est. Drive | 📏 (same icon the Settings toggle uses) |

- LP and LD with a field leader read "📐 · Kevin Wells" and "💥 · Britt".
- New helper `_bgBubbleLbl(lbl, key, title, who)` writes the label; the label JS uses it so the icon doesn't revert to text.
- Each icon has `role="img"` plus an `aria-label`, and the bubble `title` tooltips are kept.
- Team Quota still shows team names, TEAMS, LEAD and TEAM. Those are information, not game names.

**Mobile CSS:**
- `#gps-right-stack .lbl .bic` is 15px.
- `.lbl` is nowrap with an ellipsis at max-width 120px, so a long name can't widen the stack.

## Verified
- Rendered at 390×844 (touch, 2×):
  - icon-only bubbles are 47px wide (before, labels like "SPLIX 6'S" set the width)
  - the LP-with-name bubble is capped at 120px
  - the stack stays on the right edge
- `qa_all` 85/85, watch phase 1 62/62, phase 2 42/42, nine-mode 69/69, Wolf 23/23, cross-match 4/4, on both files.
- All guards clear. Both files end `</html>`.

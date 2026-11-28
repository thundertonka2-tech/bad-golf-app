# HANDOFF v2026.11.2093 — New tournament wizard: stuck on "What's it called?" with the name highlighted

**Date:** 2026-11-28 · **Branch:** main · **Files:** `golf-app.html`, `www/index.html` · **Patch:** `scripts/patch_v2093_wizard_next_with_keyboard_selectall_loop.py`

## What Tyler reported (iPhone screen recording, 4:26 am)
"I am having this strange issue on the phone when setting up a new tournament. It highlights the text then I get stuck here."

## What the recording shows (frame by frame)
Step 2 of 5, name already typed. He taps into the name → **all of it is highlighted**. He taps **Next** (the button visibly darkens) → the highlight drops, the step does not move, and a moment later the whole name is highlighted again. Repeats on every tap. Only after the keyboard is put away does Next work.

## Cause (two things feeding each other)
1. An app-wide rule selects **everything** in any text or number box when it gets focus (`focusin` → `select()`), written so a handicap of "0" is replaced by the next key. It also fired on this 22-character name.
2. With a text selection on screen, iOS spends the next tap on clearing the selection; the button shows pressed but its `click` never arrives. Focus then lands back on the box, rule 1 fires again, and the loop is closed.

**Not reproduced on a phone** — Chromium does not swallow the tap the way iOS does. The diagnosis is from the recording plus the code; the test drives the same sequence (press reaches the button, no click).

## Fix
- **Select-all-on-focus** now applies to number boxes and to text of **8 characters or fewer**, and never twice on the same box inside 1.5 s. A longer text value gets a caret where you tapped. (`data-no-select-all="true"` still opts a box out completely.)
- The wizard's **name box** opts out.
- The wizard's **Next / Create** button also listens for the finger lifting: a press that started and ended on the button, with no click within 300 ms, runs the button once. A normal tap still moves exactly one step.

**App-wide side effect to know about:** any text box holding more than 8 characters (a player's name, a course search you return to, an event name) is no longer highlighted when tapped. Short boxes and every number box behave as before.

## QA
- `qa/qa_v2093_wizard_next_keyboard_selectall.js` — 17 checks on both files.
- Full `qa/qa_*.js` sweep by exit code, `npm test` 82/82, guards clear — counts in the commit message.
- Docs rebuilt at v2093. No new strings.
- **Not run on a real iPhone.** The web app has it now; the iOS app needs the next Codemagic build before Tyler can confirm on TestFlight.

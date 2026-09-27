# tools/qa — Claw'd animation QA harness

Built from `80_DesktopPet/_work/anim_plan_20260926.md` (§7 "C", §8). Everything writes only to
`ClaudeCodePet/tmp/` and `tools/qa/out/` (both gitignored). Python = `"E:/Vibegaming playground/30_Tools/py311/python.exe"`.
Run commands from `ClaudeCodePet/`.

| file | what |
|---|---|
| `contract.json` | Appendix A, verbatim |
| `check_contract.py [--part rows\|overlays\|all] [--json]` | static checks (§8.1); exit 1 on any FAIL; report in `out/check_report.txt` |
| `contact_sheet.py [targets]` | `rows_new rows_all aliases trot_vs_run` (Gate 1), `hats emotes emote_on_rows tints bg_contrast` (Gate 2) → `out/*.png`; `emote_on_rows` places hats/emotes with `renderer/overlay.js` via `overlay_bridge.js` (Python port only without node) and prints a port-vs-runtime parity count |
| `preview.html` + `ref_overlay.js` | one pet stage in a browser; uses `renderer/overlay.js` when present, else the reference impl (labelled) |
| `shot.ps1 [-List f] [-Only glob] [-Label] [-Root rel/]` | headless-Chrome shots of `preview.html` from `shots_default.txt` → `out/shots/` + montage |
| `montage.py` | labelled grid of PNGs |
| `spec_bitmaps.py` | Appendix B.4 hat bitmaps (the hat check compares hats.webp pixel by pixel) |
| `selftest_mock.py` | builds a fake renderer folder in `tmp/c/mock_renderer` to test the tools (`CLAWD_QA_RENDERER`, `CLAWD_QA_OUT`) |
| `dev/start_dev.ps1 [-DryRun] [-NoCdp]` / `dev/stop_dev.ps1` | dev pet on 31127, userData `tmp/dev-profile`, captures `tmp/qa`; start returns at once (detached, hidden launcher); `tmp/dev.pid` = `<pid> <StartTime>`; stop first asks the app to quit cleanly (cdp.js evals `window.ccPet.quit()` over the DevTools port, only when that port and the dev HTTP port belong to the same verified repo electron), then kills by PID only after `dev/devproc.ps1` verifies it (same start time, this repo's electron / launcher), else falls back to the repo electron listening on the dev port |
| `dev/scenarios.sh [groups\|gate12\|gate3]` | Gate 3 groups: `hnotify h1 h2 burst h3 h3cap h5 h6 h7 h9 h11 h12 h13 h14 h15 h18 h20 h21 hbg hoff holdnotify hmatrix hlive` (+ on-screen `hfling`); fixtures via replay.sh, `hook_fresh` clears the P2 gap / cooldowns over DevTools; H12/H18/H20 use `/debug/date`; env `QA_NOTIFY`, `HLIVE_SECS` (300), `REACTIONS_ACTION` (toggle-reactions), `HOOK_FRESH_SLEEP`. Gate 1-2 triggers via `/debug/*` (+ `/action`, `/idle`, `/status`), captures → `out/dev/run-*/` + montage + `results.tsv`. Default: only groups with the window parked at x -320; `QA_ON_SCREEN=1` adds the on-screen ones (drags, flings, roam, edge-hide, perch), run last and parked again after each. Exit / Ctrl-C restores roam, mischief, hide, perch |
| `dev/cdp.js` | synthesised drag / hover / tickle / file-drag input over the dev renderer's DevTools port (never the real cursor) |
| `dev/lib.sh` | curl + JSON helpers (every `/debug/*` call sends `X-Clawd-Debug: 1`), idempotent `set_flag`, `settle_idle`, exit trap; a leftover debug pose (`/debug/anim {climb, hidden}`) on the parked window is cleared in place, never walked back with toggle-hide |
| `dev/watch.js` | one keep-alive sampler of `/debug/state` (25 ms) behind `wait_state` / `seq_state`, so short events (blink, dangle-scared) are not missed |
| `dev/hooks/*.json` | Gate 3 hook fixtures written from the documented hook schemas by `dev/make_fixtures.js` (names cited there; SessionStart / SessionEnd / Notification / UserPromptSubmit also carry the §4.6 / live-notify name of the same value). `expected.json` = the §4.6 tags each fixture must produce; `seq_*.txt` = sequences (`+ms` pauses) for the inference paths, parallel agents and the 10-event burst; `future/` = PostToolUseFailure (not registered, never replayed) |
| `dev/replay.sh` (driver `dev/replay.js`) | `CLAWD_PORT=31127 CLAWD_NO_REVIVE=1 node hooks/notify.next.js <Event> < fixture` per token; `-s/-S` session ids, `-u` tool_use_id suffix, `-m` mode, `-g` fixed-rate gap, `--seq`, `--notify next\|baseline\|ref\|<path>`, `--check`. Refuses `hooks/notify.js`, port 31126 and any script that does not read `CLAWD_PORT` (`dev/notify_util.js`) |
| `dev/check_notify.js [--notify …]` | F1 without a pet: runs the notify script against its own capture server for every fixture; legacy status/message, §4.6 tags, tag domains, privacy sentinels, no CJK, and the +5 ms median (interleaved with the old notify) → `out/dev/notify_check_<label>.tsv` |
| `dev/ref_notify.js` | QA reference of §4.6 (self-test oracle only; refuses to run without `CLAWD_PORT`). `baseline` = `git show HEAD:hooks/notify.js` copied to `tmp/c/notify_baseline.js` with only its port line reading `CLAWD_PORT` ("old notify") |
| `dev/mock_server.js` | self-test fake of the debug API on port 31199 (plumbing, toggles incl. the hide walk and `mockHideWalks`, debug climb/hidden poses, `/mock/blink`); use `CLAWD_CDP_PORT=9299` with it so cdp.js never reaches a real dev renderer |

Checks derived from the spec rather than Appendix A (so the lead can overrule them): R11 flag table
(TINTED/MIRRORED/view exact, HAT_OK/EMOTE_OK/FACE_OK on every new-row frame), R11c/R13 are WARN-level.

Order for a gate: `check_contract.py` → `contact_sheet.py` → `shot.ps1` → `dev/start_dev.ps1` →
`dev/scenarios.sh` → `dev/stop_dev.ps1`. Only one dev instance at a time; never port 31126.

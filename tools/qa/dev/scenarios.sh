#!/usr/bin/env bash
# scenarios.sh - Gate 1-3 behaviour scenarios against the DEV pet (spec §7 C, §8.3, F1).
#
#   powershell -ExecutionPolicy Bypass -File tools/qa/dev/start_dev.ps1     # first (one dev instance at a time)
#   bash tools/qa/dev/scenarios.sh [group ...]                              # default: every group
#   bash tools/qa/dev/scenarios.sh gate3                                    # aliases: gate12, gate3
#   powershell -ExecutionPolicy Bypass -File tools/qa/dev/stop_dev.ps1      # last
#
# Groups, window parked at x -320 (default): f7 anim alias d8 d9 d13 d15 d16 d18 d19 f8 f5 emotes
#        overlay hats autohats matrix
#   Gate 3 (hook fixtures through hooks/notify.next.js, see the Gate 3 block): hnotify h1 h2 burst h3
#        h3cap h5 h6 h7 h9 h11 h12 h13 h14 h15 h18 h20 h21 hbg hoff holdnotify hmatrix hlive
#        (hlive waits HLIVE_SECS, default 300 s; QA_NOTIFY=ref|baseline|<path> swaps the notify script)
# ON-SCREEN groups (only with QA_ON_SCREEN=1; run last, each from a known spot, parked again after):
#        d1 d2 d3 d5 d6 d7 d11 d13_live d17 overlay_live matrix_live hfling
# (d12 is covered by d11, d14 by d13 / d13_live, f6 by d18.) Any exit, Ctrl-C included, switches roam and
# mischief off, leaves edge-hiding and perches, clears /debug/date and parks the window (lib.sh trap).
# Every trigger goes through /debug/* (header X-Clawd-Debug: 1), the existing /action, /idle, /status
# and /debug/usage routes of the DEV pet, or tools/qa/dev/cdp.js (synthesised mouse / file-drag input
# over the dev renderer's DevTools port; the real cursor is never moved). /debug/capture is called at
# each read frame; captures are copied to tools/qa/out/dev/run-<stamp>/ with results.tsv and a montage.
#
# Env: CLAWD_QA_PORT (31127), CLAWD_CDP_PORT (9231), QA_ON_SCREEN=1 enables the ON-SCREEN groups,
# TRICK_IDS to override the D19 menu action ids. No group moves the user's real cursor: the dev pet
# drops every cursor SET (lead decision 7) and the steal (d13_live) runs on a /debug/cursor fake.
# Hook fixtures never go through hooks/notify.js (the live hook) and never to port 31126 (replay.sh).
# Env for Gate 3: QA_NOTIFY, HLIVE_SECS, REACTIONS_ACTION (menu action id, default toggle-reactions).

# (no set -u: helpers take optional positional args)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# ── preflight ───────────────────────────────────────────────────────────
# One plain request first, so a refusal is named instead of looking like "no dev pet":
# main.js answers 403 {"error":"bad Host"} when the Host header is not 127.0.0.1:<port> / localhost:<port>
# (DNS-rebinding guard), and 403 on a missing X-Clawd-Debug header.
PF="$(curl -s -m 5 -H "$HDR" -w $'\n%{http_code}' "$BASE/debug/state")"
PF_CODE="${PF##*$'\n'}"; S0="${PF%$'\n'*}"
if [ "$PF_CODE" = 403 ]; then
  if printf '%s' "$S0" | grep -qi "bad host"; then
    echo "The dev pet on $BASE refused GET /debug/state with 403 \"bad Host\"."
    echo "Cause: the request's Host header is not 127.0.0.1:$QA_PORT or localhost:$QA_PORT (a proxy, a hosts-file"
    echo "alias or an http_proxy/HTTP_PROXY variable rewriting it). Unset the proxy (or add 127.0.0.1 to NO_PROXY) and rerun."
  else
    echo "The dev pet on $BASE refused GET /debug/state with 403 (${S0:0:120})."
    echo "Cause: the X-Clawd-Debug: 1 header did not arrive (something between curl and the pet strips it)."
  fi
  rm -rf "$RUN_DIR"
  exit 2
fi
if [ -z "$(jv "$S0" 'o.anim')" ]; then
  echo "No dev pet answering GET $BASE/debug/state (with the debug header; HTTP ${PF_CODE:-none})."
  echo "Start it with: powershell -ExecutionPolicy Bypass -File tools/qa/dev/start_dev.ps1"
  rm -rf "$RUN_DIR"   # the empty run folder lib.sh just made
  exit 2
fi
HAVE_CDP=0; cdp_ok && HAVE_CDP=1
echo "dev pet on $BASE: anim=$(jv "$S0" o.anim) rowsAvailable=$(jv "$S0" o.rowsAvailable) mischief=$(jv "$S0" o.mischief) roam=$(jv "$S0" o.roam) x=$(jv "$S0" o.win.x) cdp=$HAVE_CDP"
echo "run dir: $RUN_DIR"
arm_cleanup   # from here on, any exit (Ctrl-C included) turns roam / mischief / hide / perch off and parks the window
# An aborted earlier run can leave roam or mischief on, or the window on the user's screen
if [ "$(jv "$S0" o.roam)" = true ] || [ "$(jv "$S0" o.mischief)" = true ]; then
  echo "  roam/mischief left ON by an earlier run: switching both off"
  set_flag roam false; set_flag mischief false
fi
x0="$(jv "$S0" o.win.x)"
if [ -n "$x0" ] && [ "$x0" -ge 0 ] 2>/dev/null; then ONSCREEN_USED=1; park; fi
need_cdp() { if [ "$HAVE_CDP" = 1 ]; then return 0; fi; res "$1" "$2" SKIP "no DevTools port $CDP_PORT (start_dev.ps1 without -NoCdp)"; return 1; }

NEW_ROWS="look:3 hop:3 dangle:1 dizzy:2 surprised:5 plotting:0 yawn:3 love:0 laugh:2 nervous:0 fingers-crossed:2 sad:4 summon:6 chomp:2 furious:2 work-read:4 work-shell:4 dance:2 cool:7 trot:4 fall:0"
ALIASES="hop-land:0 dangle-scared:0 startle:1 busted:4 summon-return:2 chomp-open:0 trot-stop:0 squint:0"
TRICK_IDS="${TRICK_IDS:-dance:dance cool:cool boo:surprised chomp:chomp love:love yawn:yawn}"

# ── F7: header gate, CORS, dev defaults ─────────────────────────────────
g_f7() {
  echo "== F7 debug gating and dev defaults"
  for r in "POST /debug/anim" "POST /debug/hook" "POST /debug/emote" "POST /debug/hat" "POST /debug/date" \
           "POST /debug/cursor" "POST /debug/skin" "POST /debug/capture" "GET /debug/state"; do
    set -- $r
    c="$(code_of -X "$1" -H "Content-Type: application/json" --data '{}' "$BASE$2")"
    [ "$1" = GET ] && c="$(code_of "$BASE$2")"
    expect_eq F7 "$r without header -> 403" "$c" 403
  done
  # positive path: with the header and curl's default Host (127.0.0.1:<port>) the route answers
  c="$(code_of -H "$HDR" "$BASE/debug/state")"
  expect_eq F7 "GET /debug/state with header + default Host -> 200" "$c" 200
  c="$(code_of -H "$HDR" -H "Host: localhost:$QA_PORT" "$BASE/debug/state")"
  expect_eq F7 "GET /debug/state with header + Host localhost:<port> -> 200" "$c" 200
  # DNS-rebinding guard: the header is present but the Host names another site
  body="$(curl -s -m 5 -H "$HDR" -H "Host: evil.example:$QA_PORT" -w $'\n%{http_code}' "$BASE/debug/state")"
  expect_eq F7 "GET /debug/state with header + Host evil.example:<port> -> 403" "${body##*$'\n'}" 403
  expect_match F7 "  ... and the body names the bad Host" "${body%$'\n'*}" "[Bb]ad Host"
  c="$(code_of -X POST -H "$HDR" -H "Host: evil.example:$QA_PORT" -H "Content-Type: application/json" \
       --data '{"name":"idle"}' "$BASE/debug/anim")"
  expect_eq F7 "POST /debug/anim with header + Host evil.example:<port> -> 403" "$c" 403
  hdrs="$(curl -s -i -m 5 -X OPTIONS -H "Origin: http://evil.example" -H "Access-Control-Request-Method: POST" \
          -H "Access-Control-Request-Headers: x-clawd-debug" "$BASE/debug/anim")"
  expect_match F7 "OPTIONS /debug/anim -> 403" "$(printf '%s' "$hdrs" | head -1)" " 403"
  if printf '%s' "$hdrs" | grep -qi "^access-control-allow-origin"; then res F7 "OPTIONS has no ACAO" FAIL "header present"; else res F7 "OPTIONS has no ACAO" PASS; fi
  expect_eq F7 "dev starts with mischief off" "$(st mischief)" false
  expect_eq F7 "dev starts with roam off" "$(st roam)" false
  c="$(code_of -X POST -H "$HDR" -H "Content-Type: application/json" --data '{"name":"../x"}' "$BASE/debug/capture")"
  expect_match F7 "capture rejects a bad name" "$c" "^4"
  c="$(code_of -X POST -H "$HDR" -H "Content-Type: application/json" --data '{"file":"../main.js"}' "$BASE/debug/skin")"
  expect_match F7 "skin rejects a non-sheet file" "$c" "^4"
  res F7 "live pet untouched" INFO "check the live pet log for no 'second-instance' line; GET 31126/status is not called by this script"
}

# ── F2: every row and alias through /debug/anim ─────────────────────────
g_anim() {
  echo "== F2 rows 22-42 (hold at the read frame, then play)"
  for e in $NEW_ROWS; do
    n="${e%%:*}"; k="${e##*:}"
    r="$(anim "$n" "$k")"
    expect_eq F2 "$n frames" "$(jv "$r" o.frames)" "$(contract_frames "$n")"
    expect_eq F2 "$n no fallback on the built-in sheet" "$(jv "$r" o.fallbackUsed)" false
    sleep 0.15
    capture "anim_${n}_f$k" "$n f$k (hold)"
    anim "$n" >/dev/null
    sleep 0.2
    expect_eq F2 "$n plays (state.anim)" "$(st anim)" "$n"
  done
  r="$(anim trot 4 flip)"; sleep 0.15
  expect_eq F2 "trot flip -> state.flip" "$(st flip)" true
  capture "anim_trot_f4_flip" "trot f4 flipped"
  # one-shot replays, loop re-apply keeps the frame
  anim hop >/dev/null; sleep 0.5; anim hop >/dev/null; sleep 0.05
  expect_match F2 "one-shot hop replays from f0" "$(st frame)" "^[01]$"
  settle_idle
}

g_alias() {
  echo "== F2 aliases"
  for e in $ALIASES; do
    n="${e%%:*}"; k="${e##*:}"
    r="$(anim "$n" "$k")"
    expect_eq F2 "$n frames" "$(jv "$r" o.frames)" "$(contract_frames "$n")"
    sleep 0.15
    capture "alias_${n}_f$k" "$n f$k (hold)"
  done
  settle_idle
}

# ── D1-D3: drag (cdp; ON-SCREEN groups) ─────────────────────────────────
# pet.js counts a window within 40 px of a screen side as "near the edge" (dangle-scared), and the
# parked dev window sits at x -320, so D1/D2 only mean something once place_onscreen has run.
on_screen_ok() { # id check
  local x; x="$(win_x)"
  if [ -n "$x" ] && [ "$x" -ge 40 ]; then return 0; fi
  res "$1" "$2" SKIP "window at x=$x (off-screen / at the edge counts as near-edge: dangle-scared)"; return 1
}
g_d1() {
  echo "== D1 drag start / plain click"
  need_cdp D1 "drag start" || return
  on_screen_ok D1 "drag start" || return
  cdp down
  v="$(wait_state anim '^dangle' 600)"
  expect_eq D1 "held 300 ms -> dangle" "$v" dangle
  capture d1_dangle "D1 dangle while held"
  cdp up; sleep 1.5
  wait_state moveKind '^(null|)$' 4000 >/dev/null
  cdp click
  s="$(seq_state anim 600)"
  if printf '%s' "$s" | grep -q dangle; then res D1 "plain click never flashes dangle" FAIL "$s"; else res D1 "plain click never flashes dangle" PASS "$s"; fi
  sleep 1.2; capture d1_click_usage "D1 single click -> usage card"
  settle_idle
}

g_d2() {
  echo "== D2 fast drag -> dangle-scared"
  need_cdp D2 "fast drag" || return
  on_screen_ok D2 "fast drag" || return
  cdp down; sleep 0.25
  cdp move 420 0 250 12 &          # 1680 px/s > SCARED_SPEED 1400; sampled while it moves
  v="$(wait_state anim '^dangle-scared$' 1000)"
  expect_eq D2 "fast move -> dangle-scared" "$v" dangle-scared
  capture d2_scared "D2 dangle-scared"
  wait
  v="$(wait_state anim '^dangle$' 1200)"
  expect_eq D2 "400 ms calm -> dangle" "$v" dangle
  cdp move -420 0 3000 30
  cdp up; sleep 2.5
  settle_idle
}

g_d3() {
  echo "== D3/D4 slow release above ground -> fall, hop-land"
  need_cdp D3 "slow drop" || return
  cdp down; sleep 0.25
  cdp move 0 -160 1600 20
  sleep 0.5
  cdp up
  s="$(seq_state anim 3500)"
  expect_match D3 "fall then hop-land" "$s" "fall.*hop-land"
  res D4 "fallToGround shows fall + hop-land" INFO "covered by D3 (same fallToGround path): $s"
  settle_idle
}

# ── D5-D7: flings ───────────────────────────────────────────────────────
wait_landed() { wait_state moveKind '^(null|)$' 8000 >/dev/null; }
# D5-D7 count flings inside pet.js's 120 s window (the 3rd lands furious, then drag flings are
# refused). Flings from an earlier run or group would shift that count, so D5 starts from zero.
fling_fresh() {
  [ "$HAVE_CDP" = 1 ] || { res D5 "fling counter fresh" INFO "no DevTools port: assumes no fling in the last 120 s"; return 0; }
  local c; c="$(cdp eval 'typeof flingTimes === "undefined" ? "n/a" : flingTimes.length + "/" + flingThirdAt')"
  if [ "$c" != '"0/0"' ] && [ "$c" != '"n/a"' ]; then
    cdp eval 'flingTimes = []; flingThirdAt = 0; true' >/dev/null
    res D5 "fling counter fresh" INFO "reset counters left by an earlier fling ($c)"
  fi
}
g_d5() {
  echo "== D5 fling landing -> dizzy"
  fling_fresh
  ppost /action '{"action":"fling"}' >/dev/null
  sleep 0.3; capture d5_midair "D5 mid-fling"
  wait_landed
  v="$(wait_state anim '^dizzy$' 1500)"
  expect_eq D5 "landing -> dizzy" "$v" dizzy
  capture d5_dizzy "D5 dizzy + Whoa bubble"
  sleep 2.5
  settle_idle
}
g_d6() {
  echo "== D6 third fling in 120 s -> furious (D5 already counted one)"
  ppost /action '{"action":"fling"}' >/dev/null; wait_landed; sleep 2.2
  ppost /action '{"action":"fling"}' >/dev/null; wait_landed
  # QA-runner fix: capture ON furious (a 2.5 s sequence first meant the capture showed idle)
  d="$(wait_state anim '^dizzy$' 2000)"
  v="$(wait_state anim '^furious$' 3000)"
  expect_eq D6 "3rd fling -> dizzy then furious" "$d>$v" "dizzy>furious"
  sleep 0.35   # past the 100 ms squint bridge (dizzy and furious are both expr rows) and the bubble type-in
  capture d6_furious "D6 furious + HEY bubble"
  expect_match D6 "bubble HEY! Enough!" "$(st bubble)" "HEY"
  sleep 3
  settle_idle
}
g_d7() {
  echo "== D7 4th drag fling within 120 s refused"
  need_cdp D7 "drag fling refused" || return
  cdp drag 500 -300 90 200
  sleep 0.2
  v="$(wait_state emote 'anger' 1500)"
  expect_match D7 "anger emote, no fling" "$v" anger
  expect_match D7 "moveKind is not fling" "$(st moveKind)" "^(fall|null|)$"
  capture d7_nope "D7 Nope + anger"
  sleep 3
  settle_idle
}

# ── D8/D9: petting and tickle ───────────────────────────────────────────
g_d8() {
  echo "== D8 long petting -> love"
  need_cdp D8 "petting" || return
  cdp hover
  v="$(wait_state anim '^love$' 9000)"
  expect_eq D8 "7+ s hover -> love" "$v" love
  capture d8_love "D8 love"
  cdp leave
  v="$(wait_state anim '^petted$' 800)"
  expect_eq D8 "leave -> petted" "$v" petted
  sleep 1.2
  settle_idle
}
g_d9() {
  echo "== D9 tickle -> laugh"
  need_cdp D9 "tickle" || return
  cdp tickle 6 1200
  v="$(wait_state anim '^laugh$' 800)"
  expect_eq D9 "tickle -> laugh" "$v" laugh
  capture d9_laugh "D9 laugh"
  v="$(wait_state anim '^waving$' 2500)"
  expect_eq D9 "laugh -> waving" "$v" waving
  sleep 1
  settle_idle
}

# ── D11/D12: stroll eyes-lead and trot (roam on, observational) ──────────
g_d11() {
  echo "== D11/D12 strolls (roam on for up to 120 s)"
  set_flag roam true
  saw_peek=""; saw_trot=""; t0=$(date +%s)
  while [ $(( $(date +%s) - t0 )) -lt 120 ]; do
    # one sampler call per 2 s slice: the first still-missing event (look/1|look/3 peek, trot) ends it
    want='^(peek|trot)'; [ -n "$saw_peek" ] && want='^trot'; [ -n "$saw_trot" ] && want='^peek'
    v="$(node "$DEV_DIR/watch.js" --port "$QA_PORT" --ms 2000 --until "$want" \
         --expr '(o.peek === "look/1" || o.peek === "look/3") ? "peek:" + o.peek : o.anim === "trot" ? "trot" : ""')"
    # QA-runner fix: capture the trot once (a slice that times out while trotting echoes "trot" again)
    case "$v" in peek:*) saw_peek="${v#peek:}";; trot) [ -z "$saw_trot" ] && capture d12_trot "D12 trot stroll"; saw_trot=1;; esac
    [ -n "$saw_peek" ] && [ -n "$saw_trot" ] && break
  done
  [ -n "$saw_peek" ] && res D11 "eyes lead before a run stroll" PASS "$saw_peek" || res D11 "eyes lead before a run stroll" INFO "not observed in 120 s (random strolls)"
  [ -n "$saw_trot" ] && res D12 "long stroll trots" PASS || res D12 "long stroll trots" INFO "not observed in 120 s (needs a >= 240 px stroll)"
  set_flag roam false
  expect_eq D11 "roam back off" "$(st roam)" false
  sleep 2; settle_idle
}
g_d12() { :; }  # covered by g_d11

# ── D13/D14: steal. The real cursor is NEVER moved (lead decision 7): the dev pet logs and drops every
# "SET x y", and the scenario feeds the pet a fake cursor through POST /debug/cursor. With the fake cursor
# standing still while the claw "carries" it, the run-off check sees the cursor away from where it was
# set, i.e. "the user took it back" → D14 busted. Parked part: the rows only. Live part: d13_live
# (on-screen, because the steal walks the dev window to the fake cursor; ~6 s).
g_d13() {
  echo "== D13/D14 steal (rows only; the live steal is group d13_live)"
  anim plotting 0 >/dev/null; sleep 0.15; capture d13_plotting_visual "D13 plotting (visual only)"
  anim busted 4 >/dev/null; sleep 0.15; capture d14_busted_visual "D14 busted (visual only)"
  settle_idle
}
g_d14() { :; }  # covered by g_d13 / g_d13_live
dev_log() { printf '%s' "$REPO/tmp/dev-profile/logs/clawd.log"; }
g_d13_live() {
  echo "== D13/D14 live steal on a fake cursor (the real cursor is never moved)"
  need_cdp D13 "live steal (needs the window position)" || return
  pos="$(cdp eval '[window.screenX, window.screenY]')"
  wx="$(jv "$pos" 'o[0]')"; wy="$(jv "$pos" 'o[1]')"
  if [ -z "$wx" ] || [ "$wx" -lt 0 ]; then res D13 "live steal" SKIP "dev window not on screen (x=$wx)"; return; fi
  # the claw line: groundY + WIN_H - FEET_OFFSET - 62 = window y + 207; 50 px right of the claw
  dpost /debug/cursor "{\"x\":$((wx + 162 + 50)),\"y\":$((wy + 207))}" >/dev/null
  local logf n0 n1; logf="$(dev_log)"
  n0="$(grep -c "(dev) cursor SET" "$logf" 2>/dev/null)"; n0="${n0:-0}"
  set_flag mischief true
  # QA-runner fix: the toggle's own bubble ("Trouble mode: on", prio 0) outranks the P4 "Hehehe…";
  # let it end first, as it would before a real (auto or menu) steal
  wait_state bubble '^$' 6000 >/dev/null
  ppost /action '{"action":"steal-cursor"}' >/dev/null
  v="$(wait_state anim '^plotting$' 1500)"
  expect_eq D13 "steal starts with plotting" "$v" plotting
  sleep 0.4; capture d13_plotting "D13 plotting + Hehehe"
  expect_match D13 "plotting bubble Hehehe" "$(st bubble)" "Hehe"
  v="$(wait_state anim '^busted$' 6000)"
  expect_eq D14 "fake cursor did not follow the claw -> busted" "$v" busted
  [ "$v" = busted ] && capture d14_busted "D14 busted + Heh... just borrowing it."
  set_flag mischief false
  expect_eq D13 "mischief back off" "$(st mischief)" false
  dpost /debug/cursor 'null' >/dev/null
  sleep 0.5
  n1="$(grep -c "(dev) cursor SET" "$logf" 2>/dev/null)"; n1="${n1:-0}"
  if [ -f "$logf" ] && [ "$n1" -gt "$n0" ]; then
    res D13 "cursor SETs dropped by the dev pet (real cursor untouched)" PASS "$((n1 - n0)) '(dev) cursor SET … dropped' lines"
  elif [ -f "$logf" ]; then
    res D13 "cursor SETs dropped by the dev pet (real cursor untouched)" FAIL "no '(dev) cursor SET' line in $logf"
  else
    res D13 "cursor SETs dropped by the dev pet (real cursor untouched)" INFO "dev log not found: $logf"
  fi
  sleep 1.5   # the busted rest (max(1100 ms, row length)) before the steal releases its flag
  settle_idle
}

# ── D15-D17: yawn ───────────────────────────────────────────────────────
g_d15() {
  echo "== D15 system idle 155 s -> yawn"
  ppost /idle '{"seconds":155}' >/dev/null
  v="$(wait_state anim '^yawn$' 12000)"
  expect_eq D15 "idle 155 s -> yawn" "$v" yawn
  capture d15_yawn "D15 yawn"
  ppost /idle '{"seconds":0}' >/dev/null
  sleep 3; settle_idle
}
g_d16() {
  echo "== D16 menu Nap -> yawn then sleep"
  ppost /action '{"action":"nap"}' >/dev/null
  s="$(seq_state anim 4000)"
  expect_match D16 "nap: yawn then sleep" "$s" "yawn.*sleep"
  capture d16_sleep "D16 sleep"
  expect_match D16 "sleepStage 2" "$(st sleepStage)" "^2$"
  # QA-runner fix: wake with a real P0 gesture (menu Wave goes through playOneShot and clears
  # sleepStage). /debug/anim bypasses the director, so the crab stayed napping (napUntil 5 min)
  # and every later group started asleep.
  ppost /action '{"action":"wave"}' >/dev/null; sleep 1.8
  expect_match D16 "menu Wave wakes the napping crab" "$(st sleepStage)" "^0$"
  settle_idle
}
g_d17() {
  echo "== D17 night stroll yawn (observational, roam on up to 90 s)"
  dpost /debug/date '{"iso":"2026-09-27T23:45:00"}' >/dev/null
  set_flag roam true
  v="$(wait_state anim '^yawn$' 90000)"
  [ "$v" = yawn ] && { res D17 "night stroll roll yawns" PASS; capture d17_yawn "D17 night yawn"; } \
                  || res D17 "night stroll roll yawns" INFO "not observed in 90 s (10% of rolls)"
  set_flag roam false
  dpost /debug/date '{"iso":null}' >/dev/null
  sleep 2; settle_idle
}

# ── D18 / F6: file chomp (cdp file drag) ────────────────────────────────
# pet.js holds chomp-open only while dragover keeps coming (it ends 350 ms after the last one, as a
# real OS drag does), so the drag is held open in the background with a dragover every 100 ms.
g_d18() {
  echo "== D18/F6 file drag-over, drop, report"
  need_cdp D18 "file drag" || return
  JS="$(cygpath -w "$REPO/renderer/pet.js" 2>/dev/null || echo "$REPO/renderer/pet.js")"
  PNG="$(cygpath -w "$REPO/assets/icon.png" 2>/dev/null || echo "$REPO/assets/icon.png")"
  DIR="$(cygpath -w "$REPO/tools/qa" 2>/dev/null || echo "$REPO/tools/qa")"
  mkdir -p "$REPO/tmp/c"
  BIG="$REPO/tmp/c/qa_big_4mb.txt"
  [ -f "$BIG" ] || node -e "require('fs').writeFileSync(process.argv[1], ('0123456789abcdef'.repeat(64)+'\n').repeat(4000))" "$BIG"
  BIGW="$(cygpath -w "$BIG" 2>/dev/null || echo "$BIG")"
  fwd() { cygpath -m "$1" 2>/dev/null || printf '%s' "$1" | tr '\' '/'; }   # JSON-safe absolute path
  SYNTH=0
  cdp filedrag hold 1800 "$JS" &
  v="$(wait_state anim '^chomp-open$' 1000)"
  if [ "$v" != chomp-open ]; then
    wait; cdp filedrag leave "$JS" >/dev/null 2>&1
    res D18 "CDP Input.dispatchDragEvent reached the page" INFO "no; falling back to synthetic DragEvents (no disk path)"
    SYNTH=1
    wait_state anim '^(idle|look)$' 1500 >/dev/null
    cdp synthdrag hold 1800 pet.js 65536 >/dev/null &
    v="$(wait_state anim '^chomp-open$' 1000)"
  fi
  expect_eq D18 "drag-enter -> chomp-open hold" "$v" chomp-open
  sleep 0.6   # still inside the held drag: "Ooh, food?" has typed out
  expect_eq D18 "chomp-open still held after 0.6 s of dragover" "$(st anim)" chomp-open
  capture d18_open "D18 chomp-open + Ooh, food?"
  wait        # the hold ends here
  if [ "$SYNTH" = 1 ]; then cdp synthdrag leave pet.js >/dev/null; else cdp filedrag leave "$JS"; fi
  v="$(wait_state anim '^(idle|look)$' 1500)"
  expect_match D18 "drag-leave -> status row" "$v" "^(idle|look)$"
  if [ "$SYNTH" = 1 ]; then
    # the DOM drop path with a pathless in-page File, then the real reports through /debug/drop
    # (the same chompFile path minus the OS drag)
    cdp synthdrag drop qa.js 4096 >/dev/null
    v="$(wait_state anim '^chomp$' 1500)"
    expect_eq F6 "DOM drop (synthetic file) -> chomp" "$v" chomp
    sleep 3.5; settle_idle
  fi
  for f in "js:$JS" "png:$PNG" "dir:$DIR"; do
    k="${f%%:*}"; p="${f#*:}"
    if [ "$SYNTH" = 1 ]; then dpost /debug/drop "{\"path\":\"$(fwd "$p")\"}" >"$RUN_DIR/_drop_$k.json" & else cdp filedrag drop "$p"; fi
    v="$(wait_state anim '^chomp$' 1500)"
    expect_eq F6 "drop $k -> chomp" "$v" chomp
    sleep 1.6; capture "f6_report_$k" "F6 report bubble ($k)"
    wait
    [ "$SYNTH" = 1 ] && res F6 "report text ($k)" INFO "$(jv "$(cat "$RUN_DIR/_drop_$k.json")" o.text)"
    sleep 2
  done
  if [ "$SYNTH" = 1 ]; then dpost /debug/drop "{\"path\":\"$(fwd "$BIG")\"}" >/dev/null &
  else cdp filedrag drop "$BIGW" & fi
  sleep 0.15
  t0=$(date +%s%3N); dget /debug/state >/dev/null; t1=$(date +%s%3N)
  wait
  if [ $((t1-t0)) -lt 300 ]; then res F6 "main not blocked by a 4 MB file" PASS "$((t1-t0)) ms"; else res F6 "main not blocked by a 4 MB file" FAIL "$((t1-t0)) ms"; fi
  sleep 1.6; capture f6_report_big "F6 4 MB file"
  expect_match F6 "window never navigates" "$(cdp eval 'location.href')" "renderer/index\.html"
  settle_idle
}

# ── D19: menu tricks ────────────────────────────────────────────────────
g_d19() {
  echo "== D19 menu tricks"
  for e in $TRICK_IDS; do
    id="${e%%:*}"; row="${e##*:}"
    ppost /action "{\"action\":\"$id\"}" >/dev/null
    v="$(wait_state anim "^$row\$" 1500)"
    expect_eq D19 "menu $id -> $row" "$v" "$row"
    sleep 0.3; capture "d19_$id" "D19 menu $id"
    sleep 2.5
  done
  settle_idle
}

# ── F8: foreign skin fallback ───────────────────────────────────────────
g_f8() {
  echo "== F8 foreign skin (spritesheet-round.webp)"
  dpost /debug/skin '{"file":"spritesheet-round.webp"}' >/dev/null; sleep 0.8
  expect_match F8 "rowsAvailable after skin" "$(st rowsAvailable)" "^[0-9]+$"
  for e in $NEW_ROWS $ALIASES typing:0 sleep:0 gaming:0 petted:0; do
    n="${e%%:*}"
    r="$(anim "$n")"
    fb="$(jv "$r" o.fallbackUsed)"
    rw="$(jv "$r" o.row)"
    if [ -n "$rw" ] && [ "$rw" -lt "$(st rowsAvailable)" ]; then res F8 "$n visible (row $rw)" PASS "fallbackUsed=$fb"; else res F8 "$n visible" FAIL "row=$rw fallbackUsed=$fb resp=${r:0:80}"; fi
  done
  anim love 0 >/dev/null; sleep 0.2; capture f8_love_fallback "F8 love on a 9-row skin"
  anim trot 4 flip >/dev/null; sleep 0.2; capture f8_trot_flip_fallback "F8 trot flip on a 9-row skin"
  dpost /debug/skin '{"reset":true}' >/dev/null; sleep 0.8
  expect_eq F8 "reset -> built-in (43 rows)" "$(st rowsAvailable)" 43
  settle_idle
}

# ── F5: cursor-watch ────────────────────────────────────────────────────
g_f5() {
  echo "== F5 cursor-watch"
  need_cdp F5 "cursor-watch (needs the window position)" || return
  pos="$(cdp eval '[window.screenX, window.screenY]')"
  wx="$(jv "$pos" 'o[0]')"; wy="$(jv "$pos" 'o[1]')"
  hx=$((wx+150)); hy=$((wy+227))
  for e in "0:0:2" "0:-80:5" "0:80:6" "-200:0:0" "-60:0:1" "200:0:4" "60:0:3" "15:15:2"; do
    IFS=: read -r dx dy k <<< "$e"
    dpost /debug/cursor "{\"x\":$((hx+dx)),\"y\":$((hy+dy))}" >/dev/null
    v="$(wait_state peek "^look/$k\$" 1500)"
    expect_eq F5 "cursor ($dx,$dy) -> look/$k" "$v" "look/$k"
    expect_eq F5 "logical anim stays idle" "$(st anim)" idle
    capture "f5_look_$k" "F5 cursor ($dx,$dy) look/$k"
  done
  s="$(seq_state peek 5500)"
  expect_match F5 "blinks (look/7) within 5.5 s" "$s" "look/7"
  sleep 4.5
  expect_match F5 "unpeek 4 s after the cursor stops" "$(st peek)" "^(null|)$"
  a="$(st cursorPolls)"; sleep 3; b="$(st cursorPolls)"
  expect_eq F5 "no polling while disarmed" "$b" "$a"
  # waiting: never cursor-watch
  ppost /status '{"status":"waiting","sessionId":"qa-f5","event":"Notification","message":"Allow?"}' >/dev/null; sleep 0.4
  dpost /debug/cursor "{\"x\":$((hx+60)),\"y\":$hy}" >/dev/null; sleep 1
  expect_match F5 "no cursor-watch while waiting" "$(st peek)" "^(null|)$"
  ppost /status '{"status":"idle","sessionId":"qa-f5","event":"SessionEnd"}' >/dev/null; sleep 0.5
  # CPU: 12 samples every 5 s while the cursor moves
  sum=0; n=0; mem=""
  for i in $(seq 1 12); do
    dpost /debug/cursor "{\"x\":$((hx + (i % 2 ? 90 : -90))),\"y\":$hy}" >/dev/null
    c="$(st cpu)"; mem="$(st memMB)"
    sum="$(node -e "console.log(($sum)+Number('${c:-0}'))")"; n=$((n+1)); sleep 5
  done
  avg="$(node -e "console.log((($sum)/$n).toFixed(2))")"
  if node -e "process.exit(Number('$avg')<=3?0:1)"; then res F5 "cpu avg <= 3% while watching" PASS "$avg% (memMB $mem)"; else res F5 "cpu avg <= 3% while watching" FAIL "$avg% (memMB $mem)"; fi
  dpost /debug/cursor 'null' >/dev/null
  settle_idle
}

# ── Gate 2: emotes and hats on the dev pet ──────────────────────────────
EMOTES="bang question bangq sweat hearts anger bulb dots note sparkle rain tool-read tool-edit tool-shell tool-web tool-agent tool-git"
HATS="party tophat crown beanie santa wizard catears bow hardhat headband halo shades"
g_emotes() {
  echo "== F3 every emote on idle"
  for e in $EMOTES; do
    anim idle 0 >/dev/null
    dpost /debug/emote "{\"name\":\"$e\",\"ms\":4000}" >/dev/null
    sleep 0.4
    expect_eq F3 "emote $e shown" "$(st emote)" "$e"
    capture "emote_$e" "emote $e on idle"
    dpost /debug/emote '{"name":null}' >/dev/null
  done
  settle_idle
}
two_sessions() {
  ppost /status '{"status":"running","sessionId":"qa-a","cwd":"C:/qa/alpha","event":"UserPromptSubmit","message":"Thinking..."}' >/dev/null
  ppost /status '{"status":"running","sessionId":"qa-b","cwd":"C:/qa/beta","event":"UserPromptSubmit","message":"Thinking..."}' >/dev/null
}
end_sessions() {
  ppost /status '{"status":"idle","sessionId":"qa-a","event":"SessionEnd"}' >/dev/null
  ppost /status '{"status":"idle","sessionId":"qa-b","event":"SessionEnd"}' >/dev/null
}
g_overlay() {
  echo "== F3 emotes on rows, debug climbs / hidden pose, badge, suppression (window stays parked)"
  anim hop 3 >/dev/null; dpost /debug/emote '{"name":"sparkle","ms":4000}' >/dev/null; sleep 0.4; capture ov_hop_f3_sparkle "hop f3 + sparkle"
  anim trot 4 flip >/dev/null; dpost /debug/emote '{"name":"tool-read","ms":4000}' >/dev/null; sleep 0.4; capture ov_trot_flip_read "trot flip + tool-read"
  anim running-left 2 >/dev/null; dpost /debug/emote '{"name":"tool-edit","ms":4000}' >/dev/null; sleep 0.4; capture ov_runleft_edit "running-left + tool-edit"
  anim dangle 1 >/dev/null; dpost /debug/emote '{"name":"bangq","ms":4000}' >/dev/null; sleep 0.4; capture ov_dangle_bangq "dangle + bangq"
  anim love 0 >/dev/null; dpost /debug/emote '{"name":"hearts","ms":4000}' >/dev/null; sleep 0.4; capture ov_love_hearts "love + hearts"
  for r in waiting review nervous; do
    anim "$r" 0 >/dev/null; dpost /debug/emote '{"name":"question","ms":4000}' >/dev/null; sleep 0.4
    fl="$(st flags)"
    if [ -n "$fl" ] && [ $(( fl & 32 )) -ne 0 ]; then res F3 "$r frame has MARK_SIDE (side emote suppressed)" PASS "flags=$fl"
    else res F3 "$r frame has MARK_SIDE (side emote suppressed)" FAIL "flags=$fl; check the capture"; fi
    capture "ov_${r}_suppressed" "$r + question (must be hidden)"
  done
  two_sessions; sleep 0.5
  anim hop 3 >/dev/null; dpost /debug/emote '{"name":"sparkle","ms":4000}' >/dev/null; sleep 0.4
  capture ov_hop_f3_badge "hop f3 + sparkle + 2-session badge + bubble"
  anim jumping 2 >/dev/null; sleep 0.3; capture ov_jump_f2_badge "jumping f2 + sparkle + badge"
  dpost /debug/hat '{"id":"wizard"}' >/dev/null; anim hop 3 >/dev/null; sleep 0.3
  capture ov_hop_f3_wizard_bubble "hop f3 + wizard while a bubble shows (hat must hide)"
  end_sessions; dpost /debug/hat '{"id":null}' >/dev/null
  settle_idle
  # climb-left / climb-right / hiddenMode poses in place (/debug/anim {climb, hidden}: classes and
  # flags only, the window never moves); the real edge-hide and perch are in overlay_live
  for side in left right; do
    dpost /debug/anim "{\"climb\":\"$side\",\"name\":\"running-right\",\"frame\":0}" >/dev/null
    dpost /debug/emote '{"name":"tool-shell","ms":4000}' >/dev/null; dpost /debug/hat '{"id":"beanie"}' >/dev/null; sleep 0.4
    expect_eq F3 "debug climb-$side: emote uses the top anchor" "$(st overlay.emote.anchor)" top
    expect_eq F3 "debug climb-$side: emote counter-rotation" "$(st overlay.emote.rotate)" "$([ "$side" = right ] && echo 90 || echo -90)"
    capture "ov_climb_${side}_debug" "climb-$side pose + tool-shell (upright, beyond the head, away from the wall) + beanie"
    dpost /debug/anim '{"climb":"none"}' >/dev/null
  done
  dpost /debug/anim '{"climb":"right","hidden":true,"name":"gaming","frame":0}' >/dev/null
  dpost /debug/emote '{"name":"bang","ms":4000}' >/dev/null; dpost /debug/hat '{"id":"party"}' >/dev/null; sleep 0.4
  expect_eq F4 "debug hidden pose: hat hidden" "$(st overlay.hat.visible)" false
  capture ov_hidden_bang_debug "hidden pose (climb-right) + bang (top anchor), no hat"
  dpost /debug/anim '{"climb":"none","hidden":false}' >/dev/null
  settle_idle
}
g_overlay_live() {
  echo "== F3 real edge-hide and perch climbs (ON-SCREEN)"
  set_flag hide true
  expect_eq F3 "hiddenMode reached" "$(st hiddenMode)" true
  # QA-runner fix: the hide walk goes to the NEAREST edge (the left one from the on-screen start spot),
  # so wait for either side; waiting for 'right' only timed out and captured the crab mid-walk
  # enterHide walks to the RIGHT edge (1-2 s per 100 px), climbs, then slides into the peek and
  # switches from running-right to the status pose (gaming when idle): wait for that pose
  v="$(wait_state climbSide '^(left|right)$' 30000)"
  expect_match F3 "edge-hide reached the wall (climbSide)" "$v" '^(left|right)$'
  v="$(wait_state anim '^(?!running)' 10000)"
  expect_match F3 "edge-hide peek pose (not walking)" "$v" '^(gaming|typing|idle|waiting)$'
  sleep 0.3
  dpost /debug/emote '{"name":"bang","ms":4000}' >/dev/null; dpost /debug/hat '{"id":"party"}' >/dev/null; sleep 0.5
  res F4 "no hat in hiddenMode" INFO "state.hat=$(st hat) overlay.hat.visible=$(st overlay.hat.visible) (the capture must show no hat)"
  capture ov_hidden_bang "hidden + bang (top anchor), no hat"
  set_flag hide false
  dpost /debug/hat '{"id":null}' >/dev/null
  settle_idle
  # climb-left / climb-right via a perch on an injected window. perchOn climbs the window side NEARER
  # to the crab (feet face the window: its left side gives climb-right, its right side climb-left), so
  # each perch starts from the known on-screen spot S (place onscreen, 240 px in from the left) with the
  # window laid out around S. The old fixed windows were measured from wherever exitHide left the crab
  # (the bottom-right), and both ended in climb-left.
  #   climb-right: window x S+360..S+1060, its left side (S+60) is 60 px away, the right side 1060
  #   climb-left:  window x S-340..S+60, its right side (S+60) is 60 px away; its left side (S-640) is
  #                past the work-area edge, so perchOn cannot pick it
  for want in right left; do
    if [ "$HAVE_CDP" != 1 ]; then res F3 "climb-$want via perch" SKIP "needs the DevTools port to place the crab at a known spot"; continue; fi
    wait_state moveKind '^(null|)$' 8000 >/dev/null
    cdp place onscreen >/dev/null; sleep 0.3
    S="$(win_x)"
    if [ -z "$S" ] || [ "$S" -lt 0 ]; then res F3 "climb-$want via perch" INFO "could not place the crab on screen (x=$S)"; continue; fi
    if [ "$want" = right ]; then wx=$((S + 360)); ww=700; else wx=$((S - 340)); ww=400; fi
    ppost /windows "{\"fg\":{\"hwnd\":1,\"x\":$wx,\"y\":420,\"w\":$ww,\"h\":400},\"claude\":null}" >/dev/null
    [ "$(st perched)" = true ] || ppost /action '{"action":"perch"}' >/dev/null
    v="$(wait_state climbSide '^(left|right)$' 12000)"
    if [ "$v" = "$want" ]; then
      dpost /debug/emote '{"name":"tool-shell","ms":4000}' >/dev/null; dpost /debug/hat '{"id":"beanie"}' >/dev/null; sleep 0.3
      capture "ov_climb_$v" "climb-$v + tool-shell (top anchor, upright, away from the wall) + beanie"
      res F3 "climb-$v reached" PASS "crab x=$S, window x=$wx w=$ww"
    elif printf '%s' "$v" | grep -Eq '^(left|right)$'; then
      res F3 "climb-$want via perch" FAIL "reached climb-$v instead (crab x=$S, window x=$wx w=$ww)"
    else
      res F3 "climb-$want via perch" INFO "no climb reached (crab x=$S, window x=$wx w=$ww; geometry of this screen); see ov_climb_*_debug"
    fi
    wait_state perched '^true$' 10000 >/dev/null; sleep 1
    leave_perch
    sleep 3; dpost /debug/hat '{"id":null}' >/dev/null
  done
  ppost /windows '{"fg":null,"claude":null}' >/dev/null
  settle_idle
}

g_hats() {
  echo "== F4 hats on rows"
  for h in $HATS; do
    dpost /debug/hat "{\"id\":\"$h\"}" >/dev/null
    for e in idle:0 hop:3 running-left:2 chomp:2 sleep:0; do
      n="${e%%:*}"; k="${e##*:}"
      anim "$n" "$k" >/dev/null; sleep 0.25
      capture "hat_${h}_${n}_f$k" "$h on $n f$k"
    done
    anim trot 4 flip >/dev/null; sleep 0.25; capture "hat_${h}_trot_flip" "$h on trot flipped"
    expect_eq F4 "state.hat = $h" "$(st hat)" "$h"
  done
  dpost /debug/hat '{"id":null}' >/dev/null
  settle_idle
}
g_autohats() {
  echo "== F4 Auto seasonal hats under /debug/date"
  dpost /debug/hat '{"id":null}' >/dev/null
  for e in "2026-12-24T15:00:00:santa" "2026-12-31T15:00:00:party" "2026-10-28T15:00:00:catears" "2027-02-14T15:00:00:bow" "2027-01-15T09:00:00:beanie" "2026-06-15T15:00:00:"; do
    iso="${e%:*}"; want="${e##*:}"
    dpost /debug/date "{\"iso\":\"$iso\"}" >/dev/null
    ppost /status '{"status":"idle","sessionId":"qa-date","event":"Stop"}' >/dev/null   # re-evaluate
    sleep 0.6
    got="$(st hat)"; [ "$got" = null ] && got=""
    expect_eq F4 "auto hat on ${iso%%T*}" "$got" "$want"
    capture "autohat_${iso%%T*}" "Auto hat ${iso} -> ${want:-none}"
  done
  dpost /debug/date '{"iso":null}' >/dev/null
  res F4 "plan mode / 2 and 8 min runs" INFO "fixture-driven, Gate 3"
  settle_idle
}

# ── §8.3 states against triggers (reduced Gate 1-2 matrix) ──────────────
mx_trig() { # state-label: emote bang, trick dance, cursor near, file drag-enter
  local s="$1" pos wx wy
  pos="$(cdp eval '[window.screenX, window.screenY]' 2>/dev/null)"; wx="$(jv "$pos" 'o[0]')"; wy="$(jv "$pos" 'o[1]')"
  dpost /debug/emote '{"name":"bang","ms":3000}' >/dev/null; sleep 0.3
  capture "mx_${s}_emote" "$s + emote bang"
  ppost /action '{"action":"dance"}' >/dev/null; sleep 0.4
  capture "mx_${s}_dance" "$s + menu dance ($(st anim))"
  [ -n "$wx" ] && dpost /debug/cursor "{\"x\":$((wx+210)),\"y\":$((wy+227))}" >/dev/null && sleep 0.6 && \
    res MX "$s + cursor near" INFO "anim=$(st anim) peek=$(st peek)"
  if [ "$HAVE_CDP" = 1 ]; then
    cdp synthdrag hold 700 pet.js 1024 >/dev/null &
    sleep 0.35; res MX "$s + file drag-enter" INFO "anim=$(st anim)"; wait
    cdp synthdrag leave pet.js >/dev/null
  fi
  dpost /debug/cursor 'null' >/dev/null
}
g_matrix() {
  echo "== states x triggers, window parked: sleeping, usage card, petting"
  ppost /action '{"action":"nap"}' >/dev/null; sleep 3; mx_trig sleeping
  anim waving >/dev/null; sleep 1.5; settle_idle
  ppost /debug/usage "$(curl -s -m 10 "$BASE/usage")" >/dev/null; sleep 0.8; mx_trig usage_card; settle_idle
  if [ "$HAVE_CDP" = 1 ]; then cdp hover; sleep 2; mx_trig petting; cdp leave; sleep 1; settle_idle; fi
  res MX "perched / climb-left / climb-right" INFO "see overlay (debug poses) and overlay_live (perch attempts); a full matrix per H-trigger comes with Gate 3"
}
g_matrix_live() {
  echo "== states x triggers (ON-SCREEN): hidden, dragging, mid-fling"
  set_flag hide true
  # QA-runner fix: the peek reached, not mid-walk (see overlay_live)
  wait_state climbSide '^(left|right)$' 30000 >/dev/null; wait_state anim '^(?!running)' 10000 >/dev/null; sleep 0.3
  mx_trig hidden
  set_flag hide false; settle_idle
  if [ "$HAVE_CDP" = 1 ]; then
    cdp down; sleep 0.3; mx_trig dragging; cdp up; sleep 2.5; settle_idle
  fi
  ppost /action '{"action":"fling"}' >/dev/null; sleep 0.15; mx_trig mid_fling; wait_landed; sleep 3; settle_idle
}

# ════════════════════════════════════════════════════════════════════════
# Gate 3: hook-driven reactions (§4.4, F1). Fixtures (tools/qa/dev/hooks/*.json, written from the
# documented hook schemas by make_fixtures.js) are replayed through hooks/notify.next.js into the dev
# pet with replay.sh (CLAWD_PORT=<dev port> CLAWD_NO_REVIVE=1; never hooks/notify.js, never 31126).
# QA_NOTIFY=ref|baseline|<path> replays through another script (self-test / old notify).
# Every group uses its own session ids (replay -s / -S) and ends them (SessionEnd, which infers
# nothing), so per-session state (runStart, pending tests / agents, per-session cooldowns) never leaks.
# hook_fresh clears the director's global P2 gap, the named cooldowns and the P4 emote gap over the
# DevTools port between steps that test something other than those limits (no port: it waits 8.5 s,
# which covers the P2 gap only). Groups that need the fake clock (H12, H18, H20) set /debug/date and
# clear it again; they assume the director measures run lengths / quiet time on that clock.
# ════════════════════════════════════════════════════════════════════════
NOTIFY_WHICH="${QA_NOTIFY:-next}"
NOTIFY_STATE=""   # "" = not checked yet, "ok", or why it cannot run
RUN_POSES='^(typing|work-read|work-shell)$'
need_next() { # id check → 0 when the notify script can be replayed
  if [ -z "$NOTIFY_STATE" ]; then
    local m
    if m="$(bash "$DEV_DIR/replay.sh" --check --notify "$NOTIFY_WHICH" --port "$QA_PORT" 2>&1)"; then NOTIFY_STATE=ok
    else NOTIFY_STATE="${m#replay: }"; fi
  fi
  [ "$NOTIFY_STATE" = ok ] && return 0
  res "$1" "$2" SKIP "$NOTIFY_STATE"; return 1
}
# rp <replay args…>: replay fixtures (quiet); RP_NOTIFY=baseline rp … replays through the old notify
rp() {
  local out
  if ! out="$(bash "$DEV_DIR/replay.sh" --notify "${RP_NOTIFY:-$NOTIFY_WHICH}" --port "$QA_PORT" -q "$@" 2>&1)"; then
    res RP "replay $*" FAIL "${out:0:200}"
  fi
  [ -n "$out" ] && printf '%s\n' "$out" >> "$RUN_DIR/_replay.log"
  return 0
}
new_sid() { printf 'qa-%s-%05d%05d' "$1" "$RANDOM" "$RANDOM"; }
end_sid() { local s; for s in "$@"; do rp -s "$s" session_end; done; }
HOOK_FRESH_JS='(function(){var n=0;try{for(var k in cooldowns){delete cooldowns[k];n++}}catch(e){}try{director.lastP2At=0}catch(e){}try{emote.lastP4PopAt=0}catch(e){}return n})()'
hook_fresh() {
  if [ "$HAVE_CDP" = 1 ]; then cdp eval "$HOOK_FRESH_JS" >/dev/null; else sleep "${HOOK_FRESH_SLEEP:-8.5}"; fi
}
# focus_run <sid>: that session prompts (it becomes the focus session, a fresh run starts), then the
# limits are cleared and a startle (H12) / bulb (H11) from the prompt is let through
focus_run() {
  rp -s "$1" user_prompt_submit
  wait_state anim "$RUN_POSES" 4000 >/dev/null
  hook_fresh
  wait_state emote '^$' 3000 >/dev/null
}
# a sampler in the background: watch_bg <file> <expr> <ms> … watch_end <file> → "v1>v2>…"
# watch_end is called inside $(...) (a subshell), where `wait` cannot wait for the parent's background
# job, so the sampler writes "<file>.done" (holding its exit code) when it has finished and watch_end
# polls for that (g3-full fix). A sampler that never finished (20 s cap) or never got a /debug/state
# answer (watch.js exit 3) yields the sentinel "!watch:…" instead of a sequence: it matches no value a
# positive check wants, and expect_not FAILs on it instead of passing on nothing.
watch_bg() { rm -f "$1" "$1.done"; { node "$DEV_DIR/watch.js" --port "$QA_PORT" --expr "$2" --ms "$3" > "$1" 2>> "$RUN_DIR/_watch.err"; echo "$?" > "$1.rc"; mv -f "$1.rc" "$1.done"; } & WATCH_PID=$!; sleep 0.15; }
watch_end() {
  local end=$((SECONDS + 20)) rc   # wall clock: a `sleep` on Git Bash costs far more than its 50 ms
  while [ ! -e "$1.done" ] && [ "$SECONDS" -lt "$end" ]; do sleep 0.05; done
  wait "$WATCH_PID" 2>/dev/null
  if [ ! -e "$1.done" ]; then printf '!watch:timeout'; return; fi
  rc="$(cat "$1.done")"
  if [ "${rc:-x}" != 0 ]; then printf '!watch:rc=%s' "${rc:-?}"; return; fi
  cat "$1"
}
seq_has() { printf '%s' "$1" | tr '>' '\n' | grep -Eq "$2"; }         # seq_has "<a>b>c>" <ERE on one value>
seq_count() { printf '%s' "$1" | tr '>' '\n' | grep -Ec "$2"; }
expect_not() { # id check seq ERE → PASS when no value of the sequence matches
  case "$3" in '!watch:'*) res "$1" "$2" FAIL "sampler failed ($3), nothing was tested"; return;; esac
  if seq_has "$3" "$4"; then res "$1" "$2" FAIL "$3"; else res "$1" "$2" PASS "$3"; fi
}
debug_hidden_pose() { dpost /debug/anim '{"climb":"right","hidden":true,"name":"gaming","frame":0}' >/dev/null; sleep 0.2; }
clear_hidden_pose() { dpost /debug/anim '{"climb":"none","hidden":false}' >/dev/null; }
T0_ISO="2026-06-15T15:00:00"   # a date with no seasonal hat

# ── F1: notify fields, privacy, timing (no pet needed) ──────────────────
g_hnotify() {
  echo "== F1 notify.next.js fields / tags / privacy / +5 ms timing (check_notify.js, capture server)"
  local out rc
  out="$(node "$DEV_DIR/check_notify.js" --notify "$NOTIFY_WHICH" 2>&1)"; rc=$?
  printf '%s\n' "$out" > "$RUN_DIR/_check_notify.txt"
  case $rc in
    0) res F1 "check_notify ($NOTIFY_WHICH): fields, tags, privacy, timing" PASS "$(printf '%s' "$out" | tail -1)";;
    3) res F1 "check_notify" SKIP "$(printf '%s' "$out" | head -1)";;
    *) res F1 "check_notify ($NOTIFY_WHICH)" FAIL "$(printf '%s' "$out" | grep -m4 -E 'FAIL|check_notify:' | tr '\n' ' ')";;
  esac
}

# ── H1 / H2: tool emotes and the running pose ───────────────────────────
g_h1() {
  echo "== H1 tool emote on a kind change, at most one pop per 30 s; todo gets none"
  need_next H1 "tool emotes" || return
  local sid v s; sid="$(new_sid h1)"
  focus_run "$sid"
  rp -s "$sid" pre_read_1
  v="$(wait_state emote '^tool-read$' 1500)"
  expect_eq H1 "first Read -> tool-read pop" "$v" tool-read
  capture h1_tool_read "H1 tool-read pop"
  sleep 2
  watch_bg "$RUN_DIR/_h1.txt" 'o.emote' 1800
  rp -s "$sid" pre_edit
  s="$(watch_end "$RUN_DIR/_h1.txt")"
  expect_not H1 "kind change within 30 s: no second pop" "$s" '^tool-edit$'
  hook_fresh; sleep 1.6
  rp -s "$sid" pre_bash_plain
  v="$(wait_state emote '^tool-shell$' 1500)"
  if [ "$HAVE_CDP" = 1 ]; then expect_eq H1 "after the 30 s window (cleared): Bash -> tool-shell" "$v" tool-shell
  else res H1 "Bash -> tool-shell after the 30 s window" INFO "no DevTools port, window not cleared (got '$v')"; fi
  capture h1_tool_shell "H1 tool-shell pop"
  wait_state emote '^$' 5000 >/dev/null; hook_fresh; sleep 1.6
  # no fixture for TodoWrite in the documented list: injected through /debug/hook (counted as injected)
  watch_bg "$RUN_DIR/_h1b.txt" 'o.emote' 1800
  dpost /debug/hook "{\"event\":\"PreToolUse\",\"tool\":\"TodoWrite\",\"kind\":\"todo\",\"cmd\":\"\",\"sessionId\":\"$sid\",\"status\":\"running\",\"message\":\"TodoWrite\"}" >/dev/null
  s="$(watch_end "$RUN_DIR/_h1b.txt")"
  expect_not H1 "todo gets no emote (injected)" "$s" '.'
  end_sid "$sid"
}

g_h2() {
  echo "== H2 running pose: 2 reads -> work-read, held 8 s, then work-shell; edit -> typing"
  need_next H2 "running pose" || return
  local sid v t1 t2; sid="$(new_sid h2)"
  focus_run "$sid"
  rp -s "$sid" pre_read_1 +300 pre_read_2
  v="$(wait_state anim '^work-read$' 2500)"; t1=$(date +%s%3N)
  expect_eq H2 "2 consecutive reads -> work-read" "$v" work-read
  capture h2_work_read "H2 work-read"
  rp -s "$sid" pre_bash_plain +300 pre_bash_plain
  sleep 1
  expect_eq H2 "shell right after: work-read still holds" "$(st anim)" work-read
  v="$(wait_state anim '^work-shell$' 12000)"; t2=$(date +%s%3N)
  expect_eq H2 "then work-shell" "$v" work-shell
  if [ $((t2 - t1)) -ge 7500 ]; then res H2 "pose held >= 8 s before changing" PASS "$((t2 - t1)) ms"
  else res H2 "pose held >= 8 s before changing" FAIL "$((t2 - t1)) ms"; fi
  capture h2_work_shell "H2 work-shell"
  rp -s "$sid" pre_edit
  v="$(wait_state anim '^typing$' 12000)"
  expect_eq H2 "edit persisting (after the hold) -> typing" "$v" typing
  end_sid "$sid"
}

g_burst() {
  echo "== F1 burst: 10 alternating Read/Edit PreToolUse within 3 s -> no pose strobe, <= 1 H1 pop"
  need_next BURST "read/edit burst" || return
  local sid log t0 t1 r; sid="$(new_sid burst)"
  focus_run "$sid"
  log="$RUN_DIR/_burst_log.tsv"; : > "$log"
  node "$DEV_DIR/watch.js" --port "$QA_PORT" --expr 'o.anim + "|" + (o.emote || "")' --ms 10000 --log "$log" >/dev/null &
  WATCH_PID=$!; sleep 0.2
  t0=$(date +%s%3N)
  rp -s "$sid" -g 280 --seq seq_burst_read_edit
  t1=$(date +%s%3N)
  sleep 1; capture burst_after "burst: pose after 10 Read/Edit events"
  wait "$WATCH_PID" 2>/dev/null
  res BURST "10 events sent" INFO "$((t1 - t0)) ms (starts 280 ms apart)"
  # "<changes> <min gap ms between two pose changes> <pops> <sequence>"
  r="$(node -e '
    const L = require("fs").readFileSync(process.argv[1], "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t"));
    let lastAnim = null, lastEmote = "", changes = [], pops = 0, seq = [];
    for (const [t, v] of L) {
      const [anim, emote] = v.split("|");
      if (lastAnim !== null && anim !== lastAnim) changes.push(Number(t) * 1000);
      if (emote.startsWith("tool-") && emote !== lastEmote) pops++;
      if (anim !== lastAnim) seq.push(anim);
      lastAnim = anim; lastEmote = emote;
    }
    let gap = Infinity;
    for (let i = 1; i < changes.length; i++) gap = Math.min(gap, changes[i] - changes[i - 1]);
    console.log(changes.length, gap === Infinity ? "-" : Math.round(gap), pops, seq.join(">"));
  ' "$log")"
  set -- $r
  if [ "$1" -le 1 ] || { [ "$2" != - ] && [ "$2" -ge 8000 ]; }; then res BURST "pose changes at most once per 8 s" PASS "$1 change(s), min gap $2 ms: $4"
  else res BURST "pose changes at most once per 8 s" FAIL "$1 changes, min gap $2 ms: $4"; fi
  if [ "$3" -le 1 ]; then res BURST "at most one H1 pop" PASS "$3"; else res BURST "at most one H1 pop" FAIL "$3 pops"; fi
  end_sid "$sid"
}

# ── H3-H6: tests ─────────────────────────────────────────────────────────
g_h3() {
  echo "== H3/H4 npm test: fingers-crossed (not clobbered), pass -> hop + halo 10 s + sparkle"
  need_next H3 "test fixtures" || return
  local sid v; sid="$(new_sid h3)"
  focus_run "$sid"
  rp -s "$sid" -u p1 pre_bash_test
  v="$(wait_state anim '^fingers-crossed$' 2000)"
  expect_eq H3 "npm test Pre -> fingers-crossed" "$v" fingers-crossed
  sleep 0.5
  expect_eq H3 "clobber: its own status-update running keeps it" "$(st anim)" fingers-crossed
  rp -s "$sid" post_bash_plain          # another tool's Post: a status-update running + a tool bubble
  sleep 0.4
  expect_eq H3 "clobber: the next status-update running keeps it" "$(st anim)" fingers-crossed
  capture h3_fingers_crossed "H3 fingers-crossed after a running status"
  rp -s "$sid" -u p1 post_bash_test_pass
  v="$(wait_state anim '^hop$' 2000)"
  expect_eq H4 "pass -> hop (resolving P2: the 8 s gap does not refuse it)" "$v" hop
  v="$(wait_state hat '^halo$' 1500)"; expect_eq H4 "halo event hat" "$v" halo
  v="$(wait_state emote '^sparkle$' 1500)"; expect_eq H4 "sparkle emote" "$v" sparkle
  capture h4_pass "H4 pass: hop + halo + sparkle"
  v="$(wait_state hat '^(?!halo$)' 12000)"
  if [ "$v" != halo ]; then res H4 "halo ends after ~10 s" PASS "hat='$v'"; else res H4 "halo ends after ~10 s" FAIL "still halo"; fi
  hook_fresh
  rp -s "$sid" -u p2 pre_bash_test
  wait_state anim '^fingers-crossed$' 2000 >/dev/null
  rp -s "$sid" -u p2 post_bash_test_pass_obj
  v="$(wait_state anim '^hop$' 2000)"
  expect_eq H4 "pass with the object tool_response (stdout/stderr) -> hop" "$v" hop
  end_sid "$sid"
}

g_h3cap() {
  echo "== H3 no verdict ever: fingers-crossed at most 30 s, then the running pose + dots (~32 s)"
  need_next H3 "30 s cap" || return
  local sid v t1 t2; sid="$(new_sid h3cap)"
  focus_run "$sid"
  rp -s "$sid" -u c1 pre_bash_test
  wait_state anim '^fingers-crossed$' 2000 >/dev/null; t1=$(date +%s%3N)
  v="$(wait_state anim '^(?!fingers-crossed$)' 34000)"; t2=$(date +%s%3N)
  if [ $((t2 - t1)) -ge 28000 ] && [ $((t2 - t1)) -le 32500 ]; then res H3 "fingers-crossed capped at 30 s" PASS "$((t2 - t1)) ms"
  else res H3 "fingers-crossed capped at 30 s" FAIL "$((t2 - t1)) ms (then '$v')"; fi
  expect_match H3 "then the running pose" "$v" "$RUN_POSES"
  v="$(wait_state emote '^dots$' 1500)"
  expect_eq H3 "then the sticky dots emote" "$v" dots
  capture h3_cap_dots "H3 after 30 s: running pose + dots"
  end_sid "$sid"
}

g_h5() {
  echo "== H5 test failures: failing output, inferred by a later Pre / by Stop; a subagent never fakes one"
  need_next H5 "test failure" || return
  local sid v s
  sid="$(new_sid h5)"; focus_run "$sid"
  rp -s "$sid" -u f1 pre_bash_test
  wait_state anim '^fingers-crossed$' 2000 >/dev/null
  rp -s "$sid" -u f1 post_bash_test_failtext
  v="$(wait_state anim '^sad$' 2000)"
  expect_eq H5 "failing output -> sad" "$v" sad
  sleep 0.3
  expect_match H5 "bubble 'Tests failed. We got this.'" "$(st bubble.text)" "Tests failed"
  capture h5_sad "H5 sad + Tests failed bubble"
  rp -s "$sid" pre_read_1                # the next tool bubble
  sleep 0.5
  expect_match H5 "clobber: the bubble survives the next tool bubble" "$(st bubble.text)" "Tests failed"
  expect_eq H5 "clobber: sad keeps playing" "$(st anim)" sad
  v="$(wait_state anim "$RUN_POSES" 6000)"
  expect_match H5 "after ~4.5 s: back to the running pose" "$v" "$RUN_POSES"
  hook_fresh
  rp -s "$sid" -u f2 --seq seq_test_fail_inferred_pre
  v="$(wait_state anim '^sad$' 2500)"
  expect_eq H5 "no Post, a later Pre (> 500 ms) -> inferred fail, sad" "$v" sad
  end_sid "$sid"
  sleep 4.6; hook_fresh
  sid="$(new_sid h5b)"; focus_run "$sid"
  rp -s "$sid" -u f3 pre_bash_test
  wait_state anim '^fingers-crossed$' 2000 >/dev/null
  sleep 0.6
  watch_bg "$RUN_DIR/_h5b.txt" 'o.anim' 3000
  rp -s "$sid" stop
  s="$(watch_end "$RUN_DIR/_h5b.txt")"
  if seq_has "$s" '^sad$'; then res H5 "no Post, then Stop -> inferred fail, sad" PASS "$s"; else res H5 "no Post, then Stop -> inferred fail, sad" FAIL "$s"; fi
  capture h5_after_stop "H5 inferred by Stop"
  end_sid "$sid"
  sleep 4.6; hook_fresh
  sid="$(new_sid h5c)"; focus_run "$sid"
  rp -s "$sid" -u f4 pre_agent_a
  sleep 1; hook_fresh
  rp -s "$sid" -u f4 pre_bash_test
  wait_state anim '^fingers-crossed$' 2000 >/dev/null
  watch_bg "$RUN_DIR/_h5c.txt" 'o.anim' 2800
  rp -s "$sid" -u f4 +900 pre_read_subagent
  s="$(watch_end "$RUN_DIR/_h5c.txt")"
  expect_not H5 "a subagent's Read (agent pending) does not infer the fail" "$s" '^sad$'
  rp -s "$sid" -u f4 post_agent_a
  end_sid "$sid"
}

g_h6() {
  echo "== H6 a test Post without a verdict -> back to the running pose, silently"
  need_next H6 "no verdict" || return
  local sid s; sid="$(new_sid h6)"
  focus_run "$sid"
  watch_bg "$RUN_DIR/_h6.txt" 'o.anim' 4500
  rp -s "$sid" -u u1 --seq seq_test_unknown
  s="$(watch_end "$RUN_DIR/_h6.txt")"
  if seq_has "$s" '^fingers-crossed$'; then res H6 "fingers-crossed first" PASS "$s"; else res H6 "fingers-crossed first" FAIL "$s"; fi
  expect_not H6 "no sad / hop without a verdict" "$s" '^(sad|hop)$'
  expect_match H6 "ends in the running pose" "$(st anim)" "$RUN_POSES"
  end_sid "$sid"
}

# ── H7 / H8: agents ─────────────────────────────────────────────────────
g_h7() {
  echo "== H7/H8 two parallel agents: one summon, summon-return only after both; Stop infers a return"
  need_next H7 "agents" || return
  local sid v s; sid="$(new_sid h7)"
  focus_run "$sid"
  watch_bg "$RUN_DIR/_h7.txt" 'o.anim' 3000
  rp -s "$sid" -u a1 pre_agent_a
  sleep 0.3; capture h7_summon "H7 summon"
  rp -s "$sid" -u a1 pre_agent_b
  s="$(watch_end "$RUN_DIR/_h7.txt")"
  v="$(seq_count "$s" '^summon$')"
  expect_eq H7 "summon plays once for two parallel agents" "$v" 1
  sleep 1
  watch_bg "$RUN_DIR/_h7b.txt" 'o.anim' 2000
  rp -s "$sid" -u a1 post_agent_a
  s="$(watch_end "$RUN_DIR/_h7b.txt")"
  expect_not H8 "first agent back: no summon-return yet" "$s" '^summon-return$'
  rp -s "$sid" -u a1 post_agent_b
  v="$(wait_state anim '^summon-return$' 2000)"
  expect_eq H8 "last agent back -> summon-return (resolving, inside the 8 s gap)" "$v" summon-return
  capture h8_summon_return "H8 summon-return"
  end_sid "$sid"
  sleep 1.5; hook_fresh
  sid="$(new_sid h7b)"; focus_run "$sid"
  rp -s "$sid" -u a2 pre_agent_a
  sleep 1.5
  watch_bg "$RUN_DIR/_h7c.txt" 'o.anim' 3000
  rp -s "$sid" stop
  s="$(watch_end "$RUN_DIR/_h7c.txt")"
  if seq_has "$s" '^summon-return$'; then res H8 "agent Post never came, Stop -> summon-return" PASS "$s"; else res H8 "agent Post never came, Stop -> summon-return" FAIL "$s"; fi
  end_sid "$sid"
}

# ── H9-H12: git, prompts, return after a break ──────────────────────────
g_h9() {
  echo "== H9/H10 git commit -> tool-git; git push -> sparkle"
  need_next H9 "git" || return
  local sid v; sid="$(new_sid h9)"
  focus_run "$sid"
  rp -s "$sid" pre_git_commit
  v="$(wait_state emote '^tool-git$' 1500)"
  expect_eq H9 "git commit -> tool-git emote" "$v" tool-git
  capture h9_tool_git "H9 tool-git"
  wait_state emote '^$' 5000 >/dev/null; sleep 1.6
  rp -s "$sid" pre_git_push
  v="$(wait_state emote '^sparkle$' 1500)"
  expect_eq H10 "git push -> sparkle emote" "$v" sparkle
  capture h10_push_sparkle "H10 sparkle on push"
  end_sid "$sid"
}

g_h11() {
  echo "== H11 prompt after >= 90 s -> bulb next to Thinking...; a second prompt at once -> none"
  need_next H11 "bulb" || return
  local sid v s; sid="$(new_sid h11)"
  hook_fresh; wait_state emote '^$' 3000 >/dev/null
  rp -s "$sid" user_prompt_submit
  v="$(wait_state emote '^bulb$' 1500)"
  expect_eq H11 "first prompt of the session -> bulb" "$v" bulb
  expect_match H11 "bubble Thinking..." "$(st bubble.text)" "Thinking|typing"
  capture h11_bulb "H11 bulb + Thinking..."
  wait_state emote '^$' 4000 >/dev/null; sleep 1.6
  watch_bg "$RUN_DIR/_h11.txt" 'o.emote' 1800
  rp -s "$sid" user_prompt_submit
  s="$(watch_end "$RUN_DIR/_h11.txt")"
  expect_not H11 "second prompt within 90 s -> no bulb" "$s" '^bulb$'
  end_sid "$sid"
}

g_h12() {
  echo "== H12 first prompt after >= 20 min without Claude Code activity -> startle (fake clock)"
  need_next H12 "startle" || return
  local sid s; sid="$(new_sid h12)"
  dpost /debug/date "{\"iso\":\"$T0_ISO\"}" >/dev/null
  rp -s "$sid" pre_read_1
  sleep 0.5
  dpost /debug/date '{"iso":"2026-06-15T15:21:00"}' >/dev/null
  hook_fresh
  watch_bg "$RUN_DIR/_h12.txt" 'o.anim' 3000
  rp -s "$sid" user_prompt_submit
  s="$(watch_end "$RUN_DIR/_h12.txt")"
  if seq_has "$s" '^startle$'; then res H12 "21 min quiet, then a prompt -> startle" PASS "$s"
  else res H12 "21 min quiet, then a prompt -> startle" FAIL "$s (the quiet time must use the /debug/date clock)"; fi
  dpost /debug/date '{"iso":null}' >/dev/null
  end_sid "$sid"
}

# ── H13 / H14 / H19: notifications ──────────────────────────────────────
g_h13() {
  echo "== H13 permission prompt: waiting + sticky bubble, nervous after 30 s, ends on the next hook; hidden: bang, sweat (~70 s)"
  need_next H13 "permission prompt" || return
  local sid sid2 v t1 t2; sid="$(new_sid h13)"
  rp -s "$sid" notification_permission
  v="$(wait_state anim '^waiting$' 2000)"; t1=$(date +%s%3N)
  expect_eq H13 "permission prompt -> waiting" "$v" waiting
  sleep 0.4
  expect_match H13 "sticky permission bubble (P1)" "$(st bubble.prio):$(st bubble.text)" "^1:.*permission"
  capture h13_waiting "H13 waiting + permission bubble"
  v="$(wait_state anim '^nervous$' 33000)"; t2=$(date +%s%3N)
  expect_eq H13 "no hook for 30 s -> nervous" "$v" nervous
  if [ $((t2 - t1)) -ge 29000 ]; then res H13 "nervous not before 30 s" PASS "$((t2 - t1)) ms"; else res H13 "nervous not before 30 s" FAIL "$((t2 - t1)) ms"; fi
  capture h13_nervous "H13 nervous"
  rp -s "$sid" pre_read_1
  v="$(wait_state anim '^(?!nervous$)' 800)"
  if [ -n "$v" ] && [ "$v" != nervous ]; then res H13 "the next hook from that session ends it at once" PASS "$v"; else res H13 "the next hook from that session ends it at once" FAIL "'$v'"; fi
  end_sid "$sid"
  settle_idle; hook_fresh
  debug_hidden_pose
  sid2="$(new_sid h13h)"
  rp -s "$sid2" notification_permission
  v="$(wait_state emote '^bang$' 2000)"
  expect_eq H13 "hidden: permission prompt -> bang emote" "$v" bang
  capture h13_hidden_bang "H13 hidden + bang"
  v="$(wait_state emote '^sweat$' 33000)"
  expect_eq H13 "hidden: after 30 s -> sticky sweat" "$v" sweat
  capture h13_hidden_sweat "H13 hidden + sweat"
  clear_hidden_pose
  end_sid "$sid2"
}

g_h14() {
  echo "== H14 idle prompt -> waiting + bubble (not P1); H19 usage limit stays disabled; hidden: question"
  need_next H14 "idle prompt" || return
  local sid sid2 v s; sid="$(new_sid h14)"
  rp -s "$sid" notification_idle
  v="$(wait_state anim '^waiting$' 2000)"
  expect_eq H14 "idle prompt -> waiting" "$v" waiting
  sleep 0.4
  expect_match H14 "bubble 'waiting for your input', not P1" "$(st bubble.prio):$(st bubble.text)" "^[2-4]:.*waiting for your input"
  capture h14_idle "H14 idle prompt"
  hook_fresh
  watch_bg "$RUN_DIR/_h19.txt" 'o.anim' 2500
  rp -s "$sid" notification_limit
  s="$(watch_end "$RUN_DIR/_h19.txt")"
  expect_not H19 "usage-limit notification: no reaction (LIMIT_ENABLED = false)" "$s" '^sad$'
  end_sid "$sid"
  settle_idle; hook_fresh
  debug_hidden_pose
  sid2="$(new_sid h14h)"
  rp -s "$sid2" notification_idle
  v="$(wait_state emote '^question$' 2000)"
  expect_eq H14 "hidden: idle prompt -> question emote" "$v" question
  capture h14_hidden_question "H14 hidden + question"
  clear_hidden_pose
  end_sid "$sid2"
}

# ── H15-H17: SessionStart compact / clear / resume ──────────────────────
g_h15() {
  echo "== H15/H16/H17 SessionStart compact -> chomp, clear -> sparkle, resume -> waving + hearts (once)"
  need_next H15 "SessionStart" || return
  local sid v s; sid="$(new_sid h15)"
  hook_fresh
  rp -s "$sid" session_start_compact
  v="$(wait_state anim '^chomp$' 2000)"
  expect_eq H15 "compact -> chomp" "$v" chomp
  sleep 0.3
  expect_match H15 "bubble 'Munched the old context!'" "$(st bubble.text)" "Munched the old context"
  capture h15_compact "H15 chomp after compaction"
  sleep 2; hook_fresh
  rp -s "$sid" session_start_clear
  v="$(wait_state emote '^sparkle$' 1500)"
  expect_eq H16 "clear -> sparkle emote" "$v" sparkle
  sleep 0.3
  expect_match H16 "bubble 'Fresh start!'" "$(st bubble.text)" "Fresh start"
  capture h16_clear "H16 sparkle + Fresh start"
  sleep 2; hook_fresh
  rp -s "$sid" session_start_resume
  v="$(wait_state anim '^waving$' 2000)"
  expect_eq H17 "resume -> waving" "$v" waving
  v="$(wait_state emote '^hearts$' 1500)"
  expect_eq H17 "resume -> hearts emote" "$v" hearts
  expect_match H17 "bubble 'Welcome back!'" "$(st bubble.text)" "Welcome back"
  capture h17_resume "H17 waving + hearts + Welcome back"
  sleep 3.5   # no hook_fresh: "once per session" is what is checked
  watch_bg "$RUN_DIR/_h17.txt" 'o.anim' 2000
  rp -s "$sid" session_start_resume
  s="$(watch_end "$RUN_DIR/_h17.txt")"
  expect_not H17 "a second resume of the same session -> no waving" "$s" '^waving$'
  end_sid "$sid"
}

# ── H18: completion variants ────────────────────────────────────────────
g_h18() {
  echo "== H18 completion by run length (fake clock), never the same twice, cool after a clean streak + push"
  need_next H18 "completion variants" || return
  local sid v prev="" e iso want label
  # g3-full fix (spec §4.4 H18 order): the cool rule comes first. After three clean completions a
  # run with a push (or L >= 10 min) is cool, and cool cannot repeat, so the 20-min run is checked
  # AFTER the pushed cool run and must then be dance (x2). Old order expected dance straight after a
  # clean streak of 3 (cool is right there) and cool right after it (a repeat).
  for e in "2026-06-15T15:00:10;^(hop|jumping)$;10s" "2026-06-15T15:01:00;^(hop|jumping)$;1min" \
           "2026-06-15T15:05:00;^(backflip|dance)$;5min" "2026-06-15T15:00:10;^cool$;push-cool" \
           "2026-06-15T15:20:00;^dance$;20min"; do
    IFS=';' read -r iso want label <<< "$e"
    sid="$(new_sid h18)"
    dpost /debug/date "{\"iso\":\"$T0_ISO\"}" >/dev/null
    focus_run "$sid"
    if [ "$label" = push-cool ]; then rp -s "$sid" pre_git_push; sleep 1.6; fi
    dpost /debug/date "{\"iso\":\"$iso\"}" >/dev/null
    hook_fresh
    rp -s "$sid" stop
    v="$(wait_state anim '^(hop|jumping|backflip|dance|cool)$' 2500)"
    expect_match H18 "run of $label -> $want" "$v" "$want"
    [ "$label" = 10s ] && [ "$v" = jumping ] && res H18 "  10 s run gave jumping" INFO "allowed only as the no-repeat substitute for hop"
    # (only a real variant counts: a timed-out wait returns the last anim, e.g. idle, and has FAILed above)
    if [ -n "$prev" ] && [ "$v" = "$prev" ] && printf '%s\n' "$v" | grep -Eq '^(hop|jumping|backflip|dance|cool)$'; then res H18 "never the same variant twice in a row" FAIL "$prev then $v"; fi
    prev="$v"
    sleep 0.3; capture "h18_${label}" "H18 run $label -> $v"
    sleep 3; end_sid "$sid"
  done
  res H18 "never the same variant twice in a row" INFO "checked above (a FAIL line appears only on a repeat)"
  dpost /debug/date '{"iso":null}' >/dev/null
}

# ── H20 / H21: Auto work hats ───────────────────────────────────────────
g_h20() {
  echo "== H20 Auto work hats: hardhat from 2 min, headband from 8 min of a focus run (fake clock)"
  need_next H20 "work hats" || return
  local sid v; sid="$(new_sid h20)"
  dpost /debug/hat '{"id":null}' >/dev/null
  dpost /debug/date "{\"iso\":\"$T0_ISO\"}" >/dev/null
  focus_run "$sid"
  expect_match H20 "a fresh run: no work hat" "$(st hat)" '^(null|)$'
  dpost /debug/date '{"iso":"2026-06-15T15:02:10"}' >/dev/null
  rp -s "$sid" pre_read_1
  v="$(wait_state hat '^hardhat$' 65000)"
  expect_eq H20 "running 2 min -> hardhat" "$v" hardhat
  capture h20_hardhat "H20 hardhat after 2 min"
  dpost /debug/date '{"iso":"2026-06-15T15:08:10"}' >/dev/null
  rp -s "$sid" pre_edit
  v="$(wait_state hat '^headband$' 65000)"
  expect_eq H20 "running 8 min -> headband" "$v" headband
  capture h20_headband "H20 headband after 8 min"
  rp -s "$sid" stop
  v="$(wait_state hat '^(?!hardhat$|headband$)' 65000)"
  if [ "$v" != hardhat ] && [ "$v" != headband ]; then res H20 "run over -> work hat off" PASS "hat='$v'"; else res H20 "run over -> work hat off" FAIL "hat=$v"; fi
  dpost /debug/date '{"iso":null}' >/dev/null
  end_sid "$sid"
}

g_h21() {
  echo "== H21 plan mode on the focus session -> wizard hat; back to default mode -> off"
  need_next H21 "plan mode" || return
  local sid v; sid="$(new_sid h21)"
  dpost /debug/hat '{"id":null}' >/dev/null
  focus_run "$sid"
  rp -s "$sid" pre_plan_mode
  v="$(wait_state hat '^wizard$' 11000)"
  expect_eq H21 "permission_mode plan -> wizard" "$v" wizard
  capture h21_wizard "H21 wizard in plan mode"
  rp -s "$sid" -m default pre_read_1
  v="$(wait_state hat '^(?!wizard$)' 12000)"
  if [ "$v" != wizard ]; then res H21 "mode default again -> wizard off (<= 10 s)" PASS "hat='$v'"; else res H21 "mode default again -> wizard off (<= 10 s)" FAIL "still wizard"; fi
  end_sid "$sid"
}

# ── background sessions ─────────────────────────────────────────────────
g_hbg() {
  echo "== F1 background session: its Stop plays no row, its SessionStart does not flip the pet to idle"
  need_next HBG "background session" || return
  local a b s; a="$(new_sid hbga)"; b="$(new_sid hbgb)"
  rp -S "$b" user_prompt_submit_b
  sleep 0.3
  focus_run "$a"
  rp -s "$a" pre_read_1
  sleep 1
  expect_eq HBG "focus session is the latest prompter" "$(st focusSession)" "$a"
  hook_fresh
  # g3-full fix: the SessionStart check runs BEFORE the background Stop. Run after it, "status stays
  # running" measured the Stop's own completed -> idle revert (per-session aggregate status is §5.2
  # Later), not the §4.6 SessionStart guard it is meant to check.
  watch_bg "$RUN_DIR/_hbg2.txt" 'o.anim' 2500
  rp -S "$b" session_start_startup_b
  s="$(watch_end "$RUN_DIR/_hbg2.txt")"
  expect_not HBG "background SessionStart -> no idle flip" "$s" '^idle$'
  expect_eq HBG "status stays running (SessionStart guard)" "$(st status)" running
  capture hbg_sessionstart "background SessionStart during a focus run"
  hook_fresh
  watch_bg "$RUN_DIR/_hbg.txt" 'o.anim' 3000
  rp -S "$b" stop_b
  s="$(watch_end "$RUN_DIR/_hbg.txt")"
  expect_not HBG "background Stop -> no completion row" "$s" '^(hop|jumping|backflip|dance|cool|idle)$'
  res HBG "background Stop bubble" INFO "bubble='$(st bubble.text)'"
  capture hbg_stop "background Stop during a focus run"
  res HBG "status after the background Stop's revert (per-session aggregate is §5.2 Later)" INFO "status=$(st status) anim=$(st anim)"
  end_sid "$a"; rp -S "$b" session_end_b
}

# ── Reactions Off / old notify ──────────────────────────────────────────
g_hoff() {
  echo "== F1 Reactions Off: no hook rows, emotes or work hats; completion = jumping/backflip roll"
  need_next HOFF "Reactions Off" || return
  set_flag reactions false
  expect_eq HOFF "menu Reactions Off (action ${REACTIONS_ACTION:-toggle-reactions})" "$(st reactions)" false
  if [ "$(st reactions)" != false ]; then res HOFF "Reactions Off" SKIP "could not switch reactions off"; return; fi
  local sid s v; sid="$(new_sid hoff)"
  watch_bg "$RUN_DIR/_hoff.txt" 'o.anim + "|" + (o.emote || "") + "|" + (o.hat || "")' 9000
  rp -s "$sid" -u o1 user_prompt_submit +500 pre_bash_test +1500 pre_read_1 +300 pre_read_2 +1500 pre_plan_mode
  s="$(watch_end "$RUN_DIR/_hoff.txt")"
  expect_not HOFF "no hook rows (fingers-crossed, work poses, sad, summon, startle)" "$s" '^(fingers-crossed|work-read|work-shell|sad|summon|startle)\|'
  expect_not HOFF "no hook emotes" "$s" '^[^|]*\|[^|]+\|'
  expect_not HOFF "no work / plan hats" "$s" '\|(hardhat|headband|wizard|halo)$'
  capture hoff_running "Reactions Off while running"
  hook_fresh
  rp -s "$sid" stop
  v="$(wait_state anim '^(hop|jumping|backflip|dance|cool)$' 2500)"
  expect_match HOFF "completion -> jumping/backflip roll" "$v" '^(jumping|backflip)$'
  sleep 3; end_sid "$sid"
  set_flag reactions true
  expect_eq HOFF "Reactions back On" "$(st reactions)" true
}

g_holdnotify() {
  echo "== old notify (git HEAD hooks/notify.js copy: plain status POSTs, no Gate 3 fields) -> pre-Gate-3 behaviour"
  local sid s v e0 e1 n0 n1; sid="$(new_sid old)"
  if ! bash "$DEV_DIR/replay.sh" --check --notify baseline --port "$QA_PORT" >/dev/null 2>&1; then res OLD "old notify copy" FAIL "could not build tmp/c/notify_baseline.js"; return; fi
  e0="$(st 'errors.length')"; n0="$(st hookEvents.real)"
  hook_fresh
  watch_bg "$RUN_DIR/_old.txt" 'o.anim + "|" + (o.emote || "") + "|" + (o.hat || "")' 9000
  RP_NOTIFY=baseline rp -s "$sid" -u q1 user_prompt_submit +400 pre_read_1 +300 pre_read_2 +1600 pre_bash_test +1500 post_bash_test_failtext +400 notification_permission
  s="$(watch_end "$RUN_DIR/_old.txt")"
  expect_not OLD "no Gate 3 rows (fingers-crossed, work poses, sad, summon)" "$s" '^(fingers-crossed|work-read|work-shell|sad|summon)\|'
  expect_not OLD "no hook emotes" "$s" '^[^|]*\|(tool-[a-z]+|bulb|dots|sparkle|bangq)\|'
  expect_eq OLD "permission Notification -> waiting (message fallback)" "$(wait_state anim '^waiting$' 2000)" waiting
  capture old_waiting "old notify: waiting"
  hook_fresh
  RP_NOTIFY=baseline rp -s "$sid" stop
  v="$(wait_state anim '^(hop|jumping|backflip|dance|cool)$' 2500)"
  expect_match OLD "Stop -> today's jumping/backflip roll" "$v" '^(jumping|backflip)$'
  capture old_completed "old notify: completed"
  e1="$(st 'errors.length')"; n1="$(st hookEvents.real)"
  expect_eq OLD "no renderer errors" "${e1:-0}" "${e0:-0}"
  expect_eq OLD "every old-notify POST arrived (7 sent)" "$(( ${n1:-0} - ${n0:-0} ))" 7
  sleep 3
  RP_NOTIFY=baseline rp -s "$sid" session_end
}

# ── §8.3 states x H-triggers (P1 permission prompt, P2 test run) ────────
mx3_enter() {
  case "$1" in
    sleeping) ppost /action '{"action":"nap"}' >/dev/null; wait_state sleepStage '^2$' 6000 >/dev/null;;
    hidden) debug_hidden_pose;;
    usage) ppost /debug/usage "$(curl -s -m 10 "$BASE/usage")" >/dev/null; sleep 0.8;;
    petting) cdp hover; sleep 2;;
  esac
}
mx3_leave() {
  case "$1" in
    sleeping) ppost /action '{"action":"wave"}' >/dev/null; sleep 1.8;;
    hidden) clear_hidden_pose;;
    petting) cdp leave; sleep 1;;
  esac
  settle_idle
}
g_hmatrix() {
  echo "== states x H-triggers (window parked): sleeping, hidden pose, usage card, petting"
  need_next MX3 "states x hooks" || return
  local st_ sid s v
  for st_ in sleeping hidden usage petting; do
    if [ "$st_" = petting ] && [ "$HAVE_CDP" != 1 ]; then res MX3 "petting x hooks" SKIP "no DevTools port"; continue; fi
    # P2: an npm test Pre (sleeping: dropped; hidden / usage card / petting: the dots emote only)
    sid="$(new_sid mx$st_)"; hook_fresh; mx3_enter "$st_"
    watch_bg "$RUN_DIR/_mx_$st_.txt" 'o.anim + "|" + (o.emote || "")' 2500
    rp -s "$sid" -u m1 pre_bash_test
    s="$(watch_end "$RUN_DIR/_mx_$st_.txt")"
    expect_not MX3 "$st_ + test Pre: no fingers-crossed row" "$s" '^fingers-crossed\|'
    if [ "$st_" != sleeping ]; then
      if seq_has "$s" '\|dots$'; then res MX3 "$st_ + test Pre: dots emote" PASS "$s"; else res MX3 "$st_ + test Pre: dots emote" FAIL "$s"; fi
    fi
    capture "mx3_${st_}_p2" "$st_ + npm test Pre"
    end_sid "$sid"; mx3_leave "$st_"
    # P1: a permission prompt (sleeping: startle, then waiting; hidden: bang; usage / petting: waiting)
    sid="$(new_sid mx$st_)"; hook_fresh; mx3_enter "$st_"
    watch_bg "$RUN_DIR/_mx1_$st_.txt" 'o.anim + "|" + (o.emote || "")' 3000
    rp -s "$sid" notification_permission
    s="$(watch_end "$RUN_DIR/_mx1_$st_.txt")"
    case "$st_" in
      sleeping) expect_match MX3 "sleeping + permission prompt: startle, then waiting" "$s" 'startle\|[^>]*>(.*>)?waiting\|';;
      hidden) if seq_has "$s" '\|bang$'; then res MX3 "hidden + permission prompt: bang" PASS "$s"; else res MX3 "hidden + permission prompt: bang" FAIL "$s"; fi;;
      *) if seq_has "$s" '^waiting\|'; then res MX3 "$st_ + permission prompt: waiting row" PASS "$s"; else res MX3 "$st_ + permission prompt: waiting row" FAIL "$s"; fi;;
    esac
    capture "mx3_${st_}_p1" "$st_ + permission prompt"
    end_sid "$sid"; mx3_leave "$st_"
  done
  res MX3 "dragging / menu / climb states" INFO "drag + hook needs a held synthetic drag; mid-fling is group hfling"
}

# ── a hook during a fling (ON-SCREEN) ───────────────────────────────────
g_hfling() {
  echo "== F1 hooks during a fling: the crab still lands, then plays the status row / queue (ON-SCREEN)"
  need_next HFLING "hook during a fling" || return
  local sid v s; sid="$(new_sid hfling)"
  fling_fresh; hook_fresh
  rp -s "$sid" user_prompt_submit
  ppost /action '{"action":"fling"}' >/dev/null
  sleep 0.15
  expect_eq HFLING "in the air when the hooks arrive" "$(st moveKind)" fling
  rp -s "$sid" -u fl pre_bash_test pre_read_1
  capture hfling_midair "hooks arriving mid-fling"
  v="$(wait_state moveKind '^(null|)$' 8000)"
  expect_match HFLING "the crab lands (moveKind cleared)" "$v" '^(null|)$'
  s="$(seq_state anim 5000)"
  res HFLING "rows after landing" INFO "$s"
  v="$(st anim)"
  case "$v" in fall|fling|dangle|dangle-scared|"") res HFLING "not frozen mid-air" FAIL "anim=$v";; *) res HFLING "not frozen mid-air" PASS "anim=$v";; esac
  capture hfling_landed "landed after hooks mid-fling"
  end_sid "$sid"
}

# ── live sessions never reach the dev port ──────────────────────────────
g_hlive() {
  local secs="${HLIVE_SECS:-300}" l0 l1 n0 n1
  echo "== F1 live sessions never reach port $QA_PORT (${secs} s; this script sends no hook meanwhile)"
  # READ-ONLY look at the live pet (GET /status on 31126 is the one allowed request to it)
  l0="$(jv "$(curl -s -m 3 http://127.0.0.1:31126/status)" o.message)"
  n0="$(st hookEvents.real)"
  sleep "$secs"
  n1="$(st hookEvents.real)"
  l1="$(jv "$(curl -s -m 3 http://127.0.0.1:31126/status)" o.message)"
  expect_eq HLIVE "hook events reaching the dev pet from real sessions in ${secs} s" "$(( ${n1:-0} - ${n0:-0} ))" 0
  if [ -n "$l1" ] && [ "$l0" != "$l1" ]; then res HLIVE "the live pet got fresh updates meanwhile" PASS "message changed"
  else res HLIVE "the live pet got fresh updates meanwhile" INFO "message unchanged (no live session worked?)"; fi
}

# ── group runner ────────────────────────────────────────────────────────
# ON-SCREEN groups move the dev window onto the user's visible screen (drags, flings, roaming,
# edge-hiding, perching on windows). They run only with QA_ON_SCREEN=1, after every parked group,
# each from a known spot (240 px in from the left of the work area, on the ground, away from the
# live pet in the bottom-right), and the window is parked back at x -320 after each one.
GROUPS_G12="f7 anim alias d8 d9 d13 d15 d16 d18 d19 f8 f5 emotes overlay hats autohats matrix"
# Gate 3 (parked); hlive (a ${HLIVE_SECS:-300} s quiet window) runs last of them
GROUPS_G3="hnotify h1 h2 burst h3 h3cap h5 h6 h7 h9 h11 h12 h13 h14 h15 h18 h20 h21 hbg hoff holdnotify hmatrix hlive"
GROUPS_OFFSCREEN="$GROUPS_G12 $GROUPS_G3"
GROUPS_ONSCREEN_G12="d1 d2 d3 d5 d6 d7 d11 d13_live d17 overlay_live matrix_live"
GROUPS_ONSCREEN="$GROUPS_ONSCREEN_G12 hfling"
GROUPS_ALL="$GROUPS_OFFSCREEN $GROUPS_ONSCREEN"
is_onscreen() { case " $GROUPS_ONSCREEN " in *" $1 "*) return 0;; esac; return 1; }
SEL_GROUPS="${*:-$GROUPS_ALL}"
# aliases: gate12 / gate3 expand to that gate's groups (parked + on-screen)
SEL_GROUPS="$(printf ' %s ' "$SEL_GROUPS" | sed -e "s/ gate12 / $GROUPS_G12 $GROUPS_ONSCREEN_G12 /g" -e "s/ gate3 / $GROUPS_G3 hfling /g")"
ORDERED=""
for g in $SEL_GROUPS; do is_onscreen "$g" || ORDERED="$ORDERED $g"; done
for g in $SEL_GROUPS; do is_onscreen "$g" && ORDERED="$ORDERED $g"; done
warned=0
for g in $ORDERED; do
  if ! declare -F "g_$g" >/dev/null; then echo "unknown group $g (known: $GROUPS_ALL)"; continue; fi
  if is_onscreen "$g"; then
    if [ "${QA_ON_SCREEN:-0}" != 1 ]; then
      res "${g^^}" "group $g" SKIP "moves the dev window onto the visible screen; rerun with QA_ON_SCREEN=1"
      continue
    fi
    if [ "$warned" = 0 ]; then
      warned=1
      echo "!! QA_ON_SCREEN=1: the dev pet now moves on the visible screen (it is parked again afterwards)"
    fi
    place_onscreen || echo "  (could not place the window on screen: no DevTools port)"
    settle_idle
    "g_$g"
    park
  else
    settle_idle   # every group starts from a neutral, standing, idle crab
    "g_$g"
  fi
done
finish
[ "$FAILN" -eq 0 ]

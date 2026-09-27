# lib.sh - helpers for tools/qa/dev/scenarios.sh (sourced, not run).
# Talks ONLY to the dev pet (CLAWD_QA_PORT, default 31127). Every /debug/* call carries X-Clawd-Debug: 1.

QA_PORT="${CLAWD_QA_PORT:-31127}"
if [ "$QA_PORT" = "31126" ]; then echo "lib.sh: 31126 is the live pet. Refusing." >&2; exit 2; fi
BASE="http://127.0.0.1:${QA_PORT}"
HDR="X-Clawd-Debug: 1"
DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA="$(cd "$DEV_DIR/.." && pwd)"
REPO="$(cd "$QA/../.." && pwd)"
CDP_PORT="${CLAWD_CDP_PORT:-9231}"
PY="E:/Vibegaming playground/30_Tools/py311/python.exe"
RUN_DIR="${RUN_DIR:-$QA/out/dev/run-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$RUN_DIR"
RESULTS="$RUN_DIR/results.tsv"
LABELS="$RUN_DIR/_labels.tsv"
: > "$LABELS"
[ -f "$RESULTS" ] || printf "id\tcheck\tresult\tdetail\n" > "$RESULTS"
SHOT_N=0

# ── HTTP ────────────────────────────────────────────────────────────────
dget()  { curl -s -m 5 -H "$HDR" "$BASE$1"; }
dpost() { local d="${2:-}"; [ -z "$d" ] && d='{}'; curl -s -m 10 -X POST -H "$HDR" -H "Content-Type: application/json" --data "$d" "$BASE$1"; }
# plain (non-debug) routes that already exist in main.js
ppost() { local d="${2:-}"; [ -z "$d" ] && d='{}'; curl -s -m 10 -X POST -H "Content-Type: application/json" --data "$d" "$BASE$1"; }
code_of() { curl -s -o /dev/null -m 5 -w "%{http_code}" "$@"; }

# jq-less JSON: jv '<json>' 'o.anim'  (expression over o)
jv() { printf '%s' "$1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let o;try{o=JSON.parse(s)}catch(e){process.stdout.write('');return}let v;try{v=($2)}catch(e){v=undefined}process.stdout.write(v===undefined||v===null?'':(typeof v==='object'?JSON.stringify(v):String(v)))})"; }
st()  { jv "$(dget /debug/state)" "o.$1"; }

cdp() { node "$DEV_DIR/cdp.js" --port "$CDP_PORT" "$@"; }
cdp_ok() { curl -s -m 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; }

# ── bookkeeping ─────────────────────────────────────────────────────────
PASSN=0; FAILN=0; SKIPN=0; INFON=0
res() { # id check result detail
  printf "%s\t%s\t%s\t%s\n" "$1" "$2" "$3" "${4:-}" >> "$RESULTS"
  case "$3" in PASS) PASSN=$((PASSN+1));; FAIL) FAILN=$((FAILN+1));; SKIP) SKIPN=$((SKIPN+1));; *) INFON=$((INFON+1));; esac
  printf "  [%-4s] %-6s %s %s\n" "$3" "$1" "$2" "${4:+— ${4:-}}"
}
expect_eq() { # id check actual expected
  if [ "$3" = "$4" ]; then res "$1" "$2" PASS "$3"; else res "$1" "$2" FAIL "got '$3' expected '$4'"; fi
}
expect_match() { # id check actual regex
  # '%s\n': an empty value must still be one (empty) line, or grep never matches ^(null|)$ (QA-runner fix)
  if printf '%s\n' "$3" | grep -Eq "$4"; then res "$1" "$2" PASS "$3"; else res "$1" "$2" FAIL "got '$3' expected /$4/"; fi
}

# Both helpers run ONE long-lived sampler (watch.js: keep-alive GET /debug/state every 25 ms). A
# curl + node per read took ~0.45 s, so short events (a 130 ms blink, dangle-scared) were luck.
# The regex is JavaScript's (ERE-compatible for what the scenarios use); '' stands for null.
# wait_state <field> <regex> <timeout ms> → echoes the matching (or last) value, returns 0 when matched
wait_state() {
  node "$DEV_DIR/watch.js" --port "$QA_PORT" --expr "o.$1" --ms "${3:-3000}" --until "$2"
}

# seq_state <field> <ms> → distinct successive values over <ms>, joined by '>'
seq_state() {
  node "$DEV_DIR/watch.js" --port "$QA_PORT" --expr "o.$1" --ms "$2"
}

# capture <name> [caption] → POST /debug/capture, copy the PNG into RUN_DIR with an ordering prefix
capture() {
  local name="$1" cap="${2:-$1}" r p
  r="$(dpost /debug/capture "{\"name\":\"$name\"}")"
  p="$(jv "$r" "o.path||o.file||''")"
  if [ -z "$p" ]; then res CAP "capture $name" FAIL "response: ${r:0:120}"; return 1; fi
  SHOT_N=$((SHOT_N+1))
  local dst; dst="$(printf '%s/%03d_%s.png' "$RUN_DIR" "$SHOT_N" "$name")"
  node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" "$p" "$dst" 2>/dev/null \
    || { res CAP "capture $name" FAIL "copy failed: $p"; return 1; }
  printf '%s\t%s\n' "$(basename "$dst")" "$cap" >> "$LABELS"
}

# anim <name> [frame] [flip] → POST /debug/anim; echoes the response
anim() {
  local body="{\"name\":\"$1\""
  [ -n "$2" ] && [ "$2" != "-" ] && body="$body,\"frame\":$2"
  [ "$3" = "flip" ] && body="$body,\"flip\":true"
  dpost /debug/anim "$body}"
}

# ── idempotent switches ─────────────────────────────────────────────────
# /action toggle-* flips whatever is there, so a run that starts with roam already on (an aborted
# earlier run) would turn it OFF with "on" and back ON with "off". set_flag reads first.
# set_flag <roam|mischief|hide> <true|false>
set_flag() {
  local field action to
  case "$1" in
    roam) field=roam; action=toggle-roam; to=2000;;
    mischief) field=mischief; action=toggle-mischief; to=2000;;
    hide) field=hiddenMode; action=toggle-hide; to=15000;;
    # Gate 3 menu "🔔 Reactions: On/Off"; the spec names no action id, toggle-reactions is assumed
    reactions) field=reactions; action="${REACTIONS_ACTION:-toggle-reactions}"; to=2000;;
    *) echo "set_flag: unknown flag $1" >&2; return 2;;
  esac
  local cur; cur="$(st "$field")"
  [ -z "$cur" ] && return 1              # the dev pet did not answer
  [ "$cur" = "$2" ] && return 0
  ppost /action "{\"action\":\"$action\"}" >/dev/null
  wait_state "$field" "^$2\$" "$to" >/dev/null
}

# leave a perch (the perch action toggles too: only send it while perched)
leave_perch() {
  [ "$(st perched)" = true ] || return 0
  ppost /action '{"action":"perch"}' >/dev/null
  wait_state perched '^false$' 8000 >/dev/null
}

# ── window placement (cdp.js place; the dev pet starts parked at x -320) ──
ONSCREEN_USED=0
win_x() { st win.x; }
place_onscreen() { # → 0 when the window is on screen
  [ "$HAVE_CDP" = 1 ] || return 1
  ONSCREEN_USED=1
  cdp place onscreen >/dev/null
  local x; x="$(win_x)"
  [ -n "$x" ] && [ "$x" -ge 0 ]
}
park() { # back to x -320 (off-screen); no-op without the DevTools port
  [ "$HAVE_CDP" = 1 ] || { [ "$ONSCREEN_USED" = 1 ] && echo "  (no DevTools port: cannot park the dev window, it stays at x=$(win_x))"; return 0; }
  wait_state moveKind '^(null|)$' 8000 >/dev/null
  cdp place park >/dev/null
}

# A debug pose (/debug/anim {climb, hidden}) only sets climbSide / hiddenMode and the CSS classes: the
# window never moves. A real edge-hide or climb always walks the window onto a screen first. So while
# the window still sits exactly at the park spot and nothing is walking, any hiddenMode / climbSide is
# a leftover debug pose, and it must be cleared in place: toggle-hide would run a real exitHide walk,
# which drops the parked window at the bottom-right of the work area, on top of the live pet.
PARK_X=-320
clear_debug_pose() { # → 0 when a debug pose was found and cleared
  local s; s="$(dget /debug/state)"
  [ -n "$(jv "$s" o.anim)" ] || return 1
  [ "$(jv "$s" o.hiddenMode)" = true ] || [ -n "$(jv "$s" o.climbSide)" ] || return 1
  [ "$(jv "$s" o.win.x)" = "$PARK_X" ] || return 1
  [ -z "$(jv "$s" o.moveKind)" ] || return 1
  [ "$(jv "$s" o.perched)" = true ] && return 1
  dpost /debug/anim '{"climb":"none","hidden":false}' >/dev/null
  return 0
}

settle_idle() { # back to a neutral state between scenarios
  # QA-runner fix: keep the dev pet awake. With the user away the real system idle is > 480 s, so the
  # pet dozes/sleeps and every sleepStage-gated trigger (D5 landing row, D8 petting, D9 tickle) fails.
  # 12 s = under the 15 s wake threshold (wakes a dozing/sleeping pet) but above the 10 s cursor-watch
  # arming threshold; the override lasts 90 s in main.js.
  ppost /idle '{"seconds":12}' >/dev/null
  # Leave what earlier groups left behind (a perch, edge-hiding, a debug climb pose, a walk or a
  # fall still running), or later captures show a rotated / walking crab under the wrong label.
  # A debug pose goes first (in place); only a real edge-hide is walked back with toggle-hide.
  clear_debug_pose
  [ "$(st hiddenMode)" = true ] && set_flag hide false
  leave_perch
  [ -n "$(st climbSide)" ] && dpost /debug/anim '{"climb":"none","hidden":false}' >/dev/null
  wait_state moveKind '^(null|)$' 8000 >/dev/null
  dpost /debug/emote '{"name":null}' >/dev/null
  dpost /debug/hat '{"id":null}' >/dev/null
  dpost /debug/cursor 'null' >/dev/null
  anim idle >/dev/null
  sleep 0.3
}

# ── cleanup on exit / Ctrl-C (armed by scenarios.sh once the preflight found the dev pet) ──
QA_CLEANED=0
qa_cleanup() {
  [ "$QA_CLEANED" = 1 ] && return 0
  QA_CLEANED=1
  [ -n "$(st anim)" ] || return 0          # dev pet gone: nothing to restore
  set_flag roam false
  set_flag mischief false
  [ "$(st reactions)" = false ] && set_flag reactions true   # a Reactions-Off group was interrupted
  clear_debug_pose   # interrupted inside a debug hidden pose (g_overlay): clear it, never walk it back
  [ "$(st hiddenMode)" = true ] && set_flag hide false
  leave_perch
  dpost /debug/date '{"iso":null}' >/dev/null
  dpost /debug/cursor 'null' >/dev/null
  [ "$ONSCREEN_USED" = 1 ] && park
  return 0
}
arm_cleanup() {
  trap 'qa_cleanup' EXIT
  trap 'echo; echo "interrupted: restoring the dev pet (roam/mischief off, no hide/perch, parked)"; qa_cleanup; exit 130' INT TERM
}

contract_frames() { # frames of a row or alias from tools/qa/contract.json
  node -e "const c=require(process.argv[1]);const n=process.argv[2];const r=c.rows[n];if(r){console.log(r.frames)}else if(c.aliases[n]){console.log(c.aliases[n].frameIndices.length)}else{console.log('')}" "$QA/contract.json" "$1"
}

finish() {
  echo
  echo "results: $RESULTS"
  echo "PASS $PASSN  FAIL $FAILN  SKIP $SKIPN  INFO $INFON"
  if [ "$SHOT_N" -gt 0 ]; then
    "$PY" "$QA/montage.py" "$RUN_DIR" "$RUN_DIR/../$(basename "$RUN_DIR")_montage.png" --cols 6 --title "dev scenarios $(basename "$RUN_DIR")" --labels "$LABELS"
  fi
}

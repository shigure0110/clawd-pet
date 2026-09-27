#!/usr/bin/env bash
# replay.sh - replay Gate 3 hook fixtures (tools/qa/dev/hooks/*.json) into the DEV pet (spec §7 Gate 3 C).
#
#   bash tools/qa/dev/replay.sh pre_bash_test +1500 post_bash_test_pass
#   bash tools/qa/dev/replay.sh --seq seq_agents_parallel -s qa-sess-1
#   bash tools/qa/dev/replay.sh --notify baseline pre_read_1          # "old notify": today's plain status POST
#
# Each fixture runs as:  CLAWD_PORT=31127 CLAWD_NO_REVIVE=1 node hooks/notify.next.js <Event> < fixture
# (driver: dev/replay.js; options there: -s/-S session ids, -u tool_use_id suffix, -m permission_mode,
# -g fixed-rate gap, --notify next|baseline|ref|<path>, --port). Never hooks/notify.js (the LIVE hook,
# hard-coded to 31126) and never port 31126: both are refused. CLAWD_QA_PORT overrides 31127 (the mock
# server self-test uses 31199). Exit 3 = hooks/notify.next.js not written yet.
if [ "${CLAWD_QA_PORT:-31127}" = "31126" ]; then echo "replay.sh: 31126 is the live pet. Refusing." >&2; exit 2; fi
exec node "$(dirname "${BASH_SOURCE[0]}")/replay.js" "$@"

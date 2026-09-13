#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ctwa-probe.sh — does Meta accept a CTWA conversion from a WABA that never
# hosted the conversation?
#
# Four probes, each isolating one variable. Run AFTER phases 1 and 2 are
# deployed and whatsapp_ad_clicks holds at least one real row.
#
#   PROBE 1  real clid + owned WABA      <- the actual question
#   PROBE 2  real clid, NO WABA          <- is the WABA field enforced?
#   PROBE 3  FAKE clid + owned WABA      <- does Meta validate the click id?
#   PROBE 4  real clid, phone_call       <- does ctwa_clid survive outside
#                                           business_messaging?
#
# PROBE 3 is the control that gives the others meaning: if a fabricated click id
# is accepted just as happily as a real one, then "accepted" proves nothing
# about attribution and only the live check (step B in the guide) can answer it.
#
# Nothing here writes to your database or sends a WhatsApp message. Every probe
# carries test_event_code, so none of it reaches ad delivery.
#
# Usage:
#   export META_CAPI_ACCESS_TOKEN=...          # never printed by this script
#   export META_CAPI_TEST_EVENT_CODE=TEST12345 # Events Manager -> Test events
#   export REAL_CTWA_CLID=...                  # from whatsapp_ad_clicks
#   ./ctwa-probe.sh
# ---------------------------------------------------------------------------
set -uo pipefail

PIXEL_ID="${PIXEL_ID:-1552172379764679}"
WABA_ID="${WABA_ID:-3779763578827421}"
GRAPH_VERSION="${GRAPH_VERSION:-v23.0}"
CURRENCY="${CURRENCY:-MRU}"

: "${META_CAPI_ACCESS_TOKEN:?set META_CAPI_ACCESS_TOKEN}"
: "${META_CAPI_TEST_EVENT_CODE:?set META_CAPI_TEST_EVENT_CODE}"
: "${REAL_CTWA_CLID:?set REAL_CTWA_CLID (SELECT ctwa_clid FROM whatsapp_ad_clicks ORDER BY clicked_at DESC LIMIT 1)}"

ENDPOINT="https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events"
NOW="$(date +%s)"
RUN="$(date +%H%M%S)"

probe() {
  local label="$1" payload="$2"
  printf '\n\033[1m=== %s ===\033[0m\n' "$label"
  local body
  body="$(curl -sS -X POST "${ENDPOINT}?access_token=${META_CAPI_ACCESS_TOKEN}" \
      -H 'Content-Type: application/json' -d "$payload" 2>&1)"
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$body" | python3 -c '
import json,sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print(raw[:600]); sys.exit()
if "error" in d:
    e = d["error"]
    print("  REJECTED")
    print("   code    :", e.get("code"), "/", e.get("error_subcode"))
    print("   message :", e.get("message"))
    print("   user_msg:", e.get("error_user_msg") or "-")
else:
    print("  events_received :", d.get("events_received"))
    msgs = d.get("messages") or []
    print("  messages        :", json.dumps(msgs, ensure_ascii=False) if msgs else "[] (no warnings)")
    print("  fbtrace_id      :", d.get("fbtrace_id"))
'
  else
    printf '%s\n' "$body"
  fi
}

# --- PROBE 1 — the actual question -----------------------------------------
probe "PROBE 1  business_messaging + real clid + owned WABA" "$(cat <<JSON
{
  "test_event_code": "${META_CAPI_TEST_EVENT_CODE}",
  "data": [{
    "event_name": "Purchase",
    "event_time": ${NOW},
    "event_id": "ctwa_probe1_${RUN}",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": {
      "ctwa_clid": "${REAL_CTWA_CLID}",
      "whatsapp_business_account_id": "${WABA_ID}"
    },
    "custom_data": { "currency": "${CURRENCY}", "value": 1 }
  }]
}
JSON
)"

# --- PROBE 2 — is whatsapp_business_account_id actually enforced? -----------
probe "PROBE 2  business_messaging + real clid, NO WABA" "$(cat <<JSON
{
  "test_event_code": "${META_CAPI_TEST_EVENT_CODE}",
  "data": [{
    "event_name": "Purchase",
    "event_time": ${NOW},
    "event_id": "ctwa_probe2_${RUN}",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": { "ctwa_clid": "${REAL_CTWA_CLID}" },
    "custom_data": { "currency": "${CURRENCY}", "value": 1 }
  }]
}
JSON
)"

# --- PROBE 3 — the control: is the click id validated at all? ---------------
probe "PROBE 3  business_messaging + FAKE clid + owned WABA" "$(cat <<JSON
{
  "test_event_code": "${META_CAPI_TEST_EVENT_CODE}",
  "data": [{
    "event_name": "Purchase",
    "event_time": ${NOW},
    "event_id": "ctwa_probe3_${RUN}",
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": {
      "ctwa_clid": "AfNOTAREALCLICKID_${RUN}",
      "whatsapp_business_account_id": "${WABA_ID}"
    },
    "custom_data": { "currency": "${CURRENCY}", "value": 1 }
  }]
}
JSON
)"

# --- PROBE 4 — does ctwa_clid survive outside business_messaging? -----------
probe "PROBE 4  phone_call + real clid (current fallback shape)" "$(cat <<JSON
{
  "test_event_code": "${META_CAPI_TEST_EVENT_CODE}",
  "data": [{
    "event_name": "Purchase",
    "event_time": ${NOW},
    "event_id": "ctwa_probe4_${RUN}",
    "action_source": "phone_call",
    "user_data": { "ctwa_clid": "${REAL_CTWA_CLID}" },
    "custom_data": { "currency": "${CURRENCY}", "value": 1 }
  }]
}
JSON
)"

cat <<'EOF'

---------------------------------------------------------------------------
Now open Events Manager -> Test events and look at the four rows.
"events_received: 1" only means the payload parsed. What matters is whether
Meta attaches a warning to ctwa_clid or whatsapp_business_account_id, and how
PROBE 3 (the fake click id) compares to PROBE 1.

Read the decision table in the test guide before concluding anything.
---------------------------------------------------------------------------
EOF

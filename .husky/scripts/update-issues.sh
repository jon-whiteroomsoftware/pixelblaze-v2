#!/usr/bin/env bash
set -euo pipefail

COMMIT_MSG=$(git log -1 --pretty=%B)
COMMIT_SHA=$(git log -1 --pretty=%H | cut -c1-8)
COMMIT_DIFF=$(git show HEAD --stat | tail -n +2 | head -30)

# Extract unique issue numbers from the commit message
ISSUE_NUMS=$(echo "$COMMIT_MSG" | grep -oE '#[0-9]+' | tr -d '#' | sort -un || true)

if [ -z "$ISSUE_NUMS" ]; then
  exit 0
fi

for ISSUE_NUM in $ISSUE_NUMS; do
  echo "🔍 Checking issue #$ISSUE_NUM..."

  ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json title,body,state 2>/dev/null || true)
  if [ -z "$ISSUE_JSON" ]; then
    echo "   ⚠️  Could not fetch issue #$ISSUE_NUM — skipping"
    continue
  fi

  ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
  if [ "$ISSUE_STATE" = "CLOSED" ]; then
    echo "   Already closed — skipping"
    continue
  fi

  ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body // ""' | head -30)

  PROMPT="You manage GitHub issues for a software project. Decide what action to take on an issue given the commit below.

COMMIT MESSAGE:
$COMMIT_MSG

FILES CHANGED:
$COMMIT_DIFF

ISSUE #$ISSUE_NUM: $ISSUE_TITLE
$ISSUE_BODY

Respond with JSON only (no markdown fences):
- {\"action\":\"close\",\"message\":\"<closing comment>\"} if the commit fully resolves this issue
- {\"action\":\"comment\",\"message\":\"<progress comment>\"} if the commit partially addresses it
- {\"action\":\"nothing\"} if the commit only references the issue for context or is unrelated"

  TEXT=$(claude -p "$PROMPT" --model claude-haiku-4-5-20251001 2>/dev/null || true)

  if [ -z "$TEXT" ]; then
    echo "   ⚠️  Claude call failed — skipping issue #$ISSUE_NUM"
    continue
  fi

  # Strip any markdown fences and trim surrounding whitespace. Avoid `xargs`:
  # it parses shell-style quoting and chokes ("unterminated quote") on any
  # apostrophe in Claude's text (e.g. "Pixelblaze's"). jq tolerates leftover
  # whitespace, so a plain sed trim is enough.
  TEXT=$(printf '%s' "$TEXT" \
    | sed -e 's/^```json//' -e 's/^```//' -e 's/```$//' \
          -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  # Slurp the stream and take only the first JSON value (-s '.[0]'). The model
  # sometimes emits more than one object (e.g. an example alongside its answer);
  # a bare `jq -r '.action'` would then print one line per object and ACTION
  # would become e.g. "nothing\nnothing", falling through to the error branch.
  ACTION=$(echo "$TEXT" | jq -rs '(.[0].action) // "nothing"' 2>/dev/null || echo "nothing")
  MESSAGE=$(echo "$TEXT" | jq -rs '(.[0].message) // ""' 2>/dev/null || echo "")

  case "$ACTION" in
    close)
      echo "   ✅ Closing issue #$ISSUE_NUM"
      gh issue close "$ISSUE_NUM" --comment "${MESSAGE:-Resolved in commit $COMMIT_SHA}"
      ;;
    comment)
      echo "   💬 Adding comment to issue #$ISSUE_NUM"
      gh issue comment "$ISSUE_NUM" --body "${MESSAGE:-Addressed in commit $COMMIT_SHA}"
      ;;
    nothing)
      echo "   — No action needed for issue #$ISSUE_NUM"
      ;;
    *)
      echo "   ⚠️  Unexpected action '$ACTION' — skipping"
      ;;
  esac
done

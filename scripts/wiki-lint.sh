#!/usr/bin/env bash
# wiki-lint.sh — Verify wiki page count matches index.md entries.
# Exits 0 if clean, 1 if mismatches found.
# Run as: bash scripts/wiki-lint.sh [wiki_dir]

set -euo pipefail

WIKI_DIR="${1:-$(dirname "$0")/../wiki}"
WIKI_DIR="$(cd "$WIKI_DIR" && pwd)"
INDEX="$WIKI_DIR/index.md"

if [[ ! -f "$INDEX" ]]; then
  echo "ERROR: index.md not found at $INDEX" >&2
  exit 1
fi

# Count .md files in wiki/ (excluding index.md and log.md — these are navigation, not pages)
actual_pages=$(find "$WIKI_DIR" -name "*.md" \
  ! -name "index.md" ! -name "log.md" ! -name "CLAUDE.md" ! -name "Soul.md" \
  | wc -l | tr -d ' ')

# Count wikilink entries in index.md, excluding navigation files (log, index, CLAUDE, Soul)
indexed_pages=$(grep -oP '(?<=\[\[)[^\]]+(?=\]\])' "$INDEX" | grep -vcP '^(log|index|CLAUDE|Soul)$' || true)

# Extract claimed total from index.md header (e.g. "> Total pages: 53")
claimed=$(grep -oP '(?<=Total pages: )\d+' "$INDEX" || echo "unknown")

echo "Wiki lint report"
echo "  Directory:    $WIKI_DIR"
echo "  .md files:    $actual_pages  (excluding index/log/CLAUDE/Soul)"
echo "  Index entries: $indexed_pages wikilinks"
echo "  Claimed total: $claimed"
echo ""

errors=0

if [[ "$actual_pages" -ne "$indexed_pages" ]]; then
  echo "MISMATCH: $actual_pages files vs $indexed_pages index entries"
  errors=$((errors + 1))
else
  echo "OK: file count matches index entries ($actual_pages)"
fi

if [[ "$claimed" != "unknown" && "$claimed" -ne "$actual_pages" ]]; then
  echo "MISMATCH: index.md claims $claimed pages but $actual_pages files exist"
  errors=$((errors + 1))
else
  [[ "$claimed" != "unknown" ]] && echo "OK: claimed total matches actual ($claimed)"
fi

# Check for orphan wikilinks (links in index.md pointing to non-existent files)
# Excludes navigation files that are intentionally omitted from the page count
EXCLUDED_LINKS="log|index|CLAUDE|Soul"
orphans=0
while IFS= read -r link; do
  # Skip links to intentionally excluded navigation files
  if echo "$link" | grep -qP "^($EXCLUDED_LINKS)$"; then
    continue
  fi
  # Normalize: concept-foo → concepts/concept-foo.md, etc.
  for subdir in segments concepts tools entities decisions; do
    candidate="$WIKI_DIR/$subdir/$link.md"
    if [[ -f "$candidate" ]]; then
      break
    fi
    candidate=""
  done
  if [[ -z "${candidate:-}" ]]; then
    echo "ORPHAN: [[$link]] in index.md has no matching file"
    orphans=$((orphans + 1))
    errors=$((errors + 1))
  fi
done < <(grep -oP '(?<=\[\[)[^\]]+(?=\]\])' "$INDEX" || true)

if [[ "$orphans" -eq 0 ]]; then
  echo "OK: no orphan wikilinks in index.md"
fi

echo ""
if [[ "$errors" -eq 0 ]]; then
  echo "PASS — wiki is consistent"
  exit 0
else
  echo "FAIL — $errors issue(s) found"
  exit 1
fi

#!/usr/bin/env bash
# Fails if any forbidden token leaks into the docs source.
#
# This is the public docs site. Anything that hints at private
# infrastructure must not appear here.

set -euo pipefail

cd "$(dirname "$0")/.."

# Patterns that should never appear in committed docs source.
# Add to this list when you discover new ones.
FORBIDDEN=(
  'drawtonomy-app'
  '\.superset/worktrees'
  '\.claude/projects'
  'kosuke55/\.claude'
)

SCAN_GLOBS=(
  'src/content/docs'
  'src/components'
  'src/pages'
  'astro.config.mjs'
  'README.md'
)

EXIT=0

for pat in "${FORBIDDEN[@]}"; do
  if grep -rEn --color=never "$pat" "${SCAN_GLOBS[@]}" 2>/dev/null; then
    echo
    echo "  ✘ forbidden pattern '$pat' appears above" >&2
    EXIT=1
  fi
done

if [ "$EXIT" -ne 0 ]; then
  echo
  echo "Private references must not be committed to docs-site/." >&2
  exit 1
fi

echo "  ✓ no forbidden patterns in docs source"

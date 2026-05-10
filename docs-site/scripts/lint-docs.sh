#!/usr/bin/env bash
# Lints docs-site/ source for tokens that shouldn't be committed —
# absolute filesystem paths from a contributor's local machine.

set -euo pipefail

cd "$(dirname "$0")/.."

# Patterns that look like local-machine absolute paths.
# Add or adjust as needed; keep entries generic.
FORBIDDEN=(
  '/Users/[A-Za-z0-9_.-]+/'   # macOS home directory paths
  '/home/[A-Za-z0-9_.-]+/'    # Linux home directory paths
  'C:\\\\Users\\\\'             # Windows home directory paths
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
    echo "  ✘ pattern '$pat' appears above" >&2
    EXIT=1
  fi
done

if [ "$EXIT" -ne 0 ]; then
  echo
  echo "Local absolute paths must not be committed to docs-site/." >&2
  exit 1
fi

echo "  ✓ no forbidden patterns in docs source"

#!/usr/bin/env bash
# ============================================================
# MADGOD — sync to GitHub
# usage:
#   bash sync.sh                     # auto message
#   bash sync.sh "feat: my message"  # custom message
#   bash sync.sh --tag v0.2.0        # commit + tag → triggers release build
# ============================================================

set -euo pipefail
cd "$(dirname "$0")"

WHT='\033[1;37m'; GRN='\033[0;32m'; YLW='\033[1;33m'
RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

log()  { echo -e "${WHT}[sync]${NC} $1"; }
ok()   { echo -e "${GRN}[  ok ]${NC} $1"; }
warn() { echo -e "${YLW}[ warn]${NC} $1"; }
die()  { echo -e "${RED}[ fail]${NC} $1"; exit 1; }

# ── parse args ─────────────────────────────────────────────
TAG=""
MSG=""
for i in "$@"; do
  if [[ "$i" == "--tag" ]]; then
    shift; TAG="${1:-}"; shift
  else
    MSG="$i"
  fi
done

# ── check remote ──────────────────────────────────────────
if ! git remote get-url origin &>/dev/null; then
  die "no git remote 'origin' configured\n  run: git remote add origin https://github.com/numbpill3d/madgod-integrated-worktrance.git"
fi
REMOTE="$(git remote get-url origin)"
log "remote: $REMOTE"

# ── show current status ───────────────────────────────────
echo ""
log "current status:"
git status --short | sed 's/^/         /' || true
echo ""

# ── stage everything (respects .gitignore) ───────────────
git add -A

# ── check if there's anything to commit ───────────────────
if git diff --cached --quiet; then
  warn "nothing staged to commit"
  COMMITTED=0
else
  # build commit message
  if [[ -z "$MSG" ]]; then
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
    CHANGES="$(git diff --cached --name-only | wc -l | tr -d ' ')"
    MSG="sync: ${CHANGES} file(s) on ${BRANCH} — $(date '+%Y-%m-%d %H:%M')"
  fi

  git commit -m "$MSG"
  ok "committed: $MSG"
  COMMITTED=1
fi

# ── optional tag (triggers GitHub Actions release build) ──
if [[ -n "$TAG" ]]; then
  if git tag "$TAG" 2>/dev/null; then
    ok "tagged: $TAG  (will trigger GitHub Actions release build)"
  else
    warn "tag $TAG already exists — skipping"
  fi
fi

# ── push ──────────────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
log "pushing → origin/$BRANCH..."

if [[ -n "$TAG" ]]; then
  git push origin "$BRANCH" --follow-tags
else
  git push origin "$BRANCH"
fi

ok "pushed to $REMOTE"

echo ""
echo -e "  ${DIM}view on GitHub:${NC}"
echo -e "  ${WHT}${REMOTE/\.git/}${NC}"
if [[ -n "$TAG" ]]; then
  echo ""
  echo -e "  ${DIM}release build started — check Actions tab:${NC}"
  echo -e "  ${WHT}${REMOTE/\.git/}/actions${NC}"
fi
echo ""

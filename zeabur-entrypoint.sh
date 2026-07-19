#!/bin/sh
set -eu

mkdir -p "$HOME" "$CYBERBOSS_STATE_DIR" "$CYBERBOSS_WORKSPACE_ROOT"

if [ "${CYBERBOSS_AUTOSTART:-false}" = "true" ]; then
  npm run shared:start
fi

echo "Cyberboss is in setup mode. In the Zeabur Web Terminal run:"
echo "  claude"
echo "  npm run login"
echo "Then set CYBERBOSS_AUTOSTART=true and redeploy."

exec tail -f /dev/null

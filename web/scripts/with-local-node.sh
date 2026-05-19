#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
LOCAL_NODE_BIN="$PROJECT_DIR/.tools/node/current/bin"

if [ -d "$LOCAL_NODE_BIN" ]; then
  PATH="$LOCAL_NODE_BIN:$PATH"
  export PATH
fi

exec "$@"

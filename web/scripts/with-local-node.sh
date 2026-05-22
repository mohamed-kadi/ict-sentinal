#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
PINNED_NODE_VERSION=""

if [ -f "$PROJECT_DIR/.node-version" ]; then
  PINNED_NODE_VERSION=$(tr -d '[:space:]' < "$PROJECT_DIR/.node-version")
elif [ -f "$PROJECT_DIR/.nvmrc" ]; then
  PINNED_NODE_VERSION=$(tr -d '[:space:]' < "$PROJECT_DIR/.nvmrc")
fi

prepend_node_bin() {
  if [ -d "$1" ]; then
    PATH="$1:$PATH"
    export PATH
    return 0
  fi
  return 1
}

if [ -n "$PINNED_NODE_VERSION" ]; then
  for CANDIDATE in \
    "$PROJECT_DIR/.tools/node/node-v$PINNED_NODE_VERSION"-*/bin \
    "$HOME/.nvm/versions/node/v$PINNED_NODE_VERSION/bin"
  do
    if prepend_node_bin "$CANDIDATE"; then
      exec "$@"
    fi
  done
fi

LOCAL_NODE_BIN="$PROJECT_DIR/.tools/node/current/bin"
if prepend_node_bin "$LOCAL_NODE_BIN"; then
  exec "$@"
fi

exec "$@"

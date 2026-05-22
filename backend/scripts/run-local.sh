#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: ./scripts/run-local.sh [--replace]" >&2
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$(cd "${script_dir}/.." && pwd)"
port="${PORT:-8080}"
db_file="${backend_dir}/data/ictcrakr.mv.db"
replace=false

if [[ "${1:-}" == "--replace" ]]; then
  replace=true
  shift
fi

if [[ $# -gt 0 ]]; then
  usage
  exit 2
fi

collect_pids() {
  {
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
    if [[ -f "${db_file}" ]]; then
      lsof -t "${db_file}" 2>/dev/null || true
    fi
  } | awk 'NF' | sort -u
}

blocking_pids="$(collect_pids)"

if [[ -n "${blocking_pids}" ]]; then
  if [[ "${replace}" == true ]]; then
    echo "Stopping stale backend process(es): ${blocking_pids}"
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] || continue
      kill "${pid}" 2>/dev/null || true
    done <<< "${blocking_pids}"

    for _ in {1..20}; do
      if [[ -z "$(collect_pids)" ]]; then
        break
      fi
      sleep 0.25
    done

    remaining_pids="$(collect_pids)"
    if [[ -n "${remaining_pids}" ]]; then
      echo "Port ${port} or ${db_file} is still in use by: ${remaining_pids}" >&2
      echo "Stop those processes manually, then rerun the command." >&2
      exit 1
    fi
  else
    echo "Backend startup is blocked by existing process(es): ${blocking_pids}" >&2
    echo "Port ${port} or ${db_file} is already in use." >&2
    echo "If this is a stale backend, rerun with ./scripts/run-local.sh --replace" >&2
    exit 1
  fi
fi

export ICTCRAKR_FRONTEND_ORIGIN="${ICTCRAKR_FRONTEND_ORIGIN:-http://localhost:3000}"

cd "${backend_dir}"
exec mvn spring-boot:run

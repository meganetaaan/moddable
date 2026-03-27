#!/bin/bash
set -eu

export DISPLAY="${DISPLAY:-:0}"
export XSBUG_HOST="${XSBUG_HOST:-127.0.0.1}"
export XSBUG_PORT="${XSBUG_PORT:-5002}"

exec /home/sskw/.local/share/moddable/build/bin/lin/release/mcsim \
	/home/sskw/.local/share/moddable/build/bin/lin/mc/debug/lin/mc.so

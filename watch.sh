#!/usr/bin/env bash
# watch.sh -- rerun a command when files change
# usage: ./watch.sh [-w dir] [-e js,ts] [-i pattern] [-d secs] [-c] [-v] -- cmd

set -u

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
DIM=$'\033[0;90m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

info()  { printf "%s*%s %s\n" "$CYAN"   "$RESET" "$*"; }
ok()    { printf "%s+%s %s\n" "$GREEN"  "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()   { printf "%sx%s %s\n" "$RED"    "$RESET" "$*" >&2; }
debug() { $verbose && printf "%s~%s %s\n" "$DIM" "$RESET" "$*" || true; }

watch_dirs=(".")
extensions="js,mjs,cjs,json,ts"
ignores=("node_modules" ".git" "dist" "build" ".cache" "*.log")
delay=1
signal=SIGTERM
kill_timeout=3
verbose=false
clear_screen=false
cmd=()

usage() {
  printf "usage: watch.sh [opts] -- <cmd>\n\n"
  printf "  %-20s %s\n" "-w dir"      "directory to watch (default: .)"
  printf "  %-20s %s\n" "-e js,ts"    "extensions (default: js,mjs,cjs,json,ts)"
  printf "  %-20s %s\n" "-i pattern"  "ignore pattern"
  printf "  %-20s %s\n" "-d secs"     "restart delay (default: 1)"
  printf "  %-20s %s\n" "-s signal"   "kill signal (default: SIGTERM)"
  printf "  %-20s %s\n" "-k secs"     "sigkill timeout (default: 3)"
  printf "  %-20s %s\n" "-c"          "clear screen on restart"
  printf "  %-20s %s\n" "-v"          "verbose"
  exit 0
}

custom_dirs=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -w) custom_dirs=true; watch_dirs+=("$2"); shift 2 ;;
    -e) extensions="$2";  shift 2 ;;
    -i) ignores+=("$2");  shift 2 ;;
    -d) delay="$2";       shift 2 ;;
    -s) signal="$2";      shift 2 ;;
    -k) kill_timeout="$2";shift 2 ;;
    -c) clear_screen=true; shift ;;
    -v) verbose=true;     shift ;;
    -h|--help) usage ;;
    --) shift; cmd=("$@"); break ;;
    *)  err "unknown option: $1"; exit 1 ;;
  esac
done

$custom_dirs && watch_dirs=("${watch_dirs[@]:1}")
[[ ${#cmd[@]} -eq 0 ]] && err "no command given" && exit 1

if command -v inotifywait &>/dev/null; then
  backend=inotifywait
elif command -v fswatch &>/dev/null; then
  backend=fswatch
else
  backend=poll
fi

pid=0

stop_proc() {
  [[ $pid -eq 0 ]] && return
  kill -0 "$pid" 2>/dev/null || { pid=0; return; }
  debug "stopping $pid"
  kill -"$signal" "$pid" 2>/dev/null || true
  local i=0
  while kill -0 "$pid" 2>/dev/null && [[ $i -lt $((kill_timeout * 2)) ]]; do
    sleep 0.5; (( i++ ))
  done
  kill -0 "$pid" 2>/dev/null && kill -SIGKILL "$pid" 2>/dev/null || true
  pid=0
}

start_proc() {
  $clear_screen && clear
  ok "running: ${BOLD}${cmd[*]}${RESET}"
  "${cmd[@]}" &
  pid=$!
}

restart_proc() {
  info "changed: ${DIM}$1${RESET}"
  stop_proc
  sleep "$delay"
  start_proc
}

ignored() {
  for p in "${ignores[@]}"; do
    [[ "$1" == *"$p"* ]] && return 0
  done
  return 1
}

matches_ext() {
  local IFS=','
  for e in $extensions; do
    [[ "$1" == *".${e#.}" ]] && return 0
  done
  return 1
}

cleanup() {
  echo
  warn "shutting down"
  stop_proc
  exit 0
}
trap cleanup INT TERM

printf "%swatch%s %s(%s)%s\n\n" "$BOLD$CYAN" "$RESET" "$DIM" "$backend" "$RESET"

case "$backend" in
  inotifywait)
    info "watching ${watch_dirs[*]} for {${extensions}}"
    start_proc
    while true; do
      read -r f < <(
        inotifywait -q -r -e close_write,create,delete,moved_to \
          --format '%w%f' "${watch_dirs[@]}" 2>/dev/null
      )
      ignored "$f" && continue
      matches_ext "$f" || continue
      restart_proc "$f"
    done
    ;;

  fswatch)
    info "watching ${watch_dirs[*]} for {${extensions}}"
    start_proc
    while true; do
      read -r f < <(fswatch -r -1 "${watch_dirs[@]}" 2>/dev/null)
      ignored "$f" && continue
      matches_ext "$f" || continue
      restart_proc "$f"
    done
    ;;

  poll)
    warn "no inotifywait or fswatch found, falling back to polling"
    info "watching ${watch_dirs[*]} for {${extensions}}"
    declare -A mtimes
    while IFS= read -r -d '' f; do
      ignored "$f" || matches_ext "$f" || continue
      mtimes["$f"]=$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null || echo 0)
    done < <(find "${watch_dirs[@]}" -type f -print0 2>/dev/null)
    start_proc
    while true; do
      sleep 1
      hit=""
      while IFS= read -r -d '' f; do
        ignored "$f" && continue
        matches_ext "$f" || continue
        mt=$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null || echo 0)
        prev="${mtimes[$f]:-}"
        if [[ -z "$prev" || "$mt" != "$prev" ]]; then
          hit="$f"
          mtimes["$f"]="$mt"
        fi
      done < <(find "${watch_dirs[@]}" -type f -print0 2>/dev/null)
      [[ -n "$hit" ]] && restart_proc "$hit"
      [[ $pid -ne 0 ]] && ! kill -0 "$pid" 2>/dev/null && warn "process died" && start_proc
    done
    ;;
esac

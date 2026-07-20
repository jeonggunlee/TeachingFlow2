#!/usr/bin/env bash
# 서비스 정의 및 공용 헬퍼 — start.sh / stop.sh / status.sh 가 source 한다.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/logs"
RUN_DIR="$ROOT/run"

# "디렉터리:포트" — 의존 순서대로 (portal이 나머지를 프로브하므로 마지막)
SERVICES=(
  "createLecture:8000"
  "playLecture:8001"
  "analyzeLecture:8002"
  "portal:8003"
)

svc_name() { echo "${1%%:*}"; }
svc_port() { echo "${1##*:}"; }

pid_file() { echo "$RUN_DIR/$1.pid"; }
log_file() { echo "$LOG_DIR/$1.log"; }

# 해당 서비스의 PID가 살아있으면 출력하고 0을 반환
running_pid() {
  local name="$1" pf pid
  pf="$(pid_file "$name")"
  [ -f "$pf" ] || return 1
  pid="$(cat "$pf" 2>/dev/null)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

# 포트를 점유한 PID 목록 (stop 시 고아 프로세스 정리용)
port_pids() {
  local port="$1"
  # ss 우선, 없으면 lsof
  if command -v ss >/dev/null 2>&1; then
    ss -tlnpH "sport = :$port" 2>/dev/null |
      grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

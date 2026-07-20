#!/usr/bin/env bash
# 4개 서브시스템 종료
#   ./scripts/stop.sh              전체 종료
#   ./scripts/stop.sh portal       특정 서비스만
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

TARGETS=("$@")

# SIGTERM 후 최대 10초 대기, 그래도 남으면 SIGKILL
kill_pid() {
  local pid="$1" label="$2"
  kill "$pid" 2>/dev/null || return 0
  for _ in $(seq 20); do
    kill -0 "$pid" 2>/dev/null || { echo "  - $label 종료 (pid $pid)"; return 0; }
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null
  echo "  - $label 강제 종료 (pid $pid)"
}

for svc in "${SERVICES[@]}"; do
  name="$(svc_name "$svc")"
  port="$(svc_port "$svc")"

  if [ ${#TARGETS[@]} -gt 0 ]; then
    printf '%s\n' "${TARGETS[@]}" | grep -qx "$name" || continue
  fi

  stopped=0
  if pid="$(running_pid "$name")"; then
    kill_pid "$pid" "$name"
    stopped=1
  fi
  rm -f "$(pid_file "$name")"

  # PID 파일이 없거나 어긋난 경우(직접 띄운 프로세스 등) 포트 기준으로 정리
  for orphan in $(port_pids "$port"); do
    kill_pid "$orphan" "$name(:$port 점유 프로세스)"
    stopped=1
  done

  [ "$stopped" -eq 0 ] && echo "  = $name  실행 중 아님"
done

echo
remaining=""
for svc in "${SERVICES[@]}"; do
  port="$(svc_port "$svc")"
  [ -n "$(port_pids "$port")" ] && remaining="$remaining $port"
done

if [ -z "$remaining" ]; then
  echo "모든 포트 해제 완료 (8000-8003)"
else
  echo "아직 점유 중인 포트:$remaining"
  exit 1
fi

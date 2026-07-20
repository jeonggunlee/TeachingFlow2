#!/usr/bin/env bash
# 4개 서브시스템 상태 확인
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

printf '%-16s %-6s %-8s %-6s %s\n' SERVICE PORT PID HTTP URL
for svc in "${SERVICES[@]}"; do
  name="$(svc_name "$svc")"
  port="$(svc_port "$svc")"

  pid="$(running_pid "$name")" || pid="$(port_pids "$port" | head -1)"
  [ -n "$pid" ] || pid="-"

  if [ "$pid" != "-" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$port/" 2>/dev/null)"
  else
    code="-"
  fi

  printf '%-16s %-6s %-8s %-6s http://localhost:%s\n' "$name" "$port" "$pid" "$code" "$port"
done

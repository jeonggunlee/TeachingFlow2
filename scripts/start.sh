#!/usr/bin/env bash
# 4개 서브시스템 기동
#   ./scripts/start.sh              전체 기동
#   ./scripts/start.sh portal       특정 서비스만
#   ./scripts/start.sh --reload     코드 변경 자동 반영 (개발용)
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

RELOAD=""
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    --reload) RELOAD="--reload" ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) TARGETS+=("$arg") ;;
  esac
done

mkdir -p "$LOG_DIR" "$RUN_DIR"

fail=0
for svc in "${SERVICES[@]}"; do
  name="$(svc_name "$svc")"
  port="$(svc_port "$svc")"

  # 특정 서비스만 지정한 경우 필터링
  if [ ${#TARGETS[@]} -gt 0 ]; then
    printf '%s\n' "${TARGETS[@]}" | grep -qx "$name" || continue
  fi

  if pid="$(running_pid "$name")"; then
    echo "  = $name  이미 실행 중 (pid $pid, :$port)"
    continue
  fi

  if [ -n "$(port_pids "$port")" ]; then
    echo "  ! $name  포트 $port 를 다른 프로세스가 점유 중 — 건너뜀"
    fail=1
    continue
  fi

  uvicorn="$ROOT/$name/.venv/bin/uvicorn"
  if [ ! -x "$uvicorn" ]; then
    echo "  ! $name  .venv 없음 ($uvicorn) — README의 설치 절차 참고"
    fail=1
    continue
  fi
  if [ ! -f "$ROOT/$name/.env" ]; then
    echo "  ! $name  .env 없음 — cp $name/.env.example $name/.env 후 값 입력 필요"
    fail=1
    continue
  fi

  (
    cd "$ROOT/$name" || exit 1
    nohup "$uvicorn" app.main:app --host 0.0.0.0 --port "$port" $RELOAD \
      >> "$(log_file "$name")" 2>&1 &
    echo $! > "$(pid_file "$name")"
  )
  echo "  + $name  기동 (pid $(cat "$(pid_file "$name")"), :$port)"
done

# 헬스 체크 — 기동한 서비스가 실제로 응답하는지 확인
echo
for svc in "${SERVICES[@]}"; do
  name="$(svc_name "$svc")"
  port="$(svc_port "$svc")"
  running_pid "$name" >/dev/null || continue

  code="$(curl -s -o /dev/null -w '%{http_code}' \
    --retry 20 --retry-delay 1 --retry-connrefused --max-time 30 \
    "http://localhost:$port/" 2>/dev/null)"
  if [ "${code:0:1}" = "2" ] || [ "${code:0:1}" = "3" ]; then
    printf '  \033[32m✓\033[0m %-15s http://localhost:%s  (HTTP %s)\n' "$name" "$port" "$code"
  else
    printf '  \033[31m✗\033[0m %-15s :%s 응답 없음 — %s 확인\n' "$name" "$port" "$(log_file "$name")"
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "포털에서 시작: http://localhost:8003"
else
  echo "일부 서비스에 문제가 있습니다. 위 메시지와 $LOG_DIR/*.log 를 확인하세요."
fi
exit "$fail"

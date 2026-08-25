"""CQI 지시문 누적 원장(ledger).

강의가 v1 → v2 → v3 로 진화하는 동안 CQI 지시문이 **누적**되도록 관리한다.
원장은 강의 디렉터리의 `cqi_ledger.json`에 저장되고, 새 버전을 만들 때
부모에서 자식으로 그대로 승계된다(같은 lineage 안에서 계속 쌓임).

정책:
- analyzeLecture 보고서에서 들어온 항목은 `pending` 상태 — **교수자 승인 후에만** 반영
- 승인된 항목만 `approved`, 반영 프롬프트에 포함
- 새 지시가 기존 지시와 충돌하면 **최신이 우선**하고, 기존 항목은 `superseded`로 표시
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

LEDGER_FILE = "cqi_ledger.json"

STATUS_PENDING    = "pending"
STATUS_APPROVED   = "approved"
STATUS_DISCARDED  = "discarded"
STATUS_SUPERSEDED = "superseded"


def _path(lecture_dir: Path) -> Path:
    return Path(lecture_dir) / LEDGER_FILE


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def empty(lineage_id: str = "") -> dict:
    return {"lineage_id": lineage_id, "entries": []}


def load(lecture_dir: Path) -> dict:
    p = _path(lecture_dir)
    if not p.exists():
        return empty()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        data.setdefault("entries", [])
        data.setdefault("lineage_id", "")
        return data
    except Exception:
        return empty()


def save(lecture_dir: Path, ledger: dict) -> dict:
    _path(lecture_dir).write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    return ledger


def carry(src_dir: Path, dst_dir: Path, *, new_cycle: int) -> dict:
    """부모 버전의 원장을 자식 버전으로 승계.

    이번 진화에 반영된 approved 항목은 `applied_in_cycle`을 기록해
    "이미 반영됨"을 남기되, 계속 누적 컨텍스트로 사용한다.
    """
    ledger = load(src_dir)
    for e in ledger["entries"]:
        if e.get("status") == STATUS_APPROVED and not e.get("applied_in_cycle"):
            e["applied_in_cycle"] = new_cycle
    return save(dst_dir, ledger)


def add(
    lecture_dir: Path,
    instruction: str,
    *,
    source: str = "manual",
    report_id: str = "",
    from_lecture_id: str = "",
    slide_ref: Optional[dict] = None,
    cycle: int = 0,
    status: str = STATUS_PENDING,
) -> dict:
    """원장에 지시문 1건 추가. 기본은 pending(교수자 승인 대기)."""
    ledger = load(lecture_dir)
    entry = {
        "id":              uuid4().hex[:12],
        "created_at":      _now(),
        "cycle":           cycle,
        "status":          status,
        "source":          source,
        "report_id":       report_id,
        "from_lecture_id": from_lecture_id,
        # slide_idx는 슬라이드 추가/삭제로 밀릴 수 있으므로 제목·개념도 함께 보관해
        # 진화 후에도 지시문을 올바른 슬라이드에 다시 붙일 수 있게 한다.
        "slide_ref":       slide_ref or {},
        "instruction":     instruction.strip(),
        "superseded_by":   None,
    }
    ledger["entries"].append(entry)
    save(lecture_dir, ledger)
    return entry


def import_report(lecture_dir: Path, report: dict, *, from_lecture_id: str = "",
                  report_id: str = "", cycle: int = 0) -> list:
    """analyzeLecture CQI 보고서 → pending 지시문 목록으로 취입.

    이미 같은 report_id를 취입했으면 중복 추가하지 않는다.
    """
    ledger = load(lecture_dir)
    if report_id and any(e.get("report_id") == report_id for e in ledger["entries"]):
        return []

    added = []
    for s in report.get("slides", []):
        text = (s.get("cqi_instruction") or "").strip()
        action = s.get("recommended_action", "")
        if not text or action == "no_action" or text == "분석 데이터 없음.":
            continue
        entry = {
            "id":              uuid4().hex[:12],
            "created_at":      _now(),
            "cycle":           cycle,
            "status":          STATUS_PENDING,
            "source":          "analyze_report",
            "report_id":       report_id,
            "from_lecture_id": from_lecture_id,
            "slide_ref": {
                "idx":              s.get("slide_idx"),
                "title":            s.get("slide_title", ""),
                "concepts":         s.get("core_concepts", []),
                "confusion_score":  s.get("confusion_score"),
            },
            "recommended_action": action,
            "instruction":     text,
            "superseded_by":   None,
        }
        ledger["entries"].append(entry)
        added.append(entry)

    save(lecture_dir, ledger)
    return added


def set_status(lecture_dir: Path, entry_id: str, status: str) -> Optional[dict]:
    ledger = load(lecture_dir)
    for e in ledger["entries"]:
        if e["id"] == entry_id:
            e["status"] = status
            if status == STATUS_APPROVED:
                e["approved_at"] = _now()
            save(lecture_dir, ledger)
            return e
    return None


def update_instruction(lecture_dir: Path, entry_id: str, text: str) -> Optional[dict]:
    ledger = load(lecture_dir)
    for e in ledger["entries"]:
        if e["id"] == entry_id:
            e["instruction"] = text.strip()
            e["edited_at"] = _now()
            save(lecture_dir, ledger)
            return e
    return None


def supersede(lecture_dir: Path, old_id: str, new_id: str) -> None:
    """기존 지시를 새 지시가 대체하도록 표시 (충돌 시 최신 우선)."""
    ledger = load(lecture_dir)
    for e in ledger["entries"]:
        if e["id"] == old_id:
            e["status"] = STATUS_SUPERSEDED
            e["superseded_by"] = new_id
    save(lecture_dir, ledger)


def active(ledger: dict) -> list:
    """반영 대상 — 승인되었고 대체되지 않은 항목 (오래된 순)."""
    items = [e for e in ledger.get("entries", [])
             if e.get("status") == STATUS_APPROVED]
    return sorted(items, key=lambda e: (e.get("cycle", 0), e.get("created_at", "")))


def to_prompt(ledger: dict) -> str:
    """누적 지시문을 Claude 프롬프트 텍스트로 변환.

    시간 순으로 나열하고, **뒤에 오는 지시가 앞의 지시와 충돌하면 최신이 이긴다**는
    규칙을 명시한다.
    """
    items = active(ledger)
    if not items:
        return ""

    lines = [
        "── 누적 CQI 개선 지시 (교수자 승인 완료) ──",
        "아래는 이 강의가 여러 차례 운영·분석되며 쌓인 개선 지시입니다.",
        "**오래된 것부터 최신 순**으로 나열되어 있습니다.",
        "충돌 규칙: 앞선 지시와 뒤의 지시가 상충하면 **반드시 뒤(최신) 지시를 따르세요.**",
        "이전 사이클에서 이미 반영된 지시도 그 결과가 유지되도록 계속 지켜야 합니다.",
        "",
    ]
    for i, e in enumerate(items, 1):
        ref = e.get("slide_ref") or {}
        where = []
        if ref.get("title"):
            where.append(f"슬라이드 「{ref['title']}」")
        elif ref.get("idx") is not None:
            where.append(f"슬라이드 {int(ref['idx']) + 1}")
        if ref.get("concepts"):
            where.append("핵심개념: " + ", ".join(ref["concepts"][:4]))
        applied = e.get("applied_in_cycle")
        tag = f"[사이클 {e.get('cycle', 0)}]"
        if applied:
            tag += f"[사이클 {applied}에 반영됨]"
        head = f"{i}. {tag}"
        if where:
            head += " (" + " · ".join(where) + ")"
        lines.append(head)
        lines.append(f"   → {e['instruction']}")
    return "\n".join(lines)


def stats(ledger: dict) -> dict:
    entries = ledger.get("entries", [])
    out = {"total": len(entries), "pending": 0, "approved": 0,
           "discarded": 0, "superseded": 0}
    for e in entries:
        k = e.get("status", STATUS_PENDING)
        if k in out:
            out[k] += 1
    return out

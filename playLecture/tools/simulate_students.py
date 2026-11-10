"""가상 수강생 시뮬레이터 — 실제 수강생 API 흐름으로 학습 데이터를 만든다.

용도: 강의 운영(playLecture) 부하·기능 검증, 학습 분석(analyzeLecture) CQI 보고서용 데이터 생성.

흐름(학생마다, 동시 실행):
  가입 → 로그인 → 강의 로드 → 이어보기 조회 → 슬라이드 순회
    · 재생 이벤트(되감기·반복·일시정지·배속)   · **모든 슬라이드에 난이도 평가**
    · 질문 채팅(어려운 슬라이드일수록 자주, 학생당 최소 3개)   · 진도 저장
  → 일부 중도 이탈 → 탭 닫기(sendBeacon POST + ?token=) → 재로그인 후 이어보기 확인

사용:
  cd playLecture
  .venv/bin/python tools/simulate_students.py --course "딥러닝 기초" --week 1            # 과목·주차의 강의 전부
  .venv/bin/python tools/simulate_students.py --lecture 2026-08-28_c9df9608 --students 30
  옵션  --reset      sim_s* 계정이 남긴 수강 데이터를 먼저 지운다(다른 사용자 데이터는 보존)
        --allow-ai   ai_answer/auto_question 이 켜진 강의도 그대로 둔다(기본: 실행 중 잠시 끄고 복원 — Claude 비용 방지)

관리자 비밀번호는 playLecture/.env 의 ADMIN_PASSWORD 를 읽는다(환경변수 ADMIN_PASSWORD 우선).
"""
import argparse, base64, json, os, random, sqlite3, statistics, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAY = os.environ.get("PLAYLECTURE_URL", "http://localhost:8001")
CREATE = os.environ.get("CREATELECTURE_URL", "http://localhost:8000")

NAMES = ["김민준","이서연","박도윤","최지우","정하준","강서현","조예준","윤지민","장시우","임수아",
         "한지호","오하은","서준우","신유나","권민서","황지안","안도현","송채원","전우진","홍나윤",
         "백승우","문지유","노예린","유건우","류다은","남시윤","차은우","구하린","양서준","표지후"]

# 슬라이드 제목 키워드 → 난이도 성향 (0 쉬움 ~ 1 어려움)
HARD_HINTS = {"수학적": .85, "수식": .85, "Loss": .9, "Weight Update": .9, "Weighted Sum": .7, "Fully Connected": .7,
              "Layer": .6, "Weight": .65, "뉴런": .55, "퍼셉트론": .6, "학습의 전체 흐름": .6, "vs": .5,
              "구성 요소": .45, "구조": .5, "관계": .4, "포함": .4, "부흥": .4, "흐름": .35, "2012": .3,
              "정의": .25, "등장": .2, "역사": .15, "입문": .1, "기초": .1, "마칩니다": .05, "이해했습니다": .05}

# 주제별 질문 은행 — 실제 수강생이 쓸 법한 문장. 키워드 추출기가 집계할 핵심어를 포함한다.
QBANK = {
  "퍼셉트론": ["퍼셉트론이 XOR 문제를 못 푸는 이유가 정확히 뭔가요?", "다층 신경망에서 은닉층이 하나만 있어도 XOR이 되나요?",
            "퍼셉트론의 가중치는 처음에 어떻게 정하나요?", "단층 퍼셉트론과 다층 퍼셉트론의 차이를 그림으로 설명해 주세요.",
            "퍼셉트론 수렴 정리가 뭔지 궁금합니다."],
  "뉴런": ["인공 뉴런의 활성화 함수는 왜 꼭 필요한가요?", "생물학적 뉴런의 시냅스가 가중치에 대응된다는 게 무슨 뜻인가요?",
          "뉴런 하나가 선형 분류기라는 말이 이해가 안 됩니다.", "뉴런의 임계값과 편향은 같은 개념인가요?",
          "인공 뉴런 하나로 AND, OR 는 되는데 XOR 는 왜 안 되나요?"],
  "Weight": ["편향(bias)은 왜 필요한가요? 가중치만으로는 안 되나요?", "활성화 함수로 시그모이드 대신 ReLU를 쓰는 이유는요?",
             "가중치와 편향의 초기값은 랜덤인가요?", "활성화 함수가 없으면 어떤 문제가 생기나요?",
             "가중치가 음수가 될 수도 있나요?"],
  "Layer": ["은닉층 개수는 어떻게 정하나요?", "Fully Connected Layer의 파라미터 수는 어떻게 계산하나요?",
            "층이 깊어지면 왜 더 복잡한 패턴을 배우나요?", "입력층도 층 개수에 포함하나요?",
            "출력층의 뉴런 수는 무엇으로 정하나요?"],
  "수학": ["행렬 곱 W·x + b에서 W의 차원이 어떻게 결정되나요?", "h₂ = f(W₂h₁ + b₂)에서 f가 층마다 달라도 되나요?",
          "수식에서 전치(transpose)가 붙는 이유를 모르겠어요.", "비선형 함수가 없으면 층을 쌓아도 선형이라는 증명이 궁금합니다.",
          "가중합 수식에서 시그마 기호가 어디까지 적용되는지 헷갈려요.", "벡터 표기와 스칼라 표기가 섞여서 어렵습니다."],
  "수식": ["행렬 곱 W·x + b에서 W의 차원이 어떻게 결정되나요?", "수식에서 전치(transpose)가 붙는 이유를 모르겠어요.",
          "가중합 수식을 예시 숫자로 한 번 계산해 주실 수 있나요?", "수식의 첨자가 층 번호인지 뉴런 번호인지 헷갈립니다."],
  "Loss": ["손실 함수로 MSE와 교차 엔트로피 중 뭘 써야 하나요?", "경사 하강법에서 학습률을 너무 크게 하면 어떻게 되나요?",
           "역전파가 미분의 연쇄 법칙이라는데 직관적으로 설명해 주세요.", "손실 함수의 기울기가 0이 되면 학습이 끝나나요?",
           "가중치 업데이트 식에서 마이너스 부호가 붙는 이유가 뭔가요?"],
  "학습의 전체 흐름": ["순전파와 역전파의 차이를 다시 설명해 주세요.", "에포크와 배치는 어떻게 다른가요?",
                 "역전파에서 기울기 소실은 왜 생기나요?", "검증 데이터는 학습 흐름의 어디에서 쓰이나요?"],
  "Weighted Sum": ["가중합 다음에 활성화 함수를 적용하는 순서가 바뀌면 안 되나요?", "활성화 함수 종류별 차이를 정리해 주실 수 있나요?",
                   "결국 신경망이 가중합과 활성화 함수의 반복이라는 뜻인가요?"],
  "vs": ["머신러닝과 딥러닝의 경계가 정확히 어디인가요?", "특징 추출을 사람이 안 해도 된다는 게 딥러닝의 핵심인가요?",
         "전통적 프로그래밍으로는 왜 이미지 분류가 어려운가요?"],
  "관계": ["머신러닝이 아닌 인공지능의 예시가 있나요?", "딥러닝은 머신러닝의 부분집합인가요?"],
  "포함": ["머신러닝이 아닌 인공지능의 예시가 있나요?", "딥러닝은 머신러닝의 부분집합인가요?", "규칙 기반 시스템도 인공지능에 들어가나요?"],
  "역사": ["AI 겨울이 두 번 왔다고 하는데 원인이 뭔가요?", "힌튼 교수가 한 일이 정확히 뭔가요?", "역전파 알고리즘은 언제 처음 나왔나요?"],
  "2012": ["AlexNet이 왜 그렇게 중요한가요?", "ImageNet 대회에서 오류율이 얼마나 떨어진 건가요?", "GPU가 딥러닝에 왜 중요한가요?"],
  "구성 요소": ["데이터, 모델, 손실 함수 말고 다른 구성 요소도 있나요?", "딥러닝 응용 중 자연어 처리는 어떤 구조를 쓰나요?"],
  "정의": ["딥러닝에서 '딥'은 층이 몇 개 이상이면 딥인가요?", "표현 학습(representation learning)이 무슨 뜻인가요?"],
  "부흥": ["빅데이터와 GPU 중 뭐가 더 결정적이었나요?", "딥러닝 부흥 이전에는 어떤 방법이 주류였나요?"],
}
GENERIC = ["{t} 부분 예시를 하나 더 들어주실 수 있나요?", "{t}가 앞 슬라이드랑 어떻게 연결되는지 모르겠어요.",
           "{t} 내용이 시험에 나오나요?", "{t} 관련해서 참고할 자료가 있을까요?", "{t} 설명이 조금 빠른 것 같아요.",
           "{t}에서 핵심만 한 문장으로 정리해 주실 수 있나요?"]


def slide_hardness(title: str) -> float:
    t = title.lower(); hard = [v for k, v in HARD_HINTS.items() if k.lower() in t and v > .3]
    easy = [v for k, v in HARD_HINTS.items() if k.lower() in t and v <= .3]
    return max(hard) if hard else (min(easy) if easy else .35)


def pick_question(title: str) -> str:
    for k, qs in QBANK.items():
        if k.lower() in title.lower():
            return random.choice(qs)
    return random.choice(GENERIC).format(t=f"'{title[:18]}'")


# ── HTTP ──
class Stats:
    def __init__(self): self.lat, self.err = {}, []
STATS = Stats()


def call(method, path, body=None, token=None, basic=None, raw=None, base=None, key=None):
    url = (base or PLAY) + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None: req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    if basic: req.add_header("Authorization", "Basic " + base64.b64encode(f"admin:{basic}".encode()).decode())
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as r: code, payload = r.status, r.read()
    except urllib.error.HTTPError as e: code, payload = e.code, e.read()
    except Exception as e: code, payload = 599, repr(e).encode()
    k = key or f"{method} {path.split('?')[0].split('/')[2] if path.count('/') >= 2 else path}"
    STATS.lat.setdefault(k, []).append((time.perf_counter() - t0) * 1000)
    if code >= 400 and not (code == 409 and path.endswith("/register")):   # 재실행 시 기존 계정의 409 는 정상
        STATS.err.append((k, code, payload[:100].decode("utf-8", "replace")))
    try: return code, json.loads(payload)
    except Exception: return code, payload


# ── 학생 한 명 ──
def run_student(i, lid, slides, n_students):
    name = NAMES[i % len(NAMES)] + ("" if i < len(NAMES) else str(i // len(NAMES) + 1))
    username, pw = f"sim_s{i+1:02d}", "pass1234"
    ability = random.choice(["low", "mid", "mid", "high"])
    out = {"username": username, "display": name, "ability": ability, "ratings": 0, "questions": 0, "events": 0,
           "final_pct": 0.0, "errors": [], "resume_ok": False}
    call("POST", "/api/auth/register", {"username": username, "display_name": name, "password": pw})
    code, d = call("POST", "/api/auth/login", {"username": username, "password": pw})
    if code != 200: out["errors"].append(f"login {code}"); return out
    tok = d["token"]; n = len(slides)
    call("GET", f"/api/lectures/{lid}", token=tok); call("GET", f"/api/progress/{lid}", token=tok)

    drop_p = {"low": .35, "mid": .15, "high": .05}[ability]
    stop_at = n if random.random() > drop_p else random.randint(int(n * .4), int(n * .75))
    speed = {"low": 1.0, "mid": 1.0, "high": random.choice([1.25, 1.5])}[ability]
    if speed != 1.0:
        c, r = call("POST", "/api/playback-event", token=tok, raw=json.dumps({"lecture_id": lid, "events": [
            {"slide_idx": 0, "seg_idx": 0, "event_type": "speed_change", "position_ms": 0, "payload": {"speed": speed}}]}).encode())
        if c == 200: out["events"] += r.get("saved", 0)
    # 학생당 최소 3개 질문은 보장 — 질문이 없는 슬라이드 중 무작위로 고른다
    forced = set(random.sample(range(stop_at), k=min(3, stop_at)))

    for si in range(stop_at):
        s = slides[si]; title = str(s.get("title") or ""); h = slide_hardness(title); segs = max(1, len(s["segments"]))
        felt = h + {"low": .2, "mid": 0, "high": -.2}[ability] + random.uniform(-.15, .15)
        events = []
        if felt > .6 and random.random() < .7:
            events.append({"slide_idx": si, "seg_idx": random.randrange(segs), "event_type": "seek_back", "position_ms": random.randint(3000, 40000)})
        if felt > .75 and random.random() < .5:
            events.append({"slide_idx": si, "seg_idx": random.randrange(segs), "event_type": "replay", "position_ms": 0})
        if random.random() < .25:
            events.append({"slide_idx": si, "seg_idx": random.randrange(segs), "event_type": "pause", "position_ms": random.randint(1000, 30000)})
        if events:
            c, r = call("POST", "/api/playback-event", token=tok, raw=json.dumps({"lecture_id": lid, "events": events}).encode())
            if c == 200: out["events"] += r.get("saved", 0)
        # 난이도 평가 — 보는 슬라이드마다 반드시
        rating = 2 if felt > .62 else (1 if felt > .3 else 0)
        c, _ = call("PUT", f"/api/difficulty/{lid}/{si}", {"rating": rating}, token=tok)
        if c == 200: out["ratings"] += 1
        # 질문 — 기본 35% + 어려울수록 가산(최대 90%), 강제 슬라이드는 무조건
        p_q = min(.9, .35 + .6 * max(0.0, felt - .3))
        if si in forced or random.random() < p_q:
            c, _ = call("POST", f"/api/chat/{lid}/{si}", {"message": pick_question(title)}, token=tok)
            if c == 200: out["questions"] += 1
            call("GET", f"/api/chat/{lid}/{si}", token=tok)
        pct = round((si + 1) / n * 100, 1)
        call("PUT", f"/api/progress/{lid}", {"slide_idx": si, "seg_idx": segs - 1, "pct": pct}, token=tok)
        out["final_pct"] = pct

    last = max(stop_at - 1, 0)
    call("POST", f"/api/progress/{lid}?token={tok}", {"slide_idx": last, "seg_idx": 0, "pct": out["final_pct"]}, key="POST progress(beacon)")
    c, d2 = call("POST", "/api/auth/login", {"username": username, "password": pw})
    if c == 200:
        c, p = call("GET", f"/api/progress/{lid}", token=d2["token"])
        out["resume_ok"] = c == 200 and p.get("slide_idx") == last and abs(p.get("pct", -1) - out["final_pct"]) < .01
        call("POST", "/api/auth/logout", token=d2["token"])
    return out


# ── 보조 ──
def admin_password() -> str:
    if os.environ.get("ADMIN_PASSWORD"): return os.environ["ADMIN_PASSWORD"]
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("ADMIN_PASSWORD="): return line.split("=", 1)[1].strip()
    sys.exit("ADMIN_PASSWORD 를 찾을 수 없습니다 (playLecture/.env)")


def resolve_lectures(args) -> list:
    if args.lecture: return list(args.lecture)
    qs = urllib.parse.urlencode({"course": args.course, "week": args.week})
    c, lst = call("GET", f"/api/lectures?{qs}", base=CREATE, key="GET createLecture lectures")
    if c != 200 or not lst: sys.exit(f"createLecture 에서 강의를 찾지 못했습니다 (course={args.course}, week={args.week}): {c}")
    return [l["lecture_id"] for l in lst]


def reset_sim_data(lids: list) -> None:
    """sim_s* 계정의 수강 데이터만 지우고 키워드 집계를 다시 만든다 (다른 사용자 데이터 보존)."""
    sys.path.insert(0, str(ROOT))
    from app.utils.keywords import extract_keywords
    from app import models
    from app.config import DB_URL
    db_path = DB_URL.split("///", 1)[1]
    c = sqlite3.connect(str(ROOT / db_path) if not os.path.isabs(db_path) else db_path)
    ids = [r[0] for r in c.execute("select id from users where username like 'sim_s%'")]
    if ids:
        ph = ",".join("?" * len(ids))
        for M in (models.DifficultyRating, models.ChatMessage, models.Progress, models.PlaybackEvent, models.QuizResponse):
            c.execute(f"delete from {M.__tablename__} where user_id in ({ph})", ids)
    for lid in lids:
        c.execute("delete from slide_keywords where lecture_id=?", (lid,))
        agg = {}
        for si, msg, ts in c.execute("select slide_idx, message, created_at from chat_messages where lecture_id=? and origin='student'", (lid,)):
            for kw in extract_keywords(msg): agg[(si, kw)] = (agg.get((si, kw), (0, ts))[0] + 1, ts)
        for (si, kw), (n, ts) in agg.items():
            c.execute("insert into slide_keywords(lecture_id, slide_idx, keyword, count, updated_at) values (?,?,?,?,?)", (lid, si, kw, n, ts))
    c.commit(); c.close()
    print(f"  reset: sim 계정 {len(ids)}개의 수강 데이터 삭제, 키워드 재집계 완료")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course"); ap.add_argument("--week", default="1"); ap.add_argument("--lecture", action="append")
    ap.add_argument("--students", type=int, default=20); ap.add_argument("--seed", type=int, default=20261110)
    ap.add_argument("--reset", action="store_true"); ap.add_argument("--allow-ai", action="store_true")
    args = ap.parse_args()
    if not (args.course or args.lecture): ap.error("--course 또는 --lecture 가 필요합니다")
    random.seed(args.seed); pw = admin_password(); lids = resolve_lectures(args)
    print(f"대상 강의 {len(lids)}개: {', '.join(lids)} | 수강생 {args.students}명")
    if args.reset: reset_sim_data(lids)

    report = {}
    for lid in lids:
        c, lec = call("GET", f"/api/lectures/{lid}")
        if c != 200: print(f"  ! {lid}: playLecture 에서 못 읽음 ({c})"); continue
        slides = lec["slides"]
        # AI 옵션 보호: 켜져 있으면 실행 동안만 끈다
        c, st = call("GET", f"/api/lectures/{lid}/settings")
        restore = None
        if c == 200 and (st.get("ai_answer") or st.get("auto_question")) and not args.allow_ai:
            restore = st
            call("PUT", f"/admin/lectures/{lid}/settings", {"ai_answer": False, "auto_question": False}, basic=pw, key="PUT settings")
            print(f"  {lid}: AI 옵션 {st} → 실행 동안 OFF (Claude 비용 방지, 끝나면 복원)")
        before = call("GET", f"/admin/analytics/{lid}", basic=pw, key="GET analytics")[1]
        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=min(args.students, 40)) as ex:
            results = list(ex.map(lambda i: run_student(i, lid, slides, args.students), range(args.students)))
        wall = time.perf_counter() - t0
        after = call("GET", f"/admin/analytics/{lid}", basic=pw, key="GET analytics")[1]
        if restore: call("PUT", f"/admin/lectures/{lid}/settings", restore, basic=pw, key="PUT settings")
        tot = lambda a, f: sum(f(s) for s in a["slides"])
        rated = tot(after, lambda s: s["difficulty"]["total"]) - tot(before, lambda s: s["difficulty"]["total"])
        asked = tot(after, lambda s: len(s["questions"])) - tot(before, lambda s: len(s["questions"]))
        hard = sorted(after["slides"], key=lambda s: -(s["difficulty"]["어려움"] / s["difficulty"]["total"] if s["difficulty"]["total"] else 0))[:5]
        report[lid] = {"title": lec["title"], "slides": len(slides), "wall_s": round(wall, 1),
                       "ratings": {"sent": sum(r["ratings"] for r in results), "stored": rated},
                       "questions": {"sent": sum(r["questions"] for r in results), "stored": asked},
                       "events": sum(r["events"] for r in results),
                       "completed": sum(1 for r in results if r["final_pct"] >= 99.9),
                       "avg_pct": round(statistics.mean(r["final_pct"] for r in results), 1),
                       "resume_ok": sum(1 for r in results if r["resume_ok"]),
                       "min_questions_per_student": min(r["questions"] for r in results),
                       "slides_without_rating": [s["slide_idx"] for s in after["slides"] if s["difficulty"]["total"] == 0],
                       "student_errors": [e for r in results for e in r["errors"]],
                       "hardest": [(s["slide_idx"] + 1, s["slide_title"], s["difficulty"]) for s in hard]}
        print(f"  {lid} {lec['title']}: {wall:.1f}s, 평가 {rated}, 질문 {asked}, 완주 {report[lid]['completed']}/{args.students}")
    lat = {k: {"n": len(v), "p50": round(statistics.median(v), 1), "p95": round(sorted(v)[max(0, int(len(v) * .95) - 1)], 1), "max": round(max(v), 1)}
           for k, v in sorted(STATS.lat.items())}
    print(json.dumps({"lectures": report, "latency_ms": lat, "http_errors": len(STATS.err), "http_error_samples": STATS.err[:10]}, ensure_ascii=False, indent=1))
    sys.exit(1 if STATS.err or any(r["student_errors"] for r in report.values()) else 0)


if __name__ == "__main__":
    main()

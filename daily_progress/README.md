# daily_progress — 작업 일지

TeachingFlow(EDUTECH-3) 개발 기록을 날짜별로 남기는 정적 웹입니다.
빌드 도구 없이 브라우저로 바로 열립니다.

```
daily_progress/
├── index.html        목차 — 날짜별 일지 카드 목록
├── YYYY-MM-DD.html   날짜별 일지
├── css/log.css       공용 스타일 (목차·일지 공용, 라이트/다크 자동)
└── README.md
```

## 보기

```bash
# 파일로 바로 열기
xdg-open daily_progress/index.html

# 또는 로컬 서버로
python3 -m http.server 8080 --directory daily_progress
# → http://localhost:8080
```

## 새 일지 추가하기

1. `YYYY-MM-DD.html` 파일을 만든다 — 가장 최근 일지를 복사해 쓰는 것이 빠르다.
2. `index.html`의 `.entry-list` **맨 위**에 카드를 하나 넣는다.

```html
<a class="entry-card" href="2026-08-27.html">
  <span class="entry-date">2026-08-27 · 커밋 N건</span>
  <h2>한 줄 제목</h2>
  <p>두세 문장 요약.</p>
  <div class="tags">
    <span class="tag">키워드</span>
  </div>
</a>
```

3. `index.html` 헤더의 `.stats`(일지 건수·최근 갱신일)를 갱신한다.

## 쓸 때의 기준

- **무엇을 했는가**보다 **왜 그렇게 했는가**를 남긴다. 코드는 git이 기억하지만
  판단의 이유는 아무도 기억하지 못한다.
- 고쳤다고 쓸 때는 **고치기 전에 실제로 깨지는 모습**을 함께 남긴다
  (재현 방법, 실측 수치, 전/후 비교).
- 관련 커밋 해시를 `<span class="commit">`으로 붙여 코드로 찾아갈 수 있게 한다.

사용할 수 있는 요소:

| 클래스 | 용도 |
|---|---|
| `.callout.why` | 설계 판단의 이유 |
| `.callout.trap` | 놓치기 쉬운 함정 · 위험 |
| `.callout.result` | 검증 결과 |
| `.ba.before-after` | 전/후 2단 비교 |
| `.table-scroll > table` | 좁은 화면에서 가로 스크롤되는 표 |
| `.sev-high` / `.sev-mid` / `.sev-low` | 심각도 표시 |

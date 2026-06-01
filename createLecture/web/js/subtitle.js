/**
 * subtitle.js — 자막 동기화 모듈
 * words[] (offset_ms, duration_ms) 기반으로 현재 어절을 강조한다.
 */
const Subtitle = (() => {
  let _bar = null;
  let _words = [];   // { text, offset_ms, duration_ms }
  let _spans = [];

  function init(barEl) {
    _bar = barEl;
  }

  function load(words) {
    _words = words || [];
    _bar.innerHTML = "";
    _spans = _words.map(w => {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = w.text + " ";
      _bar.appendChild(span);
      return span;
    });
  }

  function update(currentMs) {
    if (!_spans.length) return;
    // 현재 발화 중인 어절 인덱스
    let cur = -1;
    for (let i = 0; i < _words.length; i++) {
      if (currentMs >= _words[i].offset_ms) cur = i;
      else break;
    }
    _spans.forEach((sp, i) => {
      sp.className = "word" + (i < cur ? " past" : i === cur ? " current" : "");
    });
  }

  function clear() {
    _bar.innerHTML = "";
    _words = [];
    _spans = [];
  }

  return { init, load, update, clear };
})();

/**
 * subtitle.js — 자막 동기화 모듈 (createLecture에서 그대로 복사)
 */
const Subtitle = (() => {
  let _bar   = null;
  let _words = [];
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

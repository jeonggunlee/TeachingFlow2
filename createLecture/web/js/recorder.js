/**
 * recorder.js — WebM 영상 녹화 모듈
 *
 * 마스터 캔버스(1280×720)에 슬라이드+오버레이+자막을 매 프레임 합성하고
 * MediaRecorder로 video/webm 파일로 저장한다.
 *
 * 주의:
 *   - MediaElementAudioSourceNode는 동일 audio 요소에 1회만 연결 가능.
 *     AudioContext는 세션 전체에서 재사용한다.
 *   - VP9/Opus WebM은 Chromium 계열 전용. isSupported()로 확인 후 사용.
 */
const Recorder = (() => {
  const REC_W = 1280;
  const REC_H = 720;

  // DOM / 모듈 참조
  let _slideImg    = null;
  let _subtitleBar = null;
  let _audioEl     = null;

  // 마스터 캔버스 (DOM 외부 — captureStream 용)
  const _master = document.createElement("canvas");
  _master.width  = REC_W;
  _master.height = REC_H;
  const _ctx = _master.getContext("2d");

  // lecture.json slide_size
  let _natW = 0;
  let _natH = 0;

  // Audio (1회 초기화)
  let _audioCtx  = null;
  let _audioDest = null;

  // 녹화 상태
  let _recorder  = null;
  let _chunks    = [];
  let _rafId     = null;
  let _recording = false;

  // ── 초기화 ──────────────────────────────────────────────────────
  function init(slideImg, subtitleBar, audioEl) {
    _slideImg    = slideImg;
    _subtitleBar = subtitleBar;
    _audioEl     = audioEl;
  }

  function setNaturalSize(w, h) {
    _natW = w;
    _natH = h;
  }

  // ── 브라우저 지원 여부 ────────────────────────────────────────────
  function isSupported() {
    return !!(
      window.MediaRecorder &&
      HTMLCanvasElement.prototype.captureStream &&
      window.AudioContext
    );
  }

  // ── Audio 설정 (1회) ─────────────────────────────────────────────
  // createMediaElementSource는 동일 요소에 한 번만 호출 가능.
  function _setupAudio() {
    if (_audioCtx) return;
    _audioCtx  = new AudioContext();
    _audioDest = _audioCtx.createMediaStreamDestination();
    const src  = _audioCtx.createMediaElementSource(_audioEl);
    src.connect(_audioDest);           // 녹화 트랙
    src.connect(_audioCtx.destination); // 스피커 출력 유지
  }

  // ── 녹화 시작 ────────────────────────────────────────────────────
  function start() {
    if (_recording || !isSupported()) return;

    _setupAudio();
    if (_audioCtx.state === "suspended") _audioCtx.resume();

    _chunks    = [];
    _recording = true;
    _rafId     = requestAnimationFrame(_draw);

    const mimeType = _bestMimeType();
    const stream = new MediaStream([
      ..._master.captureStream(30).getTracks(),
      ..._audioDest.stream.getTracks(),
    ]);

    _recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    _recorder.ondataavailable = (e) => { if (e.data.size > 0) _chunks.push(e.data); };
    _recorder.onstop = _onStop;
    _recorder.start(100); // 100ms 단위로 청크 수집
  }

  // ── 녹화 중지 ────────────────────────────────────────────────────
  function stop() {
    if (!_recording) return;
    _recording = false;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_recorder && _recorder.state !== "inactive") _recorder.stop();
  }

  // ── 메인 렌더 루프 ───────────────────────────────────────────────
  function _draw() {
    if (!_recording) return;

    _ctx.fillStyle = "#000";
    _ctx.fillRect(0, 0, REC_W, REC_H);

    _drawSlide();
    _drawOverlay();
    _drawSubtitle();

    _rafId = requestAnimationFrame(_draw);
  }

  // 슬라이드 이미지 (object-fit:contain 공식)
  function _drawSlide() {
    if (!_slideImg || !_slideImg.complete || !_slideImg.naturalWidth) return;
    const nw = _natW || _slideImg.naturalWidth;
    const nh = _natH || _slideImg.naturalHeight;
    const scale = Math.min(REC_W / nw, REC_H / nh);
    const rw = nw * scale;
    const rh = nh * scale;
    const rx = (REC_W - rw) / 2;
    const ry = (REC_H - rh) / 2;
    _ctx.drawImage(_slideImg, rx, ry, rw, rh);
  }

  // 오버레이 — Overlay.drawOn()으로 현재 효과를 마스터 좌표계로 직접 그림
  function _drawOverlay() {
    if (typeof Overlay !== "undefined") {
      Overlay.drawOn(_ctx, REC_W, REC_H);
    }
  }

  // 자막 — subtitle-bar의 span.word를 파싱해 캔버스 하단에 렌더
  function _drawSubtitle() {
    if (!_subtitleBar) return;
    const spans = _subtitleBar.querySelectorAll("span.word");
    if (!spans.length) return;

    const fontSize   = 22;
    const boldFont   = `bold ${fontSize}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
    const regularFont = `${fontSize}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
    const lineH      = Math.round(fontSize * 1.6);
    const padX       = 28;
    const padY       = 12;
    const maxLineW   = REC_W - padX * 2;

    // 각 어절의 텍스트·스타일·폭 수집 (폰트에 따라 개별 측정)
    const words = Array.from(spans).map(sp => {
      const isCurrent = sp.classList.contains("current");
      const isPast    = sp.classList.contains("past");
      const font      = isCurrent ? boldFont : regularFont;
      _ctx.font = font;
      return {
        text: sp.textContent,  // subtitle.js에서 이미 " " 포함
        isCurrent, isPast, font,
        width: _ctx.measureText(sp.textContent).width,
      };
    });

    // 줄 나누기
    const lines = [];
    let line  = [];
    let lineW = 0;
    for (const w of words) {
      if (line.length > 0 && lineW + w.width > maxLineW) {
        lines.push(line);
        line  = [w];
        lineW = w.width;
      } else {
        line.push(w);
        lineW += w.width;
      }
    }
    if (line.length) lines.push(line);

    const visLines = lines.slice(-2); // 최대 2줄
    const barH     = visLines.length * lineH + padY * 2;
    const barY     = REC_H - barH;

    // 배경 바
    _ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    _ctx.fillRect(0, barY, REC_W, barH);

    _ctx.textBaseline = "middle";
    let textY = barY + padY + lineH / 2;

    for (const ln of visLines) {
      // 각 줄 총 너비 재계산 (폰트 적용 후)
      let totalW = 0;
      for (const w of ln) {
        _ctx.font = w.font;
        totalW += _ctx.measureText(w.text).width;
      }
      let x = (REC_W - totalW) / 2;

      for (const w of ln) {
        _ctx.font      = w.font;
        _ctx.fillStyle = w.isCurrent ? "#fde047"
                       : w.isPast    ? "#e2e8f0"
                                     : "#64748b";
        _ctx.fillText(w.text, x, textY);
        x += _ctx.measureText(w.text).width;
      }
      textY += lineH;
    }
  }

  // ── 저장 (stop 완료 후 자동 다운로드) ────────────────────────────
  function _onStop() {
    const mime = (_recorder && _recorder.mimeType) || "video/webm";
    const blob = new Blob(_chunks, { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "lecture.webm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── 유틸 ────────────────────────────────────────────────────────
  function _bestMimeType() {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || "";
  }

  function isRecording() { return _recording; }

  return { init, setNaturalSize, isSupported, start, stop, isRecording };
})();

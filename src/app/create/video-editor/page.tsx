"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, FileQuestion, Layers, Type, MousePointer2, Settings2, Scissors, LayoutTemplate, Mic2, MoveLeft, History, Save, Rocket, FileVideo, SplitSquareHorizontal, Mic, Volume2, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export default function TimelineEditor() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  
  // Interactive States
  const [activeTool, setActiveTool] = useState('pointer');
  const [currentTime, setCurrentTime] = useState(134); // 00:02:14
  const [activeBlock, setActiveBlock] = useState<string | null>('s2');
  const totalTime = 900; // 15 mins

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => (prev >= totalTime ? 0 : prev + 1));
      }, 1000); // 1 real second
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  const handleFinalRender = () => {
    setIsRendering(true);
    setRenderProgress(0);
    
    const interval = setInterval(() => {
      setRenderProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            router.push('/assets');
          }, 1000);
          return 100;
        }
        return prev + Math.floor(Math.random() * 15) + 5;
      });
    }, 600);
  };

  return (
    <div className="w-full h-screen bg-[#050505] flex flex-col overflow-hidden text-zinc-200 relative">
      
      {/* Rendering Overlay */}
      <AnimatePresence>
        {isRendering && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center"
          >
            <div className="max-w-md w-full p-8 flex flex-col items-center text-center">
              {renderProgress < 100 ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="mb-8"
                >
                  <Loader2 size={64} className="text-[#FFBE98]" />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="mb-8 w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center"
                >
                  <CheckCircle2 size={40} className="text-emerald-400" />
                </motion.div>
              )}
              
              <h2 className="text-2xl font-bold text-white mb-4">
                {renderProgress < 100 ? "AI가 비디오를 렌더링 중입니다" : "렌더링 완료!"}
              </h2>
              <p className="text-zinc-400 mb-8 text-sm">
                {renderProgress < 100 ? "고품질 에셋 생성 및 타임라인 싱크를 맞추고 있습니다. (예상 시간: 3분)" : "완성된 강의 플레이어로 이동합니다..."}
              </p>
              
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-4 relative">
                <motion.div 
                  className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#FCA5A5] to-[#FFBE98]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${renderProgress}%` }}
                />
              </div>
              <div className="text-sm font-bold text-gradient-gemini">{Math.min(renderProgress, 100)}%</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 bg-[#0a0a0b]">
        <div className="flex items-center gap-4">
          <Link href="/assets">
            <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <MoveLeft size={16} />
            </button>
          </Link>
          <div className="h-4 w-[1px] bg-white/10" />
          <h1 className="text-sm font-semibold tracking-tight text-zinc-200">소프트웨어 공학 개론 - 가편집(Draft)</h1>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded border border-white/5">자동 저장됨</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => alert('수정 히스토리 패널이 열립니다.')}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center transition-colors"
          >
            <History size={14} className="mr-2" /> 히스토리
          </button>
          <button 
            onClick={() => alert('현재 상태가 임시 저장되었습니다.')}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg flex items-center transition-colors border border-zinc-700"
          >
            <Save size={14} className="mr-2" /> 프로젝트 임시저장
          </button>
          <button 
            onClick={handleFinalRender}
            className="px-5 py-2 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5] hover:opacity-90 text-[#050505] text-xs font-bold rounded-lg flex items-center transition-opacity shadow-[0_0_20px_rgba(255,190,152,0.3)]"
          >
            <Rocket size={14} className="mr-2" /> 최종 렌더링 시작
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#050505] overflow-y-auto lg:overflow-hidden">
        
        {/* LEFT PANEL: Toolbar + Assets */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col sm:flex-row bg-[#0a0a0b] flex-shrink-0">
          {/* Thin vertical/horizontal toolbar */}
          <div className="w-full sm:w-16 border-b sm:border-b-0 sm:border-r border-white/5 flex flex-row sm:flex-col items-center justify-center sm:justify-start py-2 sm:py-4 px-4 sm:px-0 gap-2 sm:gap-4 bg-[#050505] flex-shrink-0 overflow-x-auto custom-scrollbar">
            <button onClick={() => setActiveTool('pointer')} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'pointer' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")} title="선택 도구"><MousePointer2 size={16} /></button>
            <button onClick={() => { setActiveTool('scissors'); alert('자르기 도구가 활성화되었습니다.'); }} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'scissors' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")} title="자르기 도구"><Scissors size={16} /></button>
            <button onClick={() => { setActiveTool('layers'); alert('레이어 패널을 엽니다.'); }} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'layers' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")} title="레이어"><Layers size={16} /></button>
            <button onClick={() => { setActiveTool('text'); alert('텍스트 상자를 추가합니다.'); }} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'text' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")} title="텍스트"><Type size={16} /></button>
            <button onClick={() => { setActiveTool('quiz'); alert('팝업 퀴즈 블록이 추가됩니다.'); }} className={cn("p-2.5 rounded-lg transition-colors mt-2", activeTool === 'quiz' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10")} title="팝업 퀴즈 추가"><FileQuestion size={16} /></button>
            <div className="hidden sm:block flex-1" />
            <button onClick={() => alert('에디터 상세 설정 메뉴를 엽니다.')} className="p-2.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><Settings2 size={16} /></button>
          </div>
          {/* Asset list */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar max-h-[30vh] sm:max-h-none">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">사용 가능한 에셋</h3>
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-[#050505] rounded-xl border border-white/5 hover:border-white/10 cursor-pointer transition-colors group">
                <div className="w-full h-20 bg-zinc-900 rounded-lg mb-2 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform">
                  <LayoutTemplate size={20} className="text-zinc-700" />
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/50 rounded text-[8px] font-bold text-zinc-400">00:15</div>
                </div>
                <p className="text-xs font-medium text-zinc-300 line-clamp-1">오프닝 슬라이드</p>
              </div>
              <div className="p-3 bg-[#050505] rounded-xl border border-white/5 hover:border-white/10 cursor-pointer transition-colors group">
                <div className="w-full h-20 bg-zinc-900 rounded-lg mb-2 flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform">
                  <FileVideo size={20} className="text-zinc-700" />
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/50 rounded text-[8px] font-bold text-zinc-400">02:30</div>
                </div>
                <p className="text-xs font-medium text-zinc-300 line-clamp-1">소프트웨어 위기 설명 영상</p>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#050505] min-h-[60vh] lg:min-h-0">
          {/* Top: Preview Player */}
          <div className="flex-1 flex flex-col p-4 lg:p-6 border-b border-white/5">
            <div className="flex-1 metal-panel rounded-2xl flex items-center justify-center relative overflow-hidden shadow-2xl border border-white/5">
              <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
              <motion.div 
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="relative z-10 text-center flex flex-col items-center justify-center w-full max-w-5xl aspect-video bg-[#0a0a0b] rounded-xl border border-white/10"
              >
                <h2 className="text-5xl font-bold text-zinc-100 tracking-tight mb-6">소프트웨어 위기</h2>
                <p className="text-zinc-400 text-xl font-medium leading-relaxed">하드웨어 기술의 발전을 따라가지 못하는 소프트웨어의 한계</p>
              </motion.div>
            </div>
            
            {/* Player Controls */}
            <div className="h-16 mt-4 flex items-center justify-center gap-8">
              <button onClick={() => setCurrentTime(prev => Math.max(0, prev - 10))} className="text-zinc-500 hover:text-zinc-300 transition-colors"><SkipBack size={20} fill="currentColor" /></button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 rounded-full bg-[#FFBE98] flex items-center justify-center text-[#050505] hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,190,152,0.3)]"
              >
                {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <button onClick={() => setCurrentTime(prev => Math.min(totalTime, prev + 10))} className="text-zinc-500 hover:text-zinc-300 transition-colors"><SkipForward size={20} fill="currentColor" /></button>
              <div className="flex items-center gap-2 ml-8 text-xs font-medium text-zinc-500 font-mono tracking-wider">
                <span className="text-zinc-300">{formatTime(currentTime)}</span>
                <span>/</span>
                <span>00:15:00</span>
              </div>
            </div>
          </div>
          
          {/* Bottom: Timeline Area */}
          <div className="h-64 bg-[#0a0a0b] flex flex-col flex-shrink-0">
            {/* Timeline Header */}
            <div className="h-8 border-b border-white/5 flex">
              <div className="w-48 border-r border-white/5 bg-[#0a0a0b]" />
              <div className="flex-1 relative overflow-hidden bg-[#050505]">
                {/* Time ruler */}
                <div className="absolute inset-0 flex items-end">
                  {[...Array(30)].map((_, i) => (
                    <div key={i} className="flex-1 h-3 border-l border-white/10 text-[9px] font-medium text-zinc-600 pl-1 pb-0.5">{i}:00</div>
                  ))}
                </div>
                {/* Playhead Mockup */}
                <div 
                  className="absolute top-0 bottom-0 w-[1px] bg-[#FFBE98] z-20 pointer-events-none transition-all duration-1000 ease-linear"
                  style={{ left: `${(currentTime / totalTime) * 100}%` }}
                >
                  <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-[#FFBE98] cursor-ew-resize pointer-events-auto shadow-[0_0_10px_rgba(255,190,152,0.8)]" />
                </div>
              </div>
            </div>

            {/* Tracks */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
              
              {/* Quiz Track */}
              <div className="h-14 border-b border-white/5 flex group">
                <div className="w-48 border-r border-white/5 flex items-center px-4 bg-[#0a0a0b] group-hover:bg-white/[0.02] transition-colors">
                  <FileQuestion size={14} className="text-indigo-400 mr-2" />
                  <span className="text-xs font-bold text-zinc-300 line-clamp-1">팝업 퀴즈 (Q1)</span>
                </div>
                <div className="flex-1 relative bg-[#050505] p-2 flex gap-1">
                  <div className="ml-[14%] w-[2%] h-full bg-indigo-500/20 border border-indigo-500/50 rounded-md flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                    <FileQuestion size={12} className="text-indigo-300" />
                  </div>
                </div>
              </div>

              {/* Video / Slide Track */}
              <div className="h-16 border-b border-white/5 flex group">
                <div className="w-48 border-r border-white/5 flex items-center px-4 bg-[#0a0a0b] group-hover:bg-white/[0.02] transition-colors">
                  <LayoutTemplate size={14} className="text-zinc-400 mr-2" />
                  <span className="text-xs font-bold text-zinc-300 line-clamp-1">슬라이드 (V1)</span>
                </div>
                <div className="flex-1 relative bg-[#050505] p-2 flex gap-1">
                  <div 
                    onClick={() => setActiveBlock('s1')}
                    className={cn(
                      "w-1/4 h-full bg-zinc-800 rounded-md flex items-center px-3 cursor-pointer transition-colors border",
                      activeBlock === 's1' ? "border-[#FFBE98] ring-1 ring-[#FFBE98]/30" : "border-zinc-700 hover:border-zinc-500"
                    )}
                  >
                    <span className={cn("text-[10px] font-semibold truncate", activeBlock === 's1' ? "text-[#FFBE98]" : "text-zinc-300")}>S1: 오프닝</span>
                  </div>
                  <div 
                    onClick={() => setActiveBlock('s2')}
                    className={cn(
                      "w-2/4 h-full rounded-md flex items-center px-3 cursor-pointer transition-colors relative overflow-hidden border",
                      activeBlock === 's2' ? "bg-[#FFBE98]/20 border-[#FFBE98] ring-1 ring-[#FFBE98]/30" : "bg-[#FFBE98]/10 border-[#FFBE98]/30 hover:border-[#FFBE98]/50"
                    )}
                  >
                    <span className="text-[10px] font-semibold text-[#FFBE98] truncate relative z-10">S2: 소프트웨어 위기</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFBE98]/10 to-transparent opacity-50" />
                  </div>
                </div>
              </div>

              {/* AI Voice Track */}
              <div className="h-16 border-b border-white/5 flex group">
                <div className="w-48 border-r border-white/5 flex items-center px-4 bg-[#0a0a0b] group-hover:bg-white/[0.02] transition-colors">
                  <Mic size={14} className="text-zinc-400 mr-2" />
                  <span className="text-xs font-bold text-zinc-300 line-clamp-1">AI 나레이션 (A1)</span>
                </div>
                <div className="flex-1 relative bg-[#050505] p-2 flex gap-1">
                  <div 
                    onClick={() => setActiveBlock('t1')}
                    className={cn(
                      "w-1/4 h-full rounded-md border flex items-center px-2 cursor-pointer transition-colors relative overflow-hidden",
                      activeBlock === 't1' ? "bg-indigo-500/20 border-indigo-400 ring-1 ring-indigo-400/30" : "bg-[#1e1e24] border-white/10 hover:border-white/20"
                    )}
                  >
                    <span className={cn("text-[10px] font-semibold truncate relative z-10", activeBlock === 't1' ? "text-indigo-300" : "text-zinc-400")}>TTS Block 1</span>
                    <div className="absolute bottom-1 left-3 right-3 h-4 flex items-end gap-[1px] opacity-30">
                      {[...Array(20)].map((_, i) => <div key={i} className={cn("flex-1 rounded-t-sm", activeBlock === 't1' ? "bg-indigo-400" : "bg-zinc-400")} style={{ height: `${Math.round(20 + Math.abs(Math.sin(i * 0.8)) * 80)}%` }} />)}
                    </div>
                  </div>
                  <div 
                    onClick={() => setActiveBlock('t2')}
                    className={cn(
                      "w-2/4 h-full rounded-md border flex items-center px-2 cursor-pointer transition-colors relative overflow-hidden",
                      activeBlock === 't2' ? "bg-indigo-500/20 border-indigo-400 ring-1 ring-indigo-400/30" : "bg-[#1e1e24] border-white/10 hover:border-white/20"
                    )}
                  >
                    <span className={cn("text-[10px] font-semibold truncate relative z-10", activeBlock === 't2' ? "text-indigo-300" : "text-zinc-400")}>TTS Block 2</span>
                    <div className="absolute bottom-1 left-3 right-3 h-4 flex items-end gap-[1px] opacity-30">
                      {[...Array(40)].map((_, i) => <div key={i} className={cn("flex-1 rounded-t-sm", activeBlock === 't2' ? "bg-indigo-400" : "bg-zinc-400")} style={{ height: `${Math.round(20 + Math.abs(Math.sin(i * 1.2)) * 80)}%` }} />)}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Properties & AI Script */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/5 bg-[#0a0a0b] flex flex-col flex-shrink-0">
          <div className="h-14 flex items-center px-5 border-b border-white/5 flex-shrink-0">
            <h3 className="text-sm font-bold text-zinc-200">선택된 블록 속성</h3>
          </div>
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-8">
            {/* AI Script Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center">
                  <Mic size={12} className="mr-1.5" /> AI 나레이션 대본
                </label>
                <button className="text-[10px] text-[#FFBE98] hover:text-[#FFBE98]/80 font-semibold" onClick={() => alert('스크립트 자동 재생성')}>재생성</button>
              </div>
              <textarea 
                className="w-full bg-[#050505] border border-white/10 rounded-xl p-4 text-sm text-zinc-300 focus:outline-none focus:border-[#FFBE98]/50 h-36 resize-none leading-relaxed transition-colors shadow-inner"
                value={
                  activeBlock === 's1' ? "안녕하세요, 오늘은 소프트웨어 공학의 첫 걸음, 오프닝을 시작하겠습니다." : 
                  activeBlock === 's2' ? "하드웨어 기술의 발전을 따라가지 못하는 소프트웨어의 한계, 바로 소프트웨어 위기입니다." : 
                  activeBlock === 't1' ? "안녕하세요, 오늘은 소프트웨어 공학의 첫 걸음, 오프닝을 시작하겠습니다." : 
                  activeBlock === 't2' ? "하드웨어 기술의 발전을 따라가지 못하는 소프트웨어의 한계, 바로 소프트웨어 위기입니다. 이 위기는 1968년 나토 소프트웨어 공학 학회에서 처음 언급되었습니다." : ""
                }
                readOnly
              />
            </div>
            
            {/* Voice Style Section */}
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">음성 스타일</label>
              <div className="relative">
                <select className="appearance-none w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-zinc-300 focus:outline-none focus:border-[#FFBE98]/50 transition-colors cursor-pointer">
                  <option>전문적인 아나운서 (남성)</option>
                  <option>차분한 도슨트 (여성)</option>
                  <option>활기찬 강사 (남성)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  ▼
                </div>
              </div>
            </div>

            {/* Transition Section */}
            <div>
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">화면 트랜지션</label>
               <div className="grid grid-cols-2 gap-2">
                 <button className="py-2.5 bg-[#FFBE98]/10 rounded-xl text-xs font-bold text-[#FFBE98] border border-[#FFBE98]/30 transition-colors shadow-[0_0_10px_rgba(255,190,152,0.1)]">디졸브</button>
                 <button className="py-2.5 bg-[#050505] rounded-xl text-xs font-medium text-zinc-400 border border-white/5 hover:border-white/10 transition-colors">슬라이드</button>
                 <button className="py-2.5 bg-[#050505] rounded-xl text-xs font-medium text-zinc-400 border border-white/5 hover:border-white/10 transition-colors">줌 인</button>
                 <button className="py-2.5 bg-[#050505] rounded-xl text-xs font-medium text-zinc-400 border border-white/5 hover:border-white/10 transition-colors">없음</button>
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

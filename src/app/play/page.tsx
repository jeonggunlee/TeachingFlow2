"use client";

import { motion } from "framer-motion";
import { MoveLeft, Play, Pause, SkipBack, SkipForward, Maximize, Settings, Volume2, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function PlayPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const totalTime = 900; // 15 mins

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  return (
    <div className="w-full h-screen bg-[#050505] flex flex-col overflow-hidden text-zinc-200">
      
      {/* Header */}
      <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 bg-[#0a0a0b] relative z-10">
        <div className="flex items-center gap-4">
          <Link href="/assets">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <MoveLeft size={18} className="text-zinc-300" />
            </button>
          </Link>
          <div className="h-4 w-[1px] bg-white/10" />
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">소프트웨어 공학 개론 - 완성본</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-zinc-400 hover:text-white transition-colors">
            <Info size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#050505] overflow-y-auto lg:overflow-hidden">
        
        {/* Left: Video Player */}
        <div className="flex-1 flex flex-col p-4 lg:p-6 lg:overflow-y-auto custom-scrollbar">
          <div className="flex-1 w-full max-w-6xl mx-auto flex flex-col gap-4">
            
            {/* Player Container */}
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="w-full aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden relative shadow-2xl flex flex-col"
            >
              {/* Video Content Placeholder */}
              <div className="flex-1 flex items-center justify-center relative bg-[#0a0a0b]">
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
                
                <div className="text-center z-10">
                  <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">소프트웨어 위기</h2>
                  <p className="text-zinc-400 text-lg">하드웨어 기술의 발전을 따라가지 못하는 소프트웨어의 한계</p>
                </div>
              </div>

              {/* Player Controls (Overlay) */}
              <div className="h-16 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between px-6 absolute bottom-0 left-0 right-0 z-20">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="text-white hover:text-[#FFBE98] transition-colors"
                  >
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </button>
                  <button onClick={() => setCurrentTime(prev => Math.max(0, prev - 10))} className="text-zinc-300 hover:text-white transition-colors">
                    <SkipBack size={20} fill="currentColor" />
                  </button>
                  <button onClick={() => setCurrentTime(prev => Math.min(totalTime, prev + 10))} className="text-zinc-300 hover:text-white transition-colors">
                    <SkipForward size={20} fill="currentColor" />
                  </button>
                  <div className="text-xs font-medium text-zinc-300 font-mono tracking-wider ml-2">
                    {formatTime(currentTime)} <span className="text-zinc-500 mx-1">/</span> {formatTime(totalTime)}
                  </div>
                </div>

                <div className="flex-1 mx-8 relative flex items-center">
                  <div className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer relative overflow-hidden">
                    <div 
                      className="absolute top-0 bottom-0 left-0 bg-[#FFBE98] rounded-full"
                      style={{ width: `${(currentTime / totalTime) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-zinc-300">
                  <button className="hover:text-white transition-colors"><Volume2 size={20} /></button>
                  <button className="hover:text-white transition-colors"><Settings size={20} /></button>
                  <button className="hover:text-white transition-colors"><Maximize size={20} /></button>
                </div>
              </div>
            </motion.div>

            {/* Video Meta Info below player */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-between items-start mt-4 px-2"
            >
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-2">소프트웨어 공학 개론 (1주차)</h2>
                <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm text-zinc-400">
                  <span>조회수 1,204회</span>
                  <span>•</span>
                  <span>2일 전 업로드</span>
                </div>
              </div>
              <button className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl border border-white/10 transition-colors">
                분석 리포트 보기
              </button>
            </motion.div>
          </div>
        </div>
        
        {/* Right: Sidebar (Video Script / Timeline) */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/5 bg-[#0a0a0b] flex flex-col flex-shrink-0 lg:h-full mt-6 lg:mt-0">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">비디오 스크립트</h3>
              <p className="text-xs text-zinc-500 mt-1">AI 자동 생성 대본</p>
            </div>
            <div className="flex gap-2">
              <button className="px-2 py-1 text-zinc-400 hover:text-white bg-white/5 rounded-md transition-colors text-[10px] font-medium border border-white/10">텍스트 내보내기</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
            {[
              { time: "00:00", text: "여러분 안녕하세요. 이번 시간에는 소프트웨어 위기와 공학의 탄생 배경에 대해 알아보겠습니다.", current: false },
              { time: "01:15", text: "1960년대 하드웨어 기술은 급격히 발전했지만, 소프트웨어 개발은 그 속도를 따라가지 못했습니다.", current: true },
              { time: "02:30", text: "이러한 현상을 우리는 '소프트웨어 위기'라고 부릅니다. 프로젝트 지연과 예산 초과가 빈번하게 발생했죠.", current: false },
              { time: "04:00", text: "이를 해결하기 위해 공학적인 접근 방식이 필요해졌고, 그것이 바로 소프트웨어 공학의 시작입니다.", current: false },
              { time: "05:45", text: "대표적으로 요구사항 분석, 설계, 구현, 테스트, 유지보수라는 체계적인 생명주기를 도입하게 되었습니다.", current: false },
              { time: "07:20", text: "다음 장에서는 대표적인 개발 방법론 중 하나인 폭포수 모델에 대해 자세히 살펴보겠습니다.", current: false },
              { time: "10:05", text: "오늘 배운 내용을 정리해보면, 소프트웨어 공학은 한정된 자원으로 신뢰성 높은 소프트웨어를 경제적으로 생산하기 위한 방법론입니다.", current: false },
              { time: "13:30", text: "이상으로 첫 번째 강의를 마치겠습니다. 다음 시간에 뵙겠습니다. 감사합니다.", current: false }
            ].map((script, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex gap-3 p-3.5 rounded-xl cursor-pointer transition-all border",
                  script.current 
                    ? "bg-[#FFBE98]/10 border-[#FFBE98]/30 shadow-[0_0_15px_rgba(255,190,152,0.1)] scale-[1.02]" 
                    : "bg-[#050505] border-white/5 hover:border-white/10 hover:bg-white/5 opacity-70 hover:opacity-100"
                )}
              >
                <div className={cn("text-[11px] font-mono font-bold pt-0.5 flex-shrink-0", script.current ? "text-[#FFBE98]" : "text-zinc-500")}>
                  {script.time}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className={cn("text-xs leading-relaxed", script.current ? "text-zinc-100 font-medium" : "text-zinc-400")}>
                    {script.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

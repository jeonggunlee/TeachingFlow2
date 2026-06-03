"use client";

import { motion } from "framer-motion";
import { Play, Pause, Maximize, Settings2, SkipBack, SkipForward, ArrowLeft, Share2, Download } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function PreviewMasterpiece() {
  return (
    <div className="w-full h-[calc(100vh-4rem)] flex flex-col p-6 bg-[#050505] overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/create">
          <button className="flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={16} className="mr-2" /> 스튜디오로 돌아가기
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 metal-panel rounded-full text-xs font-semibold text-zinc-300 hover:text-white flex items-center transition-colors">
            <Share2 size={14} className="mr-2" /> 공유
          </button>
          <button className="px-4 py-2 bg-zinc-100 text-black rounded-full text-xs font-semibold hover:bg-white flex items-center transition-colors">
            <Download size={14} className="mr-2" /> 내보내기
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Main Player Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 bg-black border border-white/10 rounded-3xl overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            {/* Cinematic Placeholder */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-[#050505] flex items-center justify-center">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1 }}
                className="text-center"
              >
                <h1 className="text-5xl font-bold text-white mb-6 tracking-tight">소프트웨어 공학 개론</h1>
                <p className="text-xl text-zinc-400">제 1장. 폭포수 모델의 이해</p>
              </motion.div>
            </div>
            
            {/* Player Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
              <div className="w-full h-1 bg-white/20 rounded-full mb-6 relative cursor-pointer hover:h-1.5 transition-all">
                <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-zinc-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-white">
                  <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><SkipBack size={20} fill="currentColor" /></button>
                  <button className="p-3 bg-white text-black hover:scale-105 rounded-full transition-all shadow-lg"><Play size={24} fill="currentColor" /></button>
                  <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><SkipForward size={20} fill="currentColor" /></button>
                  <span className="text-sm font-medium ml-4 text-zinc-300">01:24 / 45:00</span>
                </div>
                <div className="flex items-center gap-4 text-white">
                  <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Settings2 size={20} /></button>
                  <button className="p-2 hover:bg-white/10 rounded-full transition-colors"><Maximize size={20} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Slide Navigation */}
        <div className="w-80 flex flex-col min-h-0 metal-panel rounded-3xl overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <h3 className="text-sm font-semibold text-zinc-200">슬라이드 목록</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {[
              { id: 1, title: "오프닝 및 타이틀", duration: "0:30", active: false },
              { id: 2, title: "소프트웨어 위기", duration: "2:15", active: true },
              { id: 3, title: "SDLC란 무엇인가?", duration: "3:40", active: false },
              { id: 4, title: "폭포수 모델", duration: "4:20", active: false },
              { id: 5, title: "애자일 방법론", duration: "5:10", active: false },
              { id: 6, title: "결론 및 요약", duration: "1:30", active: false },
            ].map((slide) => (
              <div 
                key={slide.id} 
                className={cn(
                  "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                  slide.active 
                    ? "bg-zinc-800/80 border-zinc-600 shadow-inner" 
                    : "bg-transparent border-transparent hover:bg-zinc-900"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5",
                  slide.active ? "bg-zinc-400 text-white" : "bg-zinc-800 text-zinc-500"
                )}>
                  {slide.id}
                </div>
                <div>
                  <h4 className={cn(
                    "text-sm font-medium mb-1",
                    slide.active ? "text-white" : "text-zinc-400"
                  )}>{slide.title}</h4>
                  <p className="text-xs text-zinc-600">{slide.duration}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

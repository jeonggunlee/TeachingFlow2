"use client";

import { motion } from "framer-motion";
import { MoveLeft, LayoutTemplate, Type, Image as ImageIcon, Save, Film, Settings2, Plus, MousePointer2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function SlideEditor() {
  const router = useRouter();
  const [activeSlide, setActiveSlide] = useState(1);
  const [activeTool, setActiveTool] = useState('pointer');

  const slides = [
    { id: 1, title: "오프닝 슬라이드" },
    { id: 2, title: "소프트웨어 위기의 배경" },
    { id: 3, title: "해결 방안 및 결론" }
  ];

  return (
    <div className="w-full h-screen bg-[#050505] flex flex-col overflow-hidden text-zinc-200">
      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 flex-shrink-0 bg-[#0a0a0b]">
        <div className="flex items-center gap-4">
          <Link href="/assets">
            <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <MoveLeft size={16} />
            </button>
          </Link>
          <div className="h-4 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#FFBE98] uppercase tracking-widest bg-[#FFBE98]/10 border border-[#FFBE98]/20 px-2 py-0.5 rounded">발표 자료 에디터</span>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-200">디자인 패턴: Singleton</h1>
          </div>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded border border-white/5 hidden md:block">자동 저장됨</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => alert('자료가 임시 저장되었습니다.')}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg flex items-center transition-colors border border-zinc-700"
          >
            <Save size={14} className="mr-2" /> 프로젝트 저장
          </button>
          <button 
            onClick={() => router.push('/create/video-editor')}
            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-indigo-400 hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center transition-opacity shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          >
            <Film size={14} className="mr-2" /> 영상 만들기
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 bg-[#050505]">
        
        {/* LEFT PANEL: Toolbar + Slides */}
        <div className="w-64 md:w-72 border-r border-white/5 flex bg-[#0a0a0b] flex-shrink-0">
          {/* Thin vertical toolbar */}
          <div className="w-14 md:w-16 border-r border-white/5 flex flex-col items-center py-4 gap-4 bg-[#050505] flex-shrink-0">
            <button onClick={() => setActiveTool('pointer')} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'pointer' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}><MousePointer2 size={16} /></button>
            <button onClick={() => setActiveTool('layout')} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'layout' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}><LayoutTemplate size={16} /></button>
            <button onClick={() => setActiveTool('text')} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'text' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}><Type size={16} /></button>
            <button onClick={() => setActiveTool('image')} className={cn("p-2.5 rounded-lg transition-colors", activeTool === 'image' ? "bg-[#FFBE98]/10 text-[#FFBE98] border border-[#FFBE98]/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}><ImageIcon size={16} /></button>
            <div className="flex-1" />
            <button className="p-2.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"><Settings2 size={16} /></button>
          </div>
          {/* Slides list */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">슬라이드</h3>
              <button className="text-zinc-500 hover:text-white transition-colors"><Plus size={14} /></button>
            </div>
            <div className="flex flex-col gap-3">
              {slides.map((slide, idx) => (
                <div 
                  key={slide.id} 
                  onClick={() => setActiveSlide(slide.id)}
                  className="flex gap-2 items-start cursor-pointer group"
                >
                  <span className={cn("text-[9px] font-bold mt-1", activeSlide === slide.id ? "text-[#FFBE98]" : "text-zinc-600")}>{idx + 1}</span>
                  <div className={cn(
                    "flex-1 aspect-video rounded-lg border transition-all p-2 flex flex-col bg-[#050505]",
                    activeSlide === slide.id ? "border-[#FFBE98] ring-2 ring-[#FFBE98]/20 shadow-lg" : "border-white/5 group-hover:border-white/20"
                  )}>
                    <div className="w-full flex-1 bg-zinc-900 rounded-[2px] mb-1.5" />
                    <p className="text-[8px] font-medium text-zinc-400 line-clamp-1">{slide.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Canvas */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          
          <div className="h-12 border-b border-white/5 flex items-center justify-center gap-4 text-xs font-medium text-zinc-500 bg-[#0a0a0b] z-10">
            <span>줌: 100%</span>
            <div className="w-[1px] h-3 bg-white/10" />
            <span>비율: 16:9 와이드</span>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-auto z-10">
            <motion.div 
              key={activeSlide}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-4xl aspect-video bg-[#0a0a0b] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col p-10 relative overflow-hidden"
            >
              <h1 className="text-4xl font-bold text-white mb-8 tracking-tight">{slides[activeSlide - 1].title}</h1>
              <div className="flex-1 bg-black/50 rounded-lg border border-white/5 flex items-center justify-center text-zinc-500 font-medium relative group hover:border-[#FFBE98]/30 transition-colors cursor-text">
                [ 본문 텍스트 및 이미지 영역 ]
              </div>
            </motion.div>
          </div>
        </div>

        {/* RIGHT PANEL: Properties */}
        <div className="hidden lg:flex w-72 border-l border-white/5 bg-[#0a0a0b] flex-col flex-shrink-0">
          <div className="h-14 flex items-center px-5 border-b border-white/5 flex-shrink-0">
            <h3 className="text-sm font-bold text-zinc-200">슬라이드 디자인</h3>
          </div>
          <div className="flex-1 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-8">
            
            {/* Theme / Palette */}
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">컬러 테마 (적용됨)</label>
              <div className="w-full aspect-video rounded-xl flex gap-1.5 p-2 bg-[#050505] border border-white/10 shadow-inner">
                <div className="flex-1 rounded-md bg-[#FFBE98]" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="flex-1 rounded-md bg-[#FCA5A5]" />
                  <div className="flex-1 rounded-md bg-[#FDBA74]" />
                </div>
              </div>
            </div>
            
            {/* Typography */}
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">타이포그래피</label>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-[#050505] border border-white/5 rounded-lg hover:border-white/20 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-white">Pretendard</span>
                  <span className="text-xs text-zinc-500">제목</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-[#050505] border border-white/5 rounded-lg hover:border-white/20 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-white">Inter</span>
                  <span className="text-xs text-zinc-500">본문</span>
                </div>
              </div>
            </div>

            <button className="w-full py-2.5 mt-auto bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold transition-colors border border-white/5">
              전체 디자인 일괄 변경
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

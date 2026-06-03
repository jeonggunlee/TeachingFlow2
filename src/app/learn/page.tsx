"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, Pause, Volume2, Maximize, Settings, RotateCcw, RotateCw, 
  MessageSquare, Send, ChevronLeft, Cpu, User, List, FileText, CheckCircle2, Video
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function LearnPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState("02:14");
  const [totalTime] = useState("15:00");
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false); // Simulate quiz popup
  const [quizAnswered, setQuizAnswered] = useState(false);

  const [activeTab, setActiveTab] = useState('chapters');

  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: '안녕하세요! 소프트웨어 공학 강의를 듣다가 모르는 것이 생기면 언제든 질문해주세요. 현재 재생 중인 타임라인(02:14)에 대한 질문도 환영합니다! 😊' }
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleSendMessage = () => {
    if(!chatInput.trim()) return;
    setChatMessages([...chatMessages, { role: 'user', text: chatInput }]);
    const currentInput = chatInput;
    setChatInput("");
    
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: `"${currentInput}"에 대한 답변입니다. 폭포수 모델은 요구사항 분석 단계가 완전히 끝나야만 다음 단계로 넘어갈 수 있는 순차적 모델입니다.` }]);
    }, 1000);
  };

  const handle10sSkip = (direction: 'forward' | 'backward') => {
    // Dummy function to simulate 10s skip
    alert(`10초 ${direction === 'forward' ? '앞으로' : '뒤로'} 건너뛰었습니다.`);
  };

  const renderAiTutor = () => (
    <div className="w-full h-full flex flex-col">
      <div className="h-14 border-b border-white/5 flex items-center px-4 lg:px-6 justify-between bg-[#0a0a0b]">
        <div className="flex items-center gap-2 text-zinc-200">
          <MessageSquare size={16} className="text-zinc-300" />
          <h2 className="text-sm font-bold">AI 학습 튜터</h2>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-300 bg-zinc-300/10 px-2 py-1 rounded-full border border-zinc-400/20">
          <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse" />
          Online
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
        {chatMessages.map((msg, idx) => (
          <div key={idx} className={cn("flex flex-col max-w-[90%]", msg.role === 'ai' ? "mr-auto items-start" : "ml-auto items-end")}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
              {msg.role === 'ai' ? (
                <>
                  <Cpu size={12} className="text-zinc-300" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">AI Tutor</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">You</span>
                  <User size={12} className="text-zinc-400" />
                </>
              )}
            </div>
            <div className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap p-3.5 rounded-2xl shadow-sm",
              msg.role === 'ai' 
                ? "bg-[#101012] border border-white/5 text-zinc-300 rounded-tl-sm" 
                : "bg-zinc-500 text-white rounded-tr-sm"
            )}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-[#0a0a0b] border-t border-white/5">
        {/* Quick Actions */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 custom-scrollbar">
          <button onClick={() => setChatInput("현재 타임라인(02:14) 내용 요약해줘")} className="flex-shrink-0 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap min-h-[36px]">
            ⏱️ 02:14 내용 요약
          </button>
          <button onClick={() => setChatInput("폭포수 모델의 가장 큰 단점이 뭐야?")} className="flex-shrink-0 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap min-h-[36px]">
            💡 단점 질문하기
          </button>
        </div>

        <div className="relative">
          <input 
            type="text" 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="궁금한 점을 질문하세요..." 
            className="w-full bg-[#050505] border border-white/10 focus:border-zinc-400/50 rounded-xl pl-4 pr-12 py-3 text-sm text-zinc-200 focus:outline-none transition-colors shadow-inner min-h-[44px]"
          />
          <button 
            onClick={handleSendMessage}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-zinc-500 hover:bg-zinc-400 text-white rounded-lg transition-colors shadow-md min-w-[32px] min-h-[32px]"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-[#050505]">
      {/* HEADER */}
      <div className="h-16 border-b border-white/5 flex items-center px-6 bg-[#0a0a0b] flex-shrink-0 justify-between shadow-sm relative z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              <Video size={16} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-zinc-100">소프트웨어 공학 3주차 팀플 자료</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#0a0a0b] bg-zinc-400/20 flex items-center justify-center text-[10px] font-bold text-zinc-300">나</div>
            <div className="w-8 h-8 rounded-full border-2 border-[#0a0a0b] bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">+3</div>
          </div>
          <span className="text-xs font-semibold text-zinc-500">현재 4명 수강 중</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* LEFT/MAIN: VIDEO PLAYER & TABS */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#050505] w-full">
          <div className="p-6 pb-0 max-w-6xl mx-auto w-full">
            
            {/* VIDEO PLAYER CONTAINER */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group flex flex-col justify-between">
              
              {/* Dummy Video Content (Gradient + Title) */}
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black flex flex-col items-center justify-center">
                {!isPlaying && (
                  <button 
                    onClick={() => setIsPlaying(true)}
                    className="w-20 h-20 bg-zinc-500/90 hover:bg-zinc-400 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-all transform hover:scale-110 z-10"
                  >
                    <Play size={32} className="ml-1" fill="currentColor" />
                  </button>
                )}
                <div className="mt-8 text-center opacity-40">
                  <h2 className="text-3xl font-bold text-white mb-2">폭포수 모델의 5단계 구조</h2>
                  <p className="text-zinc-400">Chapter 2</p>
                </div>
              </div>

              {/* QUIZ OVERLAY */}
              <AnimatePresence>
                {showQuiz && !quizAnswered && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
                  >
                    <div className="bg-[#0a0a0b] border border-white/10 rounded-2xl p-8 max-w-xl w-full shadow-2xl">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="px-3 py-1 bg-zinc-400/20 text-zinc-300 rounded-full text-xs font-bold border border-zinc-400/30">
                          팝업 퀴즈
                        </div>
                        <span className="text-zinc-400 text-sm">타임라인 02:14</span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-8 leading-relaxed">
                        폭포수 모델에서 요구사항 분석이 완전히 끝나지 않은 상태로 설계 단계로 넘어갈 수 있나요?
                      </h3>
                      <div className="space-y-3">
                        <button 
                          onClick={() => { alert('오답입니다! 폭포수 모델은 순차적으로 진행됩니다.'); }}
                          className="w-full text-left px-6 py-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 hover:border-white/20 transition-all text-zinc-300 font-medium"
                        >
                          1. 네, 애자일처럼 병행할 수 있습니다.
                        </button>
                        <button 
                          onClick={() => { setQuizAnswered(true); setTimeout(() => setShowQuiz(false), 2000); }}
                          className="w-full text-left px-6 py-4 rounded-xl bg-zinc-900/50 hover:bg-indigo-900/40 border border-white/5 hover:border-zinc-400/50 transition-all text-zinc-300 font-medium"
                        >
                          2. 아니오, 이전 단계가 완료되어야만 넘어갈 수 있습니다.
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
                {showQuiz && quizAnswered && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-zinc-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                        <CheckCircle2 size={40} className="text-white" />
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-2">정답입니다!</h2>
                      <p className="text-zinc-300">포인트 +10점 획득</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* YOUTUBE-LIKE BOTTOM CONTROLS */}
              <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-4 px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 flex flex-col">
                
                {/* Progress Timeline */}
                <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer relative group/timeline">
                  <div className="absolute h-full bg-zinc-400 rounded-full w-[15%]" />
                  {/* Quiz Marker on Timeline */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-[15%] w-3 h-3 bg-zinc-400 rounded-full shadow-[0_0_10px_rgba(217,70,239,0.8)] cursor-pointer hover:scale-150 transition-transform" 
                       onClick={(e) => { e.stopPropagation(); setShowQuiz(true); setQuizAnswered(false); }}
                       title="팝업 퀴즈 대기 중"
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 left-[15%] w-0 h-0 group-hover/timeline:w-4 group-hover/timeline:h-4 bg-zinc-400 rounded-full transition-all shadow-lg" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-zinc-300 transition-colors">
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>
                    
                    {/* 10s Skip Buttons */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => handle10sSkip('backward')} className="text-white/80 hover:text-white transition-colors" title="10초 뒤로">
                        <RotateCcw size={20} />
                      </button>
                      <button onClick={() => handle10sSkip('forward')} className="text-white/80 hover:text-white transition-colors" title="10초 앞으로">
                        <RotateCw size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 group/vol">
                      <button className="text-white hover:text-zinc-300 transition-colors">
                        <Volume2 size={20} />
                      </button>
                      <div className="w-0 group-hover/vol:w-16 overflow-hidden transition-all duration-300 h-1.5 bg-white/20 rounded-full cursor-pointer">
                        <div className="w-2/3 h-full bg-white rounded-full" />
                      </div>
                    </div>

                    <div className="text-sm font-medium text-white/90 ml-2">
                      {currentTime} <span className="text-white/50 mx-1">/</span> {totalTime}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 relative">
                    {/* Speed Control */}
                    <div className="relative">
                      <button 
                        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                        className="text-sm font-bold text-white hover:text-zinc-300 transition-colors px-2"
                      >
                        {playbackSpeed.toFixed(2)}x
                      </button>
                      
                      <AnimatePresence>
                        {showSpeedMenu && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-full right-0 mb-2 bg-[#0a0a0b]/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 flex flex-col min-w-[100px]"
                          >
                            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(speed => (
                              <button 
                                key={speed}
                                onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                                className={cn(
                                  "px-4 py-2 text-sm text-left transition-colors",
                                  playbackSpeed === speed ? "bg-zinc-400/20 text-zinc-300 font-bold" : "text-zinc-300 hover:bg-white/10"
                                )}
                              >
                                {speed === 1.0 ? "표준" : `${speed}x`}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button 
                      onClick={() => alert('플레이어 설정 메뉴를 엽니다.')}
                      className="text-white hover:text-zinc-300 transition-colors"
                    >
                      <Settings size={20} />
                    </button>
                    <button className="text-white hover:text-zinc-300 transition-colors" onClick={() => alert('전체화면으로 전환됩니다.')}>
                      <Maximize size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* TABS BELOW VIDEO */}
            <div className="mt-6 lg:mt-8 mb-12">
              <div className="flex items-center gap-6 lg:gap-8 border-b border-white/5 mb-6 overflow-x-auto custom-scrollbar px-1">
                <button 
                  onClick={() => setActiveTab('chapters')}
                  className={cn("pb-4 text-sm font-bold transition-all border-b-2", activeTab === 'chapters' ? "border-zinc-400 text-zinc-300" : "border-transparent text-zinc-500 hover:text-zinc-300")}
                >
                  목차 및 타임라인
                </button>
                <button 
                  onClick={() => setActiveTab('overview')}
                  className={cn("pb-4 text-sm font-bold transition-all border-b-2", activeTab === 'overview' ? "border-zinc-400 text-zinc-300" : "border-transparent text-zinc-500 hover:text-zinc-300")}
                >
                  강의 개요
                </button>
                <button 
                  onClick={() => setActiveTab('resources')}
                  className={cn("pb-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap", activeTab === 'resources' ? "border-zinc-400 text-zinc-300" : "border-transparent text-zinc-500 hover:text-zinc-300")}
                >
                  참고 자료
                </button>
                <button 
                  onClick={() => setActiveTab('ai-tutor')}
                  className={cn("lg:hidden pb-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap flex items-center gap-1", activeTab === 'ai-tutor' ? "border-[#FFBE98] text-[#FFBE98]" : "border-transparent text-zinc-500 hover:text-zinc-300")}
                >
                  <MessageSquare size={14} /> AI 튜터
                </button>
              </div>

              {activeTab === 'chapters' && (
                <div className="space-y-2">
                  {[
                    { time: "00:00", title: "소프트웨어 공학의 정의와 목표", active: false },
                    { time: "02:14", title: "폭포수 모델의 개념과 역사", active: true, hasQuiz: true },
                    { time: "06:30", title: "폭포수 모델의 5단계 구조", active: false },
                    { time: "10:15", title: "폭포수 모델의 장단점 및 한계", active: false },
                    { time: "13:45", title: "현대적 애자일 모델과의 비교", active: false },
                  ].map((chapter, idx) => (
                    <div 
                      key={idx} 
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl transition-all cursor-pointer border border-transparent",
                        chapter.active ? "bg-zinc-400/10 border-zinc-400/20" : "hover:bg-zinc-900/50 hover:border-white/5"
                      )}
                    >
                      <span className={cn("text-sm font-mono font-semibold", chapter.active ? "text-zinc-300" : "text-zinc-500")}>
                        {chapter.time}
                      </span>
                      <h4 className={cn("text-base font-medium flex-1", chapter.active ? "text-white" : "text-zinc-300")}>
                        {chapter.title}
                      </h4>
                      {chapter.hasQuiz && (
                        <span className="px-2 py-1 rounded bg-zinc-400/20 text-zinc-300 text-[10px] font-bold border border-zinc-400/20">
                          팝업 퀴즈 포함
                        </span>
                      )}
                      {chapter.active && (
                        <div className="w-2 h-2 bg-zinc-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="text-zinc-300 leading-relaxed p-4 bg-zinc-900/30 rounded-2xl border border-white/5">
                  <h3 className="text-lg font-bold text-white mb-4">강의 목표</h3>
                  <p className="mb-6">이 강의는 소프트웨어 공학의 가장 기본이 되는 폭포수 모델(Waterfall Model)의 개념을 이해하고, 현대 개발 방법론과 비교 분석하는 것을 목표로 합니다.</p>
                  <h3 className="text-lg font-bold text-white mb-4">핵심 키워드</h3>
                  <div className="flex flex-wrap gap-2">
                    {["소프트웨어 공학", "폭포수 모델", "요구사항 분석", "유지보수", "SDLC"].map(kw => (
                      <span key={kw} className="px-3 py-1.5 bg-zinc-800 rounded-lg text-xs font-semibold text-zinc-400">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'ai-tutor' && (
                <div className="lg:hidden h-[600px] border border-white/5 rounded-2xl overflow-hidden bg-[#080808] mb-8 shadow-lg">
                  {renderAiTutor()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: AI TUTOR CHAT (Desktop only) */}
        <div className="hidden lg:flex w-96 flex-shrink-0 border-l border-white/5 bg-[#080808] flex-col z-10">
          {renderAiTutor()}
        </div>
      </div>
    </div>
  );
}

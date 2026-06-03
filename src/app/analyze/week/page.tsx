"use client";

import { motion } from "framer-motion";
import { Sparkles, MessageSquare, Target, BrainCircuit, RefreshCcw, FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AnalyzeDashboard() {
  return (
    <div className="w-full max-w-6xl mx-auto pb-24 pt-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 mb-2">
          상호작용 및 퀴즈 분석
        </h1>
        <p className="text-zinc-500 font-medium">
          강의 중 발생한 AI 챗봇 대화 로그와 퀴즈 정답률을 종합하여 개선점을 도출합니다.
        </p>
      </motion.div>

      {/* Gemini Deep Analysis Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="metal-card p-[1px] relative overflow-hidden mb-12"
      >
        <div className="absolute inset-0 bg-gradient-gemini opacity-10" />
        <div className="bg-[#0a0a0b] rounded-[1.4rem] p-8 md:p-10 relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={20} className="text-zinc-300" />
            <span className="text-sm font-semibold tracking-widest text-gradient-gemini uppercase">
              제미나이 딥 인사이트
            </span>
            <span className="ml-auto flex items-center text-xs text-zinc-500">
              <RefreshCcw size={12} className="mr-1" /> 실시간 분석 중
            </span>
          </div>
          
          <div className="space-y-6 text-zinc-300 font-light leading-relaxed">
            <p className="text-lg">
              이번 주차 <span className="text-white font-medium">"아키텍처 설계 패턴"</span> 강의의 중간 퀴즈 정답률이 <strong className="text-zinc-400 font-medium">42%</strong>에 그쳤습니다. 
              특히 퀴즈 직후 AI 챗봇에게 접수된 질문 128건을 분석한 결과, <strong className="text-gradient-gold">"의존성 역전(Dependency Inversion)과 주입(Injection)의 차이점"</strong>을 묻는 대화가 68%를 차지했습니다.
            </p>
            <div className="flex items-start gap-4 p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
              <BrainCircuit className="text-zinc-300 mt-1 flex-shrink-0" size={20} />
              <div>
                <h4 className="text-sm font-semibold text-zinc-200 mb-2">다음 강의 기획 반영 제안</h4>
                <p className="text-sm text-zinc-400">
                  해당 두 개념의 차이를 비교하는 시각적 도표를 다음 주차 복습 슬라이드에 자동으로 추가하고, 챗봇이 유사 질문을 받을 때 사용할 맞춤형 답변(비유 포함)을 생성해 둘까요?
                </p>
                <div className="mt-4 flex gap-3">
                  <button 
                    onClick={() => alert('복습 자료가 성공적으로 자동 생성되었습니다.')}
                    className="px-4 py-2 text-xs font-semibold bg-zinc-100 text-black hover:bg-white rounded-full transition-colors"
                  >
                    예, 복습 자료 자동 생성
                  </button>
                  <button 
                    onClick={() => alert('대화 로그 원문을 불러옵니다.')}
                    className="px-4 py-2 text-xs font-semibold bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 rounded-full transition-colors"
                  >
                    대화 로그 원문 보기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 퀴즈 분석 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="metal-panel p-8 rounded-3xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                <Target size={20} className="text-zinc-300" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-200">주요 퀴즈 오답 분석</h2>
            </div>
          </div>
          
          <div className="space-y-5">
            {[
              { q: "Q3. MVC 패턴에서 Controller의 역할은?", rate: 38, isLow: true },
              { q: "Q1. 소프트웨어 아키텍처의 주된 목적은?", rate: 85, isLow: false },
              { q: "Q5. 싱글톤 패턴이 안티패턴으로 불리는 이유는?", rate: 45, isLow: true },
            ].map((quiz, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300 truncate pr-4">{quiz.q}</span>
                  <span className={cn("font-medium", quiz.isLow ? "text-zinc-400" : "text-zinc-300")}>
                    정답률 {quiz.rate}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full", quiz.isLow ? "bg-zinc-500/50" : "bg-zinc-400/50")}
                    style={{ width: `${quiz.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 챗봇 대화 로그 분석 섹션 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="metal-panel p-8 rounded-3xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700">
                <MessageSquare size={20} className="text-pink-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-200">AI 챗봇 빈출 질문</h2>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { text: "의존성 역전 원칙이 정확히 무슨 뜻인가요?", count: 42 },
              { text: "옵저버 패턴 코드 예시 좀 더 보여주세요.", count: 28 },
              { text: "과제 제출 마감일이 언제까지인가요?", count: 15 },
            ].map((msg, i) => (
              <div key={i} onClick={() => alert('상세 질문 내역을 확인합니다.')} className="flex gap-4 p-4 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-900 transition-colors cursor-pointer">
                <FileQuestion size={18} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-zinc-300 mb-1 leading-snug">"{msg.text}"</p>
                  <p className="text-xs text-zinc-500">유사 질문 {msg.count}건 발생</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

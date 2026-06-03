"use client";

import { motion } from "framer-motion";
import { UploadCloud, FileText, Database, ShieldAlert, Sparkles, Plus, Search, MoreVertical, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const knowledgeFiles = [
  { id: 1, name: "2026_소프트웨어공학_강의계획서.pdf", type: "PDF 문서", size: "2.4 MB", status: "학습 완료", date: "2026.05.28" },
  { id: 2, name: "과거_기출문제_및_모범답안.docx", type: "Word 문서", size: "1.1 MB", status: "학습 완료", date: "2026.05.29" },
  { id: 3, name: "학생_자주묻는질문_FAQ.csv", type: "데이터셋", size: "45 KB", status: "학습 중...", date: "방금 전" },
];

export default function KnowledgeBase() {
  return (
    <div className="w-full max-w-5xl mx-auto pb-24 pt-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 mb-2">
          챗봇 지식 베이스
        </h1>
        <p className="text-zinc-500 font-medium">
          강의 중 학생들이 질문할 때 참조할 기준 데이터를 주입하고, 챗봇의 행동 지침(Guardrails)을 설정합니다.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Data Upload & List */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="metal-panel p-8 rounded-3xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-zinc-200 flex items-center">
                <Database size={20} className="mr-2 text-zinc-300" /> 주입된 데이터 소스
              </h2>
              <button className="text-sm font-medium text-zinc-300 hover:text-indigo-300 transition-colors flex items-center">
                <Plus size={16} className="mr-1" /> 소스 추가
              </button>
            </div>

            {/* Drag and drop zone */}
            <div className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer bg-zinc-900/30 mb-8 group">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <UploadCloud size={28} className="text-zinc-400 group-hover:text-white transition-colors" />
              </div>
              <p className="text-sm font-medium text-zinc-300 mb-1">클릭하거나 파일을 여기로 드래그하세요</p>
              <p className="text-xs text-zinc-500">PDF, DOCX, CSV, TXT (최대 50MB)</p>
            </div>

            {/* File List */}
            <div className="space-y-3">
              {knowledgeFiles.map((file, i) => (
                <div key={file.id} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-900 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#0a0a0b] border border-white/10 flex items-center justify-center">
                      <FileText size={18} className="text-zinc-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-200 mb-0.5">{file.name}</h4>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{file.type}</span>
                        <span>•</span>
                        <span>{file.size}</span>
                        <span>•</span>
                        <span className={cn(
                          file.status === "학습 완료" ? "text-zinc-300" : "text-amber-400 animate-pulse"
                        )}>{file.status}</span>
                      </div>
                    </div>
                  </div>
                  <button className="text-zinc-600 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100">
                    <MoreVertical size={18} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right Column: Guardrails & Settings */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="metal-panel p-8 rounded-3xl"
          >
            <h2 className="text-lg font-semibold text-zinc-200 flex items-center mb-6">
              <ShieldAlert size={20} className="mr-2 text-rose-400" /> AI 가드레일 설정
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">정답 직접 제공 제한</label>
                <p className="text-xs text-zinc-500 mb-3">학생이 과제나 시험의 정답을 직접 물어볼 경우의 행동 지침</p>
                <select className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400">
                  <option>정답 대신 힌트와 관련 개념만 제공 (권장)</option>
                  <option>답변 거절 및 교수자에게 문의 유도</option>
                  <option>제한 없이 답변 제공</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">기본 답변 어조 (Tone)</label>
                <select className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400">
                  <option>친절하고 격려하는 조교 톤</option>
                  <option>객관적이고 전문적인 학자 톤</option>
                  <option>유머러스하고 친근한 선배 톤</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">커스텀 프롬프트 (System Instruction)</label>
                <textarea 
                  rows={4}
                  defaultValue="당신은 대학 소프트웨어 공학 수업의 전담 AI 조교입니다. 학생이 코딩 문제를 물어보면 코드를 짜주지 말고, 어떤 원리를 적용해야 하는지 Socratic 질문법으로 되물어보세요."
                  className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 resize-none"
                />
              </div>

              <button className="w-full py-3 bg-zinc-100 hover:bg-white text-black font-semibold rounded-xl transition-all flex items-center justify-center">
                <CheckCircle2 size={16} className="mr-2" /> 가드레일 업데이트
              </button>
            </div>
          </motion.div>

          {/* Test Chatbot */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="metal-panel p-6 rounded-3xl border-zinc-400/20"
          >
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center mb-4">
              <Sparkles size={16} className="mr-2 text-zinc-300" /> 시뮬레이션
            </h3>
            <p className="text-xs text-zinc-500 mb-4">설정된 지식 베이스와 가드레일이 잘 적용되었는지 테스트해보세요.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input 
                type="text" 
                placeholder="학생처럼 질문해보기..." 
                className="w-full bg-[#050505] border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}

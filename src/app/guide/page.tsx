"use client";

import { motion } from "framer-motion";
import { BookOpen, Search, UploadCloud, Layers, Play, CheckCircle2, LayoutGrid, FileVideo, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const guideSteps = [
  {
    id: "step1",
    title: "1. 자료 보관 및 업로드",
    description: "가지고 계신 수업 자료(PDF, 워드)를 업로드하거나 웹 문서를 스크랩하여 보관함에 모아두세요. 이 자료들이 AI 생성의 기초가 됩니다.",
    icon: UploadCloud,
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    id: "step2",
    title: "2. 프리미엄 발표 자료 생성",
    description: "모아둔 자료를 선택하고 AI 기반 '프리미엄 발표 자료 생성'을 클릭하세요. AI가 자동으로 목차를 구성하고 슬라이드를 디자인해 줍니다.",
    icon: Layers,
    color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
  {
    id: "step3",
    title: "3. 영상 타이밍 및 음성 편집",
    description: "생성된 발표 자료를 기반으로 영상 에디터를 엽니다. AI 보이스를 선택하고 대본을 수정하면, 고품질 강의 영상이 완성됩니다.",
    icon: FileVideo,
    color: "bg-[#FFBE98]/10 text-[#FFBE98] border-[#FFBE98]/20",
  },
  {
    id: "step4",
    title: "4. 클래스 배포 및 학생 확인",
    description: "완성된 영상과 퀴즈를 커리큘럼 보드에 드래그 앤 드롭으로 구성한 뒤 배포하세요. 학생들은 즉시 학습을 시작할 수 있습니다.",
    icon: Users,
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  }
];

export default function GuidebookPage() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12 lg:p-20 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-semibold mb-6 border border-emerald-500/20">
            <BookOpen size={14} /> 처음 오신 분들을 위한 가이드
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
            TeachingFlow <span className="text-zinc-500">100% 활용하기</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            단 4단계면 나만의 맞춤형 강의 영상과 커리큘럼이 완성됩니다.<br />
            아래 가이드를 따라 첫 번째 교육 자산을 만들어보세요.
          </p>
        </motion.div>

        {/* Search */}
        <div className="w-full max-w-2xl relative mb-16">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
          <input 
            type="text" 
            placeholder="궁금한 내용을 검색해보세요 (예: 영상에 자막 넣기)" 
            className="w-full bg-[#0a0a0b] border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-base text-zinc-200 focus:outline-none focus:border-[#FFBE98]/50 transition-colors shadow-inner"
          />
        </div>

        {/* Steps */}
        <div className="w-full space-y-6">
          {guideSteps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 + 0.2 }}
              className="group bg-[#0a0a0b] border border-white/5 hover:border-white/20 p-6 rounded-2xl flex flex-col md:flex-row gap-6 items-start md:items-center transition-all hover:bg-zinc-900/50 cursor-pointer"
            >
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border", step.color)}>
                <step.icon size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-zinc-100 mb-2 group-hover:text-white transition-colors">{step.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{step.description}</p>
              </div>
              <div className="hidden md:flex text-zinc-600 group-hover:text-zinc-400 transition-colors">
                자세히 보기 &rarr;
              </div>
            </motion.div>
          ))}
        </div>

        {/* Need Help? */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="w-full mt-20 p-8 rounded-3xl bg-gradient-to-br from-zinc-900 to-black border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div>
            <h3 className="text-xl font-bold text-white mb-2">더 도움이 필요하신가요?</h3>
            <p className="text-zinc-400 text-sm">전문 지원팀이 대기하고 있습니다. 실시간 채팅으로 문의해주세요.</p>
          </div>
          <button className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors shadow-lg whitespace-nowrap">
            1:1 채팅 문의
          </button>
        </motion.div>
      </div>
    </div>
  );
}

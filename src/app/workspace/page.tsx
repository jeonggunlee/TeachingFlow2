"use client";

import { motion } from "framer-motion";
import { Plus, Edit3, Film, Clock, Presentation } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function WorkspacePage() {
  const router = useRouter();

  const recentDrafts = [
    { id: 1, title: "소프트웨어 공학 개론 - 가편집", type: "video", date: "10분 전 수정", status: "editing" },
    { id: 2, title: "디자인 패턴: Singleton", type: "slide", date: "1일 전 생성", status: "draft" }
  ];

  return (
    <div className="w-full h-full p-4 md:p-8 lg:p-12 overflow-y-auto bg-[#050505]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col mb-10 gap-2"
      >
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-100">
          작업실
        </h1>
        <p className="text-sm md:text-base text-zinc-500 font-medium">
          현재 작업 중인 프로젝트를 이어서 편집하거나 새로운 작업을 시작하세요.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* 새 발표 자료 만들기 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="group relative"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFBE98]/20 to-transparent rounded-3xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
          <Link href="/create" className="block h-full">
            <div className="relative h-full bg-[#0a0a0b] border border-white/5 hover:border-[#FFBE98]/30 rounded-3xl p-6 flex flex-col justify-between transition-colors z-10 cursor-pointer">
              <div>
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-4 text-[#FFBE98]">
                  <Presentation size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">발표 자료 생성 및 에디터</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  AI와 함께 목차와 테마를 구성하고, 슬라이드 내의 디자인과 텍스트 내용을 편집하는 역할의 에디터입니다.
                </p>
              </div>
              <div className="mt-8 flex items-center text-sm font-bold text-[#FFBE98] group-hover:translate-x-2 transition-transform">
                초안 만들기 <Plus size={16} className="ml-1" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* 빈 비디오 에디터 열기 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="group relative"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent rounded-3xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
          <Link href="/create/video-editor" className="block h-full">
            <div className="relative h-full bg-[#0a0a0b] border border-white/5 hover:border-indigo-500/30 rounded-3xl p-6 flex flex-col justify-between transition-colors z-10 cursor-pointer">
              <div>
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-4 text-indigo-400">
                  <Film size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">발표 영상 제작 에디터</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  작성된 발표 자료를 기반으로 AI 나레이션을 입히고, 애니메이션과 컷 타이밍을 세밀하게 편집하여 영상을 완성하는 역할입니다.
                </p>
              </div>
              <div className="mt-8 flex items-center text-sm font-bold text-indigo-400 group-hover:translate-x-2 transition-transform">
                영상 에디터 열기 <Plus size={16} className="ml-1" />
              </div>
            </div>
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <h2 className="text-lg font-semibold tracking-tight text-white mb-6 flex items-center">
          <Clock size={18} className="mr-2 text-zinc-500" /> 최근 작업 중인 파일
        </h2>
        
        <div className="flex flex-col gap-3">
          {recentDrafts.map((draft, i) => (
            <div 
              key={draft.id}
              onClick={() => router.push(draft.type === 'video' ? '/create/video-editor' : '/create/slide-editor')}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#0a0a0b] border border-white/5 hover:border-white/20 rounded-2xl cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center border",
                  draft.type === 'video' ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-[#FFBE98]/10 border-[#FFBE98]/20 text-[#FFBE98]"
                )}>
                  {draft.type === 'video' ? <Film size={18} /> : <Presentation size={18} />}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{draft.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">{draft.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest bg-zinc-900 px-3 py-1.5 rounded border border-white/5">
                  {draft.type === 'video' ? '발표 영상 에디터' : '발표 자료 에디터'}
                </span>
                <button className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors">
                  <Edit3 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, BookOpen, Folder, CheckCircle2, Video, GripVertical, Search, MoreVertical, LayoutGrid, List, Play, Pencil, Rocket, ChevronDown, Upload, Check, X, UploadCloud, Link as LinkIcon, FileText, Monitor, Layers, Sparkles, Filter } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Types
type ItemType = "presentation" | "quiz" | "document" | "video";

interface AssetItem {
  id: string;
  type: ItemType;
  title: string;
  sources: number;
  date: string;
}

interface WeekCurriculum {
  week: number;
  title: string;
  items: AssetItem[];
}

export default function DashboardHome() {
  const router = useRouter();
  const [draggedItem, setDraggedItem] = useState<{ item: AssetItem; sourceId: 'pool' | number } | null>(null);
  const [dragOverWeek, setDragOverWeek] = useState<number | null>(null);
  const [resourceFilter, setResourceFilter] = useState<string>("all");

  // Initial State Data
  const [resources, setResources] = useState<AssetItem[]>([
    { id: 'r1', type: 'presentation', title: '운영체제 중간고사 대비 특강', sources: 5, date: '방금 전 (AI 생성)' },
    { id: 'r2', type: 'video', title: '알고리즘 정렬 기초 해설', sources: 12, date: '2시간 전 (AI 생성)' },
    { id: 'r3', type: 'document', title: '강의 계획서 및 평가 기준.pdf', sources: 0, date: '1일 전 (업로드)' },
    { id: 'r4', type: 'document', title: '팀 프로젝트 과제 명세서.docx', sources: 0, date: '3일 전 (업로드)' },
    { id: 'r5', type: 'presentation', title: '디자인 패턴: Singleton', sources: 3, date: '4일 전 (AI 생성)' },
  ]);

  // Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState("소프트웨어 공학 개론 (2026-1)");
  const [classes, setClasses] = useState(["소프트웨어 공학 개론 (2026-1)", "알고리즘 및 자료구조 (2026-1)", "운영체제 실무 (2026-1)"]);
  const [newClassName, setNewClassName] = useState("");
  const [newWeekTitle, setNewWeekTitle] = useState("");

  // Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [weekModalOpen, setWeekModalOpen] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [systemAlert, setSystemAlert] = useState({ isOpen: false, message: '' });

  // Helper
  const formatTypeToKorean = (type: string) => {
    if (type === 'presentation') return '프레젠테이션';
    if (type === 'video') return '비디오';
    if (type === 'document') return '문서';
    return type;
  };

  const [curriculum, setCurriculum] = useState<WeekCurriculum[]>([
    {
      week: 1,
      title: '소프트웨어 공학의 이해',
      items: [
        { id: 'c1', type: 'presentation', title: '소프트웨어 공학 개론 팀플', sources: 29, date: '2026. 6. 2.' },
        { id: 'c2', type: 'quiz', title: '1주차 핵심 개념 퀴즈', sources: 2, date: '2026. 6. 3.' }
      ]
    },
    {
      week: 2,
      title: '개발 프로세스와 방법론',
      items: [
        { id: 'c3', type: 'presentation', title: '폭포수 모델과 애자일 비교', sources: 15, date: '2026. 6. 9.' }
      ]
    },
    {
      week: 3,
      title: '요구사항 분석과 명세',
      items: []
    }
  ]);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, item: AssetItem, sourceId: 'pool' | number) => {
    setDraggedItem({ item, sourceId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, weekId: number | 'pool') => {
    e.preventDefault();
    if (typeof weekId === 'number') {
      setDragOverWeek(weekId);
    } else {
      setDragOverWeek(null);
    }
  };

  const handleDragLeave = () => {
    setDragOverWeek(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: 'pool' | number) => {
    e.preventDefault();
    setDragOverWeek(null);

    if (!draggedItem) return;

    const { item, sourceId } = draggedItem;

    if (sourceId === targetId) return;

    if (sourceId === 'pool') {
      setResources(prev => prev.filter(r => r.id !== item.id));
    } else {
      setCurriculum(prev => prev.map(week => {
        if (week.week === sourceId) {
          return { ...week, items: week.items.filter(i => i.id !== item.id) };
        }
        return week;
      }));
    }

    if (targetId === 'pool') {
      setResources(prev => [item, ...prev]);
    } else {
      setCurriculum(prev => prev.map(week => {
        if (week.week === targetId) {
          return { ...week, items: [...week.items, item] };
        }
        return week;
      }));
    }

    setDraggedItem(null);
  };

  const renderIcon = (type: ItemType) => {
    switch (type) {
      case 'presentation': return <BookOpen size={16} className="text-[#FFBE98]" />;
      case 'video': return <Video size={16} className="text-zinc-300" />;
      case 'quiz': return <CheckCircle2 size={16} className="text-zinc-400" />;
      case 'document': return <Folder size={16} className="text-zinc-500" />;
      default: return <Folder size={16} />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden bg-[#050505]">

      {/* LEFT PANE: Resource Pool */}
      <div
        className="w-full lg:w-[400px] flex-shrink-0 bg-[#080808] border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col h-[50vh] lg:h-full z-10"
        onDragOver={(e) => handleDragOver(e, 'pool')}
        onDrop={(e) => handleDrop(e, 'pool')}
      >
        <div className="p-8 border-b border-white/5 bg-[#0a0a0b] flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 mb-1 tracking-tight">보관함</h2>
            <p className="text-xs font-medium text-zinc-500">생성된 영상 및 업로드 자료 보관소</p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
              <input
                type="text"
                onKeyDown={(e) => { if (e.key === 'Enter') setSystemAlert({ isOpen: true, message: '리소스 검색 중...' }); }}
                placeholder="리소스 검색..."
                className="w-full bg-[#050505] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#FFBE98]/50 transition-colors"
              />
            </div>
            <div className="relative group flex-shrink-0">
              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                className="h-full appearance-none bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg pl-3 pr-8 border border-zinc-700 focus:outline-none focus:border-[#FFBE98]/50 transition-colors cursor-pointer"
              >
                <option value="all">모든 포맷</option>
                <option value="presentation">프레젠테이션</option>
                <option value="video">비디오</option>
                <option value="document">문서</option>
              </select>
              <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={12} />
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg w-9 border border-zinc-700 transition-colors flex-shrink-0"
              title="파일 업로드"
            >
              <Upload size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-3">
          {resources.filter(item => resourceFilter === 'all' || item.type === resourceFilter).length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm font-medium text-zinc-600 border-2 border-dashed border-white/5 rounded-xl">
              보관함이 비어있습니다.
            </div>
          ) : (
            resources.filter(item => resourceFilter === 'all' || item.type === resourceFilter).map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item, 'pool')}
                className="relative bg-[#0a0a0b] border border-white/5 hover:border-white/20 p-4 rounded-xl cursor-grab active:cursor-grabbing flex gap-3 transition-all group shadow-sm hover:shadow-md overflow-hidden"
              >
                <div className="mt-1 text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  <GripVertical size={16} />
                </div>
                <div className="flex-1 min-w-0 pr-16">
                  <div className="flex items-center gap-2 mb-1.5">
                    {renderIcon(item.type)}
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{formatTypeToKorean(item.type)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-1 truncate group-hover:text-[#FFBE98] transition-colors">{item.title}</h3>
                  <p className="text-[10px] text-zinc-500 font-medium">참고자료 {item.sources}개 • {item.date}</p>
                </div>

                {/* Hover Actions */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-[#0a0a0b] via-[#0a0a0b] to-transparent pl-4 py-2 rounded-r-lg">
                  {item.type === 'video' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push('/play'); }}
                      className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                      title="재생하기"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push('/create/editor'); }}
                    className="p-2 text-zinc-400 hover:text-[#FFBE98] hover:bg-[#FFBE98]/10 rounded-md transition-colors"
                    title="수정하기"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANE: Curriculum Board */}
      <div className="flex-1 flex flex-col min-h-[60vh] lg:h-full bg-[#050505] overflow-hidden">
        <div className="p-4 lg:p-8 pb-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-[#0a0a0b]/50 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 bg-transparent text-2xl font-bold tracking-tight text-zinc-100 focus:outline-none cursor-pointer hover:text-[#FFBE98] transition-colors"
                >
                  {selectedClass}
                  <ChevronDown size={20} className={cn("text-zinc-400 transition-transform", isDropdownOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-2 w-[320px] bg-[#121214] border border-white/10 rounded-xl shadow-2xl py-2 z-50 overflow-hidden"
                    >
                      {classes.map(cls => (
                        <button
                          key={cls}
                          onClick={() => { setSelectedClass(cls); setIsDropdownOpen(false); }}
                          className="w-full text-left px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white flex items-center justify-between transition-colors"
                        >
                          {cls}
                          {selectedClass === cls && <Check size={16} className="text-[#FFBE98]" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                onClick={() => setClassModalOpen(true)}
                className="ml-3 px-3 py-1.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-[#FFBE98] text-xs font-semibold rounded-full transition-all border border-zinc-800 hover:border-[#FFBE98]/30 shadow-sm flex items-center gap-1.5"
              >
                <Plus size={12} /> 새 클래스
              </button>
            </div>
            <p className="text-sm font-medium text-zinc-400 mt-2">
              라이브러리에서 리소스를 드래그하여 직관적으로 주차별 교육 과정을 설계하세요.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWeekModalOpen(true)}
              className="px-5 py-2.5 bg-zinc-800/50 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 font-semibold rounded-xl transition-all flex items-center shadow-sm text-sm group"
            >
              <div className="w-7 h-7 rounded-lg bg-zinc-900 group-hover:bg-zinc-800 flex items-center justify-center mr-2.5 transition-colors border border-white/5">
                <Plus size={14} className="text-zinc-400 group-hover:text-white transition-colors" />
              </div>
              새 모듈 추가
            </button>
            <button
              onClick={() => setDeployModalOpen(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-white hover:opacity-90 font-bold rounded-xl transition-opacity flex items-center shadow-[0_0_20px_rgba(16,185,129,0.3)] text-sm tracking-wide"
            >
              <Rocket size={16} className="mr-2" /> 교육 과정 배포
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto flex flex-col gap-6">



            {curriculum.map((week) => (
              <div
                key={week.week}
                onDragOver={(e) => handleDragOver(e, week.week)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, week.week)}
                className={cn(
                  "flex flex-col border rounded-2xl overflow-hidden transition-all duration-300 shadow-sm",
                  dragOverWeek === week.week
                    ? "bg-[#FFBE98]/5 border-[#FFBE98]/50 ring-2 ring-[#FFBE98]/20"
                    : "bg-[#0a0a0b] border-white/5"
                )}
              >
                {/* Week Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#050505]/30">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-300 font-bold text-sm border border-white/5 shadow-inner">
                      {week.week}주
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
                        {week.title}
                      </h2>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                        배치된 자료 {week.items.length}개
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSystemAlert({ isOpen: true, message: '주차별 옵션 메뉴를 엽니다.' })}
                    className="text-zinc-500 hover:text-zinc-300 p-2 transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>

                {/* Drop Zone / Items List */}
                <div className="p-4 min-h-[120px] flex flex-col gap-3">
                  {week.items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-[#050505]/50 text-zinc-600 pointer-events-none">
                      <Plus size={24} className="mb-2 text-zinc-700" />
                      <span className="text-sm font-medium">여기로 자료를 드래그 앤 드롭 하세요</span>
                    </div>
                  ) : (
                    week.items.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item, week.week)}
                        className="group relative flex items-center gap-4 bg-[#050505] border border-white/5 hover:border-white/20 p-4 rounded-xl cursor-grab active:cursor-grabbing transition-all shadow-sm overflow-hidden"
                      >
                        <div className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                          <GripVertical size={16} />
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/5 transition-colors">
                          {renderIcon(item.type)}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{item.title}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase">{formatTypeToKorean(item.type)}</span>
                            <span className="text-[10px] text-zinc-600">•</span>
                            <span className="text-[10px] text-zinc-500">참고 {item.sources}</span>
                          </div>
                        </div>
                        <div className="text-[10px] font-medium text-zinc-600 pr-16 group-hover:pr-20 transition-all">
                          {item.date}
                        </div>

                        {/* Hover Actions in Curriculum Item */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-[#050505] via-[#050505] to-transparent pl-4 py-2 rounded-r-lg">
                          {item.type === 'video' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push('/play'); }}
                              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                              title="재생하기"
                            >
                              <Play size={14} fill="currentColor" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push('/create/editor'); }}
                            className="p-2 text-zinc-400 hover:text-[#FFBE98] hover:bg-[#FFBE98]/10 rounded-md transition-colors"
                            title="수정하기"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsUploadModalOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#0a0a0b] border border-white/10 rounded-[2rem] shadow-2xl relative z-10 overflow-hidden"
            >
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="p-10 pb-6 text-center">
                <h2 className="text-2xl font-bold text-zinc-100 mb-2">
                  <span className="text-zinc-300">내 보관함</span>에 자료 추가
                </h2>
                <p className="text-sm text-zinc-400">자료를 검색하거나 파일을 직접 끌어다 놓으세요.</p>
              </div>

              <div className="px-10 pb-10">
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input
                    type="text"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setIsUploadModalOpen(false);
                        setResources(prev => [{ id: Date.now().toString(), type: "document", title: "검색된_자료.pdf", sources: 0, date: "방금 전 (업로드)" }, ...prev]);
                      }
                    }}
                    placeholder="관련 자료나 링크 검색 후 엔터..."
                    className="w-full bg-[#050505] border border-zinc-400/50 rounded-2xl pl-12 pr-4 py-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#FFBE98]/50 transition-all shadow-[0_0_20px_rgba(255,190,152,0.1)]"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="px-3 py-1 bg-zinc-800 rounded-md text-[10px] font-semibold text-zinc-400 flex items-center"><Search size={10} className="mr-1" /> 빠른 검색</span>
                  </div>
                </div>

                <div className="border-2 border-dashed border-zinc-800 hover:border-zinc-600 rounded-3xl p-12 text-center transition-colors bg-[#050505]">
                  <p className="text-base font-semibold text-zinc-300 mb-2">파일 드롭하기</p>
                  <p className="text-xs text-zinc-500 mb-8">PDF, 이미지, 워드문서, 오디오 파일 등</p>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        setIsUploadModalOpen(false);
                        setResources(prev => [{ id: Date.now().toString(), type: "document", title: "업로드된_문서.docx", sources: 0, date: "방금 전 (업로드)" }, ...prev]);
                      }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <UploadCloud size={14} className="mr-2" /> 파일 업로드
                    </button>
                    <button
                      onClick={() => {
                        setIsUploadModalOpen(false);
                        setResources(prev => [{ id: Date.now().toString(), type: "document", title: "웹_스크랩.html", sources: 0, date: "방금 전 (업로드)" }, ...prev]);
                      }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <LinkIcon size={14} className="mr-2" /> 웹페이지
                    </button>
                    <button
                      onClick={() => {
                        setIsUploadModalOpen(false);
                        setResources(prev => [{ id: Date.now().toString(), type: "document", title: "텍스트_노트.txt", sources: 0, date: "방금 전 (업로드)" }, ...prev]);
                      }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <FileText size={14} className="mr-2" /> 텍스트 붙여넣기
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Action Modals */}
      <AnimatePresence>
        {classModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setClassModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5]" />
              <div className="p-8">
                <div className="w-12 h-12 bg-[#FFBE98]/10 rounded-2xl flex items-center justify-center mb-6 border border-[#FFBE98]/20">
                  <Monitor size={24} className="text-[#FFBE98]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">새로운 클래스 개설</h2>
                <p className="text-sm text-zinc-400 mb-8 leading-relaxed">수업을 진행할 새로운 클래스의 이름을 입력해주세요.</p>

                <div className="space-y-2 mb-8">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">클래스 이름</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="예: 자료구조 2026-2"
                    className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FFBE98]/50 focus:border-transparent transition-all shadow-inner"
                  />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => { setClassModalOpen(false); setNewClassName(''); }} className="flex-1 py-3.5 text-sm font-semibold text-zinc-400 hover:text-white transition-colors bg-black/50 hover:bg-black/70 rounded-xl border border-white/5">취소</button>
                  <button
                    onClick={() => {
                      if (newClassName.trim()) {
                        setClasses([...classes, newClassName]);
                        setSelectedClass(newClassName);
                      }
                      setClassModalOpen(false);
                      setNewClassName('');
                    }}
                    className="flex-1 py-3.5 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5] hover:opacity-90 text-[#050505] font-bold text-sm rounded-xl transition-opacity shadow-lg"
                  >
                    개설하기
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {weekModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setWeekModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5]" />
              <div className="p-8">
                <div className="w-12 h-12 bg-[#FFBE98]/10 rounded-2xl flex items-center justify-center mb-6 border border-[#FFBE98]/20">
                  <Layers size={24} className="text-[#FFBE98]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">새 주차 추가</h2>
                <p className="text-sm text-zinc-400 mb-8 leading-relaxed">커리큘럼에 새로운 주차 모듈을 추가합니다.</p>

                <div className="space-y-2 mb-8">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">모듈 타이틀</label>
                  <input
                    type="text"
                    value={newWeekTitle}
                    onChange={(e) => setNewWeekTitle(e.target.value)}
                    placeholder="예: 5주차 - 메모리 계층 구조"
                    className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FFBE98]/50 focus:border-transparent transition-all shadow-inner"
                  />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => { setWeekModalOpen(false); setNewWeekTitle(''); }} className="flex-1 py-3.5 text-sm font-semibold text-zinc-400 hover:text-white transition-colors bg-black/50 hover:bg-black/70 rounded-xl border border-white/5">취소</button>
                  <button
                    onClick={() => {
                      if (newWeekTitle.trim()) {
                        setCurriculum([...curriculum, {
                          week: curriculum.length + 1,
                          title: newWeekTitle,
                          items: []
                        }]);
                      }
                      setWeekModalOpen(false);
                      setNewWeekTitle('');
                    }}
                    className="flex-1 py-3.5 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5] hover:opacity-90 text-[#050505] font-bold text-sm rounded-xl transition-opacity shadow-lg"
                  >
                    추가하기
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deployModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeployModalOpen(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-md bg-[#0a0a0b] border border-white/10 rounded-[2rem] shadow-2xl relative z-10 p-8 text-center">
              <div className="w-16 h-16 bg-[#FFBE98]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Rocket size={32} className="text-[#FFBE98]" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">커리큘럼 배포</h2>
              <p className="text-sm text-zinc-400 mb-8 leading-relaxed">구성된 커리큘럼을 학생들에게 배포하시겠습니까?<br />배포된 강의는 학생 뷰에서 즉시 시청할 수 있습니다.</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setDeployModalOpen(false)} className="px-6 py-3 text-sm font-semibold text-zinc-400 hover:text-white transition-colors bg-zinc-900 rounded-xl">취소</button>
                <button onClick={() => { setDeployModalOpen(false); router.push('/learn'); }} className="px-6 py-3 bg-[#FFBE98] text-[#050505] font-bold text-sm rounded-xl hover:bg-[#FCA5A5] transition-colors shadow-[0_0_20px_rgba(255,190,152,0.2)]">배포 및 확인</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global System Alert Modal */}
      <AnimatePresence>
        {systemAlert.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSystemAlert(prev => ({ ...prev, isOpen: false }))} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-[#0a0a0b] border border-white/10 p-6 rounded-2xl shadow-xl max-w-sm w-full">
              <p className="text-zinc-200 text-sm mb-4">{systemAlert.message}</p>
              <button onClick={() => setSystemAlert(prev => ({ ...prev, isOpen: false }))} className="w-full py-2 bg-[#FFBE98] text-black font-bold rounded-lg text-xs">확인</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

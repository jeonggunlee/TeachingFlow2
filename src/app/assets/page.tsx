"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Download, Edit3, Share2, FileVideo, FileText, CheckCircle2, X, Search, UploadCloud, Link as LinkIcon, Eye, Film, Presentation, Filter, ZoomIn, ZoomOut, Maximize, MessageSquare, List, Sparkles, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function LibraryPage() {
  const router = useRouter();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [videoTargetModalOpen, setVideoTargetModalOpen] = useState(false);
  const [formatFilter, setFormatFilter] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [myLibrary, setMyLibrary] = useState([
    { id: 1, title: "운영체제 중간고사 대비 특강", format: "프레젠테이션", date: "방금 전 (AI 생성)", status: "published" },
    { id: 2, title: "알고리즘 정렬 기초 해설", format: "비디오", date: "2시간 전 (AI 생성)", status: "published" },
    { id: 3, title: "강의 계획서 및 평가 기준.pdf", format: "문서", date: "1일 전 (업로드)", status: "published" },
    { id: 4, title: "팀 프로젝트 과제 명세서.docx", format: "문서", date: "3일 전 (업로드)", status: "published" },
    { id: 5, title: "디자인 패턴: Singleton", format: "초안", date: "4일 전 (AI 생성)", status: "draft" }
  ]);

  const handleItemClick = (item: any) => {
    if (item.format === '문서') {
      setSelectedDoc(item);
      setDocModalOpen(true);
    } else if (item.format === '프레젠테이션' || item.format === '초안') {
      router.push('/create/slide-editor');
    } else if (item.format === '비디오') {
      router.push('/play');
    }
  };

  return (
    <div className="w-full h-full p-4 md:p-8 lg:p-12 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-100 mb-2">
            보관함
          </h1>
          <p className="text-sm md:text-base text-zinc-500 font-medium">
            지금까지 AI와 함께 제작한 모든 자료와 영상을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative group flex-shrink-0">
            <select 
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="appearance-none bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-semibold rounded-full px-5 py-2.5 pr-10 border border-zinc-800 focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer shadow-sm"
            >
              <option value="all">모든 포맷</option>
              <option value="프레젠테이션">프레젠테이션</option>
              <option value="비디오">비디오</option>
              <option value="초안">초안</option>
              <option value="문서">문서</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
          </div>
          <button 
            onClick={() => setVideoTargetModalOpen(true)}
            className="w-full sm:w-auto px-6 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold rounded-full transition-all flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.3)] whitespace-nowrap"
          >
            새 영상 제작 <Film size={16} className="ml-2" />
          </button>
          <Link href="/create" className="flex-1 sm:flex-none">
            <button className="w-full px-6 py-2.5 bg-zinc-100 hover:bg-white text-black text-sm font-semibold rounded-full transition-all flex items-center justify-center whitespace-nowrap">
              자료 생성 <Presentation size={16} className="ml-2" />
            </button>
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="overflow-x-auto pb-4"
      >
        <div className="min-w-[800px]">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            <div className="col-span-5">타이틀</div>
            <div className="col-span-2 text-center">포맷</div>
            <div className="col-span-2 text-center">상태</div>
            <div className="col-span-3 text-right">액션</div>
          </div>

          <div className="flex flex-col mt-2 space-y-2">
            {myLibrary.filter(item => formatFilter === 'all' || item.format === formatFilter).length === 0 && (
              <div className="text-center py-12 text-zinc-500 font-medium">
                해당 필터에 맞는 자료가 없습니다.
              </div>
            )}
            {myLibrary.filter(item => formatFilter === 'all' || item.format === formatFilter).map((item, i) => (
              <motion.div
                key={item.id}
                onClick={() => handleItemClick(item)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.3 }}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center group rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/10 hover:bg-zinc-900/80 transition-all cursor-pointer"
              >
                <div className="col-span-5 flex items-center gap-4">
                  <div className="relative flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#0a0a0b] border border-white/10 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                    {item.status === 'draft' ? (
                      <FileText size={18} className="text-zinc-500" />
                    ) : (
                      <FileVideo size={18} className="text-zinc-300" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm md:text-base font-medium text-zinc-200 mb-1 group-hover:text-white transition-colors line-clamp-1">{item.title}</h3>
                    <span className="text-xs text-zinc-500">최종 수정: {item.date}</span>
                  </div>
                </div>

                <div className="col-span-2 flex justify-center">
                  <span className="text-[10px] md:text-xs font-medium text-zinc-400 bg-zinc-800 px-3 py-1 rounded-full border border-zinc-700 whitespace-nowrap">
                    {item.format}
                  </span>
                </div>

                <div className="col-span-2 flex justify-center">
                  {item.status === 'published' ? (
                    <span className="flex items-center text-[10px] md:text-xs font-medium text-zinc-300 bg-zinc-300/10 px-3 py-1 rounded-full border border-zinc-400/20 whitespace-nowrap">
                      <CheckCircle2 size={12} className="mr-1 hidden md:block" /> 배포 완료
                    </span>
                  ) : (
                    <span className="flex items-center text-[10px] md:text-xs font-medium text-zinc-400 bg-zinc-800/50 px-3 py-1 rounded-full border border-zinc-700/50 whitespace-nowrap">
                      작업 중
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex items-center justify-end gap-1 md:gap-2 text-zinc-500">
                  {item.format === '비디오' && (
                    <button onClick={(e) => { e.stopPropagation(); router.push('/play'); }} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center shadow-sm" title="영상 재생">
                      <Play size={18} fill="currentColor" className="text-white" />
                    </button>
                  )}
                  
                  {(item.format === '프레젠테이션' || item.format === '초안') && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); router.push('/create/video-editor'); }} className="p-2 text-zinc-400 hover:text-[#FFBE98] hover:bg-white/5 rounded-lg transition-colors hidden sm:block" title="영상으로 만들기">
                        <Film size={18} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); router.push('/create/slide-editor'); }} className="p-2 hover:text-white hover:bg-white/5 rounded-lg transition-colors hidden sm:block" title="발표 자료 편집">
                        <Edit3 size={18} />
                      </button>
                    </>
                  )}

                  {item.format === '문서' && (
                    <button onClick={(e) => { e.stopPropagation(); handleItemClick(item); }} className="p-2 hover:text-white hover:bg-white/5 rounded-lg transition-colors hidden sm:block" title="문서 읽기">
                      <Eye size={18} />
                    </button>
                  )}

                  <button className="p-2 hover:text-white hover:bg-white/5 rounded-lg transition-colors hidden sm:block" title="다운로드" onClick={(e) => { e.stopPropagation(); alert('다운로드가 시작되었습니다.'); }}>
                    <Download size={18} />
                  </button>
                  <button className="p-2 hover:text-white hover:bg-white/5 rounded-lg transition-colors hidden md:block" title="공유하기" onClick={(e) => { e.stopPropagation(); alert('공유 링크가 클립보드에 복사되었습니다.'); }}>
                    <Share2 size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

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
                      if(e.key === 'Enter') { 
                        setIsUploadModalOpen(false); 
                        setMyLibrary(prev => [{ id: Date.now(), title: "검색된_자료.pdf", format: "문서", date: "방금 전 (업로드)", status: "published" }, ...prev]); 
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
                        setMyLibrary(prev => [{ id: Date.now(), title: "업로드된_문서.docx", format: "문서", date: "방금 전 (업로드)", status: "published" }, ...prev]); 
                      }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <UploadCloud size={14} className="mr-2" /> 파일 업로드
                    </button>
                    <button 
                      onClick={() => { 
                        setIsUploadModalOpen(false); 
                        setMyLibrary(prev => [{ id: Date.now(), title: "웹_스크랩.html", format: "문서", date: "방금 전 (업로드)", status: "published" }, ...prev]); 
                      }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <LinkIcon size={14} className="mr-2" /> 웹페이지
                    </button>
                    <button 
                      onClick={() => { 
                        setIsUploadModalOpen(false); 
                        setMyLibrary(prev => [{ id: Date.now(), title: "텍스트_노트.txt", format: "문서", date: "방금 전 (업로드)", status: "published" }, ...prev]); 
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

      {/* Premium Document Viewer Modal */}
      <AnimatePresence>
        {docModalOpen && selectedDoc && (
          <div className="fixed inset-0 z-50 flex flex-col">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-[#050505] z-0"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full h-full relative z-10 flex flex-col"
            >
              {/* Top Navigation Bar */}
              <div className="h-16 border-b border-white/5 bg-[#0a0a0b] flex items-center justify-between px-4 lg:px-6 flex-shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setDocModalOpen(false)}
                    className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex items-center"
                  >
                    <ChevronLeft size={20} className="mr-1" />
                    <span className="text-sm font-semibold hidden sm:inline">보관함</span>
                  </button>
                  <div className="h-4 w-px bg-white/10 hidden sm:block" />
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FFBE98]/10 flex items-center justify-center border border-[#FFBE98]/20">
                      <FileText size={16} className="text-[#FFBE98]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white leading-tight">{selectedDoc.title}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500 font-medium">마지막 수정: {selectedDoc.date}</span>
                        <span className="px-1.5 py-0.5 rounded-sm bg-zinc-800 text-[9px] text-zinc-400 font-bold uppercase tracking-wider border border-zinc-700">READ-ONLY</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden md:flex items-center gap-1 bg-[#050505] border border-white/10 rounded-lg p-1 mr-4">
                    <button className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" title="축소"><ZoomOut size={16} /></button>
                    <span className="text-xs font-semibold text-zinc-300 px-2 min-w-[3rem] text-center">100%</span>
                    <button className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" title="확대"><ZoomIn size={16} /></button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" title="화면에 맞춤"><Maximize size={16} /></button>
                  </div>
                  <button className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors hidden sm:block" title="공유">
                    <Share2 size={18} />
                  </button>
                  <button className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors hidden sm:block" title="다운로드">
                    <Download size={18} />
                  </button>
                  <button className="px-4 py-2 bg-[#FFBE98] hover:bg-[#FCA5A5] text-[#050505] text-sm font-bold rounded-lg transition-colors flex items-center shadow-lg shadow-[#FFBE98]/20">
                    <Edit3 size={16} className="mr-2" /> 편집기로 열기
                  </button>
                </div>
              </div>

              {/* Main Viewer Area */}
              <div className="flex-1 flex overflow-hidden">
                
                {/* Left Sidebar: Outline (TOC) */}
                <div className="w-64 border-r border-white/5 bg-[#080808] hidden lg:flex flex-col flex-shrink-0">
                  <div className="h-12 border-b border-white/5 flex items-center px-4 bg-[#0a0a0b]">
                    <List size={16} className="text-zinc-400 mr-2" />
                    <h3 className="text-xs font-bold text-zinc-300">목차 (Outline)</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1">
                    {['1. 개요 및 목적', '2. 핵심 개념 정의', '3. 세부 설계 및 구조', '3.1. 모듈 분석', '3.2. 데이터 흐름', '4. 결론 및 향후 과제'].map((toc, idx) => (
                      <div 
                        key={idx}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                          idx === 0 ? "bg-white/5 text-white" : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300",
                          toc.startsWith('3.') && !toc.startsWith('3. ') ? "ml-4 text-[11px]" : ""
                        )}
                      >
                        {toc}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Center Canvas: A4 Document */}
                <div className="flex-1 bg-[#111] overflow-y-auto p-4 sm:p-8 flex justify-center custom-scrollbar relative">
                  <div className="w-full max-w-4xl bg-white rounded-sm shadow-2xl flex flex-col my-auto relative group">
                    
                    {/* A4 Proportion Container */}
                    <div className="w-full min-h-[1056px] p-12 sm:p-20 flex flex-col text-black">
                      <h1 className="text-4xl font-bold mb-8 text-gray-900 tracking-tight leading-tight border-b-2 border-gray-100 pb-6">
                        {selectedDoc.title.replace(/\.[^/.]+$/, "")}
                      </h1>
                      
                      <div className="prose prose-sm sm:prose-base prose-slate max-w-none flex-1">
                        <p className="lead text-gray-500 font-medium text-lg mb-8">
                          본 문서는 TeachingFlow AI 파트너를 통해 <strong>{selectedDoc.date}</strong>에 자동 요약 및 생성된 분석 리포트입니다. 
                        </p>
                        
                        <h2 className="text-2xl font-bold text-gray-800 mt-10 mb-4">1. 개요 및 목적</h2>
                        <p className="text-gray-600 leading-relaxed mb-6">
                          소프트웨어 엔지니어링에서 요구사항 분석과 아키텍처 설계는 전체 프로젝트의 성패를 가르는 핵심적인 단계입니다. 본 문서는 현재 다루고 있는 주제에 대한 포괄적인 이해를 돕기 위해 작성되었습니다.
                        </p>
                        
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 my-8">
                          <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <Sparkles size={18} className="text-indigo-500 mr-2" />
                            AI 핵심 요약 노트
                          </h3>
                          <ul className="list-disc pl-5 space-y-2 text-gray-600 font-medium">
                            <li>시스템의 복잡도를 낮추기 위한 모듈화 전략이 필수적입니다.</li>
                            <li>초기 단계에서의 리스크 식별이 전체 비용을 40% 이상 절감할 수 있습니다.</li>
                            <li>지속적인 통합(CI) 파이프라인 구축이 권장됩니다.</li>
                          </ul>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-800 mt-10 mb-4">2. 세부 설계 및 구조</h2>
                        <p className="text-gray-600 leading-relaxed mb-6">
                          아래 표는 각 컴포넌트별 주요 책임과 예상 산출물을 정리한 내용입니다. 시스템은 크게 3개의 계층으로 분리되어 독립적으로 배포될 수 있도록 설계되었습니다.
                        </p>

                        <table className="w-full text-left border-collapse my-8">
                          <thead>
                            <tr className="bg-gray-100 text-gray-700">
                              <th className="p-3 border border-gray-200 font-bold">컴포넌트</th>
                              <th className="p-3 border border-gray-200 font-bold">주요 책임</th>
                              <th className="p-3 border border-gray-200 font-bold">우선순위</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-600">
                            <tr>
                              <td className="p-3 border border-gray-200 font-semibold">사용자 인터페이스 (UI)</td>
                              <td className="p-3 border border-gray-200">클라이언트 렌더링 및 상태 관리</td>
                              <td className="p-3 border border-gray-200 text-red-500 font-bold">High</td>
                            </tr>
                            <tr className="bg-gray-50">
                              <td className="p-3 border border-gray-200 font-semibold">비즈니스 로직 API</td>
                              <td className="p-3 border border-gray-200">핵심 로직 처리 및 트랜잭션 관리</td>
                              <td className="p-3 border border-gray-200 text-orange-500 font-bold">Medium</td>
                            </tr>
                            <tr>
                              <td className="p-3 border border-gray-200 font-semibold">데이터 저장소</td>
                              <td className="p-3 border border-gray-200">영속성 및 캐싱 지원</td>
                              <td className="p-3 border border-gray-200 text-green-600 font-bold">Low</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Footer */}
                      <div className="mt-16 pt-8 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                        <span>TeachingFlow Document System</span>
                        <span>Page 1 of 4</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Sidebar: AI Insights */}
                <div className="w-80 border-l border-white/5 bg-[#080808] hidden xl:flex flex-col flex-shrink-0">
                  <div className="h-12 border-b border-white/5 flex items-center px-5 bg-[#0a0a0b]">
                    <Sparkles size={16} className="text-[#FFBE98] mr-2" />
                    <h3 className="text-xs font-bold text-zinc-300">AI 인사이트</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-6">
                    {/* Auto Summary */}
                    <div>
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center">
                        <FileText size={12} className="mr-1.5" /> 스마트 요약
                      </h4>
                      <div className="p-4 bg-[#111] border border-white/5 rounded-xl text-xs text-zinc-300 leading-relaxed shadow-inner">
                        이 문서는 소프트웨어 설계 단계에서의 모듈화 중요성과 리스크 관리에 대해 다루고 있습니다. 비즈니스 로직 API의 설계가 핵심으로 지목되었습니다.
                      </div>
                    </div>

                    {/* Quick Questions */}
                    <div>
                      <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center">
                        <MessageSquare size={12} className="mr-1.5" /> 관련 질문 추천
                      </h4>
                      <div className="space-y-2">
                        {['모듈화를 위한 최선의 방법은?', '초기 리스크는 어떻게 식별하나요?', 'API 계층 구조의 예시를 보여줘'].map((q, i) => (
                          <button key={i} className="w-full text-left p-3 rounded-lg border border-white/5 bg-[#050505] hover:bg-white/5 hover:border-white/10 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Chat Input */}
                  <div className="p-4 border-t border-white/5 bg-[#0a0a0b]">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="문서에 대해 질문하세요..."
                        className="w-full bg-[#050505] border border-white/10 rounded-xl pl-4 pr-10 py-3 text-xs text-zinc-200 focus:outline-none focus:border-[#FFBE98]/50 transition-colors"
                      />
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">
                        <Search size={12} />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Video Target Selection Modal */}
      <AnimatePresence>
        {videoTargetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setVideoTargetModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#0a0a0b] border border-white/10 rounded-[2rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 pb-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-zinc-100 mb-1">
                    어떤 발표 자료로 영상을 만들까요?
                  </h2>
                  <p className="text-sm text-zinc-400">영상을 제작할 기반 프레젠테이션을 선택해주세요.</p>
                </div>
                <button 
                  onClick={() => setVideoTargetModalOpen(false)}
                  className="text-zinc-500 hover:text-white transition-colors p-2"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto p-4 custom-scrollbar flex-1 bg-[#050505]">
                <div className="grid grid-cols-1 gap-3">
                  {myLibrary.filter(item => item.format === '프레젠테이션' || item.format === '초안').length === 0 && (
                     <div className="text-center py-12 text-zinc-500">
                        선택할 수 있는 발표 자료가 없습니다. 먼저 발표 자료를 생성해주세요.
                     </div>
                  )}
                  {myLibrary.filter(item => item.format === '프레젠테이션' || item.format === '초안').map((item, i) => (
                    <div 
                      key={item.id} 
                      onClick={() => {
                        setVideoTargetModalOpen(false);
                        router.push('/create/video-editor');
                      }}
                      className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-zinc-900/40 hover:bg-zinc-800 hover:border-indigo-500/50 cursor-pointer transition-all group"
                    >
                      <div className="w-12 h-12 rounded-lg bg-[#0a0a0b] border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 transition-colors">
                        <Presentation size={20} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white mb-1">{item.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">{item.format}</span>
                          <span>{item.date}</span>
                        </div>
                      </div>
                      <div className="text-zinc-600 group-hover:text-indigo-400 transition-colors">
                        <Play size={20} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

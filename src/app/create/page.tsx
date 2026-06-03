"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen, Search, FileText, UploadCloud, X, 
  FileVideo, Link as LinkIcon, Send, Cpu, Loader2, CheckCircle2, Download,
  ChevronRight, ChevronDown, Edit3, Type, Image as ImageIcon, LayoutTemplate, Orbit, Database, Mic, ArrowLeft,
  Share2, Paperclip, GripVertical, Play, ChevronLeft, Presentation, BarChart3, Monitor
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// --------------------------------------------------------
// PREMIUM DROPDOWN COMPONENT
// --------------------------------------------------------
function PremiumDropdown({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-semibold text-zinc-400 mb-2 px-1">{label}</label>
      <div 
        className={cn(
          "w-full bg-[#0a0a0b] border hover:border-white/10 rounded-lg pl-3 pr-4 py-2 text-sm cursor-text shadow-sm flex items-center justify-between transition-all",
          isOpen ? "border-zinc-400/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]" : "border-white/5"
        )}
      >
        <input 
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={cn(
            "w-full bg-transparent border-none focus:outline-none py-0.5",
            inputValue.includes("알아서") ? "text-zinc-300 font-bold" : "text-zinc-200"
          )}
          placeholder="직접 입력하거나 선택하세요"
        />
        <ChevronDown 
          size={14} 
          onClick={() => setIsOpen(!isOpen)}
          className={cn("text-zinc-500 transition-transform duration-200 flex-shrink-0 ml-2 cursor-pointer hover:text-white", isOpen ? "rotate-180" : "")} 
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -5 }} 
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+8px)] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-1 max-h-60 overflow-y-auto custom-scrollbar"
          >
            {options.map(opt => (
              <div 
                key={opt}
                onMouseDown={(e) => e.preventDefault()} // Prevent blur on input when clicking
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={cn(
                  "px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between",
                  value === opt ? "bg-zinc-400/10 text-zinc-300 font-bold" : "text-zinc-300 hover:bg-white/5 hover:text-white font-medium"
                )}
              >
                {opt}
                {value === opt && <CheckCircle2 size={14} className="text-zinc-300" />}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------------------------------------
// MAIN WORKSPACE
// --------------------------------------------------------
export default function Workspace3Column() {
  const router = useRouter();
  const [projectTitle, setProjectTitle] = useState("제목 없는 작업");
  
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [sources, setSources] = useState([
    { id: 1, name: "소프트웨어_공학_개론_전체.pdf", type: "pdf" },
    { id: 2, name: "폭포수모델_위키백과.html", type: "web" },
  ]);

  const [chatMessages, setChatMessages] = useState([
    { role: 'ai', text: '안녕하세요! 오늘 준비하실 내용은 무엇인가요?\n좌측에 올려주신 2개의 자료를 방금 다 읽어봤어요. 이 내용으로 어떤 걸 만들어볼까요?' }
  ]);
  const [chatInput, setChatInput] = useState("");

  const [generatedItems, setGeneratedItems] = useState<{id: number, type: string, title: string}[]>([]);

  // Generation Settings State
  const [audience, setAudience] = useState("알아서 (AI 자동 설정)");
  const [tone, setTone] = useState("알아서 (AI 자동 설정)");
  const [duration, setDuration] = useState("알아서 (AI 자동 설정)");
  const [designStyle, setDesignStyle] = useState("알아서 (AI 자동 설정)");

  // VIDEO WIZARD STATE (Phase 6 Full-Screen Focus Mode)
  // 0 = Closed, 1 = Template, 2 = Outline, 3 = Editor, 4 = Rendering
  const [videoWizardStep, setVideoWizardStep] = useState<number>(0);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(1);
  const [selectedStyle, setSelectedStyle] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<"16/9" | "4/3" | "1/1" | "9/16">("16/9");
  const [activeTab, setActiveTab] = useState<"chat" | "design">("chat");
  const [activeSlide, setActiveSlide] = useState<number>(1);
  const [outlineItems, setOutlineItems] = useState([
    "소프트웨어 공학의 정의와 목표",
    "폭포수 모델의 개념과 역사",
    "폭포수 모델의 5단계 구조",
    "폭포수 모델의 장단점 및 한계",
    "현대적 애자일 모델과의 비교"
  ]);

  const handleSendMessage = () => {
    if(!chatInput.trim()) return;
    setChatMessages([...chatMessages, { role: 'user', text: chatInput }]);
    const currentInput = chatInput;
    setChatInput("");
    
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: `"${currentInput}"에 대한 내용을 파악했습니다. 우측 패널에서 생성을 시작해주세요!` }]);
    }, 1000);
  };

  const handleSlideVideoClick = () => {
    setVideoWizardStep(1);
  };

  const handleFinalRender = () => {
    setVideoWizardStep(4);
    setTimeout(() => {
      setVideoWizardStep(0);
      router.push('/assets');
    }, 3000);
  };

  // --------------------------------------------------------
  // PHASE 6: FULL-SCREEN FOCUS MODE FOR VIDEO WIZARD
  // --------------------------------------------------------
  if (videoWizardStep > 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full h-full flex flex-col bg-[#050505] text-zinc-100 overflow-hidden"
      >
        {/* 1. Header (Breadcrumb) */}
        {videoWizardStep !== 3 && videoWizardStep !== 4 && (
          <div className="h-14 border-b border-white/5 flex items-center px-6 bg-[#0a0a0b] flex-shrink-0 justify-between shadow-sm relative z-10">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setVideoWizardStep(0)}
                className="flex items-center text-sm font-medium text-zinc-500 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} className="mr-2" /> 스튜디오 복귀
              </button>
              
              <div className="flex items-center gap-3 text-sm">
                <span className={cn("font-semibold tracking-tight transition-colors", videoWizardStep >= 1 ? "text-[#FFBE98]" : "text-zinc-600")}>1. 테마 선택</span>
                <ChevronRight size={14} className="text-zinc-700" />
                <span className={cn("font-semibold tracking-tight transition-colors", videoWizardStep >= 2 ? "text-[#FFBE98]" : "text-zinc-600")}>2. 목차 구성</span>
              </div>
            </div>
            <div className="text-[10px] font-medium text-[#FFBE98] bg-[#FFBE98]/10 px-2.5 py-1 rounded-md border border-white/10/20">
              자동 저장 중
            </div>
          </div>
        )}

        {/* 2. Main Canvas */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          
          {/* Step 1: Style & Theme Selection (Condensed, Practical) */}
          {videoWizardStep === 1 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
              className="w-full h-full overflow-y-auto custom-scrollbar flex justify-center py-4"
            >
              <div className="max-w-5xl w-full px-6 flex flex-col gap-4">
                <div>
                  <h1 className="text-xl font-bold text-white mb-1">프리젠테이션 셋업</h1>
                  <p className="text-zinc-400 text-xs">자주 사용하는 스타일과 테마를 선택하세요.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Aspect Ratio Selection */}
                  <div className="bg-[#0a0a0b] border border-white/5 p-4 rounded-xl flex flex-col">
                    <h3 className="text-sm font-bold text-white mb-3">화면 비율</h3>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {[
                        { id: "16/9", name: "16:9 와이드", icon: "aspect-video" },
                        { id: "4/3", name: "4:3 스탠다드", icon: "aspect-[4/3]" },
                        { id: "1/1", name: "1:1 정방형", icon: "aspect-square" },
                        { id: "9/16", name: "9:16 세로형", icon: "aspect-[9/16]" }
                      ].map(ratio => (
                        <button 
                          key={ratio.id} 
                          onClick={() => setAspectRatio(ratio.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center py-2.5 rounded-lg border transition-all group",
                            aspectRatio === ratio.id ? "bg-[#FFBE98]/10 border-[#FFBE98]/50 text-[#FFBE98]" : "bg-[#050505] border-white/5 hover:bg-white/5 hover:border-white/20"
                          )}
                        >
                          <div className={cn("w-6 border-2 rounded-sm mb-1 opacity-80 transition-colors", ratio.icon, aspectRatio === ratio.id ? "border-[#FFBE98]" : "border-zinc-500 group-hover:border-zinc-400")} />
                          <span className={cn("text-[10px] font-bold transition-colors", aspectRatio === ratio.id ? "text-[#FFBE98]" : "text-zinc-400 group-hover:text-zinc-300")}>{ratio.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style Selection - Condensed */}
                  <div className="bg-[#0a0a0b] border border-white/5 p-4 rounded-xl flex flex-col">
                    <h3 className="text-sm font-bold text-white mb-3">문서 스타일 (포맷)</h3>
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {[
                        { id: 3, name: "Presentation", desc: "발표용 슬라이드", icon: Presentation },
                        { id: 1, name: "Report", desc: "보고서/기획서", icon: BarChart3 },
                        { id: 2, name: "Standard", desc: "일반 문서", icon: FileText },
                        { id: 4, name: "Keynote", desc: "키노트 스타일", icon: Monitor }
                      ].map(s => (
                        <div key={s.id} onClick={() => setSelectedStyle(s.id)} className={cn(
                          "cursor-pointer flex items-center gap-2.5 p-2.5 rounded-lg border transition-all group",
                          selectedStyle === s.id ? "bg-[#FFBE98]/10 border-[#FFBE98]/50 text-[#FFBE98]" : "bg-[#050505] border-white/5 hover:bg-white/5 hover:border-white/20"
                        )}>
                          <div><s.icon size={18} className={cn("transition-colors", selectedStyle === s.id ? "text-[#FFBE98]" : "text-zinc-500 group-hover:text-zinc-400")} /></div>
                          <div>
                            <div className={cn("text-xs font-bold transition-colors", selectedStyle === s.id ? "text-[#FFBE98]" : "text-zinc-400 group-hover:text-zinc-300")}>{s.name}</div>
                            <div className={cn("text-[9px] opacity-80 transition-colors", selectedStyle === s.id ? "text-[#FFBE98]/70" : "text-zinc-500 group-hover:text-zinc-400")}>{s.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Theme Selection - Condensed */}
                <div className="bg-[#0a0a0b] border border-white/5 p-4 rounded-xl">
                  <h3 className="text-sm font-bold text-white mb-3">컬러 테마</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {[
                      { id: 1, name: "Peach Fuzz", colors: ["bg-[#FFBE98]", "bg-[#FCA5A5]", "bg-[#FDBA74]"], badge: "올해의 컬러" },
                      { id: 7, name: "Modern Dark", colors: ["bg-zinc-700", "bg-zinc-400", "bg-zinc-600"], badge: "베스트" },
                      { id: 2, name: "Elon Dark", colors: ["bg-[#4d2918]", "bg-[#914624]", "bg-[#914624]"] },
                      { id: 4, name: "WhyCombinator", colors: ["bg-[#f7c2b3]", "bg-zinc-500", "bg-[#f59e83]"] },
                      { id: 8, name: "Dule Blue", colors: ["bg-[#183963]", "bg-[#25528c]", "bg-[#1f457a]"] },
                    ].map(t => (
                      <div key={t.id} onClick={() => setSelectedTemplate(t.id)} className="cursor-pointer group flex flex-col relative">
                        {t.badge && (
                          <div className="absolute -top-2.5 -right-2 z-10 bg-[#FFBE98] text-[#050505] text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm">
                            {t.badge}
                          </div>
                        )}
                        <div className={cn(
                          "w-full aspect-video rounded-xl mb-1.5 flex gap-1 p-1.5 transition-all bg-[#050505]",
                          selectedTemplate === t.id ? "ring-2 ring-[#FFBE98] ring-offset-2 ring-offset-[#0a0a0b]" : "border border-white/5 group-hover:border-white/20"
                        )}>
                           <div className={cn("flex-1 rounded-sm", t.colors[0])} />
                           <div className="flex-1 flex flex-col gap-1.5">
                             <div className={cn("flex-1 rounded-md", t.colors[1])} />
                             <div className={cn("flex-1 rounded-md", t.colors[2])} />
                           </div>
                        </div>
                        <span className={cn("text-xs font-semibold text-center transition-colors", selectedTemplate === t.id ? "text-[#FFBE98]" : "text-zinc-500 group-hover:text-zinc-300")}>
                          {t.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Outline Editing (Tighter list) */}
          {videoWizardStep === 2 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
              className="w-full h-full overflow-y-auto custom-scrollbar flex justify-center py-12"
            >
              <div className="max-w-3xl w-full px-8">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-2">초안 목차 점검</h1>
                  <p className="text-zinc-400 text-sm">드래그하여 순서를 변경하거나 텍스트를 수정하세요.</p>
                </div>
                
                <div className="space-y-2">
                  {outlineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-[#0a0a0b] border border-white/5 p-3 rounded-lg group hover:border-white/20 transition-all focus-within:border-white/10/50 focus-within:bg-[#FFBE98]/5">
                      <div className="cursor-grab text-zinc-600 hover:text-zinc-300 p-1">
                        <GripVertical size={16} />
                      </div>
                      <span className="w-6 h-6 rounded-md bg-zinc-900 border border-white/5 flex items-center justify-center text-xs font-bold text-zinc-500 group-hover:text-[#FFBE98] transition-colors">
                        {idx + 1}
                      </span>
                      <input 
                        type="text" 
                        value={item}
                        onChange={(e) => {
                          const newItems = [...outlineItems];
                          newItems[idx] = e.target.value;
                          setOutlineItems(newItems);
                        }}
                        className="flex-1 bg-transparent border-none text-sm font-medium text-zinc-200 focus:outline-none focus:text-white"
                      />
                      <button className="text-zinc-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100 p-1.5">
                        <Edit3 size={14} />
                      </button>
                      <button className="text-red-900 hover:text-zinc-400 transition-colors opacity-0 group-hover:opacity-100 p-1.5">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  
                  <button className="w-full py-3 mt-2 border border-dashed border-zinc-800 rounded-lg text-sm font-semibold text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors flex items-center justify-center bg-transparent">
                    <Plus size={16} className="mr-2" /> 목차 추가
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Editor View */}
          {videoWizardStep === 3 && (
            <div className="absolute inset-0 bg-[#050505] flex flex-col">
              {/* Header */}
              <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#0a0a0b] flex-shrink-0">
                <div className="flex items-center gap-4">
                  <button onClick={() => setVideoWizardStep(2)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/5 text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                  </button>
                  <div className="h-4 w-px bg-white/10" />
                  <span className="text-xs font-semibold text-zinc-200">{projectTitle || "Untitled Deck"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 hover:bg-[#FFBE98]/10 rounded-md text-xs font-semibold text-[#FFBE98] flex items-center transition-colors">
                    <Play size={14} className="mr-2" /> 재생
                  </button>
                  <button className="px-3 py-1.5 hover:bg-white/5 rounded-md text-xs font-semibold text-zinc-300 hover:text-white flex items-center transition-colors">
                    <Download size={14} className="mr-2" /> 내보내기
                  </button>
                  <button className="px-4 py-1.5 bg-[#FFBE98] text-[#050505] hover:bg-[#FCA5A5] rounded-md text-xs font-bold flex items-center transition-colors">
                    <Share2 size={14} className="mr-2" /> 공유
                  </button>
                </div>
              </div>

              {/* Workspace */}
              <div className="flex-1 flex min-h-0">
                {/* Left Panel: Slide List */}
                <div className="w-56 border-r border-white/5 flex flex-col bg-[#050505]">
                  <div className="p-3 border-b border-white/5 bg-[#0a0a0b] flex items-center justify-between">
                    <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Slides</h2>
                    <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    {outlineItems.map((item, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setActiveSlide(idx + 1)}
                        className="group relative flex items-start gap-1"
                      >
                        <div className="pt-4 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hover:text-[#FFBE98] text-zinc-600">
                          <GripVertical size={12} />
                        </div>
                        <div className={cn(
                          "flex-1 flex flex-col p-2 rounded-lg border transition-all cursor-pointer",
                          activeSlide === idx + 1 ? "bg-[#0a0a0b] border-white/10/50 shadow-sm" : "bg-transparent border-transparent hover:border-white/10 hover:bg-white/5"
                        )}>
                           <div className="flex items-center justify-between mb-1.5">
                             <span className={cn("text-[9px] font-bold", activeSlide === idx + 1 ? "text-[#FFBE98]" : "text-zinc-500")}>{idx + 1}</span>
                           </div>
                           <div className={cn(
                             "w-full rounded-md border border-white/10 mb-1.5 flex flex-col p-1.5 relative overflow-hidden",
                             aspectRatio === "16/9" ? "aspect-video" : aspectRatio === "4/3" ? "aspect-[4/3]" : aspectRatio === "1/1" ? "aspect-square" : "aspect-[9/16]",
                             activeSlide === idx + 1 ? "bg-[#111]" : "bg-zinc-900"
                           )}>
                              <div className="text-[6px] font-semibold text-zinc-300 leading-tight line-clamp-2 relative z-10">{item}</div>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Center Canvas */}
                <div className="flex-1 bg-[#050505] flex flex-col p-6 overflow-hidden relative">
                   <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                   
                   <div className="flex-1 flex items-center justify-center min-h-0">
                     <motion.div 
                       key={activeSlide}
                       initial={{ opacity: 0, scale: 0.98 }}
                       animate={{ opacity: 1, scale: 1 }}
                       transition={{ duration: 0.2 }}
                       className={cn(
                         "w-full max-w-4xl bg-[#0a0a0b] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col p-10 relative z-10",
                         aspectRatio === "16/9" ? "aspect-video" : aspectRatio === "4/3" ? "aspect-[4/3] max-w-3xl" : aspectRatio === "1/1" ? "aspect-square max-w-2xl" : "aspect-[9/16] max-w-lg"
                       )}
                     >
                       <h1 className="text-3xl font-bold text-white mb-6 tracking-tight">{outlineItems[activeSlide - 1]}</h1>
                       <div className="flex-1 bg-black/50 rounded-lg border border-white/5 flex items-center justify-center text-zinc-500 font-medium relative group">
                         AI가 생성한 슬라이드 콘텐츠
                         <div className="absolute inset-0 bg-[#FFBE98]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm rounded-lg gap-4">
                           <button className="px-4 py-2 bg-[#FFBE98] text-[#050505] rounded-md text-xs font-bold shadow-lg flex items-center hover:bg-[#FCA5A5] transition-colors">
                             <Edit3 size={14} className="mr-2" /> 퀵 편집
                           </button>
                           <button onClick={() => router.push('/create/editor')} className="px-4 py-2 bg-zinc-800 text-white rounded-md text-xs font-bold shadow-lg flex items-center hover:bg-zinc-700 transition-colors border border-white/10">
                             <LayoutTemplate size={14} className="mr-2" /> 고급 에디터 열기
                           </button>
                         </div>
                       </div>
                     </motion.div>
                   </div>
                   
                   <div className="h-10 mt-4 flex items-center justify-center z-10">
                     <div className="flex items-center gap-3 bg-[#0a0a0b] border border-white/10 rounded-full px-4 py-1.5 shadow-sm">
                       <button className="text-zinc-400 hover:text-white"><ChevronLeft size={16} /></button>
                       <span className="text-[11px] font-bold text-zinc-400">{activeSlide} / {outlineItems.length}</span>
                       <button className="text-zinc-400 hover:text-white"><ChevronRight size={16} /></button>
                     </div>
                   </div>
                </div>

                {/* Right Panel: Chat & Design */}
                <div className="w-72 border-l border-white/5 flex flex-col bg-[#0a0a0b]">
                  <div className="h-12 border-b border-white/5 flex items-center p-1.5">
                    <div className="flex bg-[#050505] p-1 rounded-md w-full border border-white/5">
                      <button 
                        onClick={() => setActiveTab('chat')} 
                        className={cn("flex-1 py-1 text-[11px] font-bold rounded transition-colors", activeTab === 'chat' ? "bg-[#111] text-[#FFBE98] shadow-sm border border-white/5" : "text-zinc-500 hover:text-zinc-300")}
                      >
                        AI 챗봇
                      </button>
                      <button 
                        onClick={() => setActiveTab('design')} 
                        className={cn("flex-1 py-1 text-[11px] font-bold rounded transition-colors", activeTab === 'design' ? "bg-[#111] text-[#FFBE98] shadow-sm border border-white/5" : "text-zinc-500 hover:text-zinc-300")}
                      >
                        에디터
                      </button>
                    </div>
                  </div>
                  
                  {activeTab === 'chat' ? (
                    <div className="flex-1 flex flex-col p-3 bg-[#0a0a0b]">
                      <div className="flex-1 overflow-y-auto mb-3 custom-scrollbar">
                        <div className="flex gap-2 mb-4">
                          <div className="w-6 h-6 bg-[#FFBE98]/20 border border-white/10/30 rounded-full flex items-center justify-center shrink-0">
                            <Cpu size={12} className="text-[#FFBE98]" />
                          </div>
                          <div className="bg-[#111] border border-white/5 rounded-xl rounded-tl-sm p-2.5 text-xs text-zinc-300 shadow-sm leading-relaxed">
                            수정할 내용을 말씀해주세요.
                          </div>
                        </div>
                      </div>
                      <div className="bg-[#050505] border border-white/10 rounded-xl p-2 shadow-inner focus-within:border-white/10/50 transition-colors">
                        <textarea 
                          className="w-full bg-transparent border-none focus:outline-none resize-none text-xs text-zinc-200 placeholder:text-zinc-600 h-12 custom-scrollbar" 
                          placeholder="수정 요청사항 입력..."
                        />
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                          <button className="text-[9px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors px-1">
                            @ 컨텍스트
                          </button>
                          <div className="flex items-center gap-1">
                            <button className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white rounded transition-colors"><Paperclip size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center bg-[#FFBE98] text-[#050505] hover:bg-[#FCA5A5] rounded shadow-sm transition-colors"><Send size={10} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 p-4 flex flex-col bg-[#0a0a0b]">
                      <div className="space-y-2">
                        <button className="w-full h-10 bg-[#050505] hover:bg-[#111] border border-white/5 rounded-lg flex items-center px-3 text-xs font-medium text-zinc-300 transition-colors">
                          <LayoutTemplate size={14} className="mr-2 text-zinc-500" /> 레이아웃 변경
                        </button>
                        <button className="w-full h-10 bg-[#050505] hover:bg-[#111] border border-white/5 rounded-lg flex items-center px-3 text-xs font-medium text-zinc-300 transition-colors">
                          <ImageIcon size={14} className="mr-2 text-zinc-500" /> 배경 이미지
                        </button>
                        <button className="w-full h-10 bg-[#050505] hover:bg-[#111] border border-white/5 rounded-lg flex items-center px-3 text-xs font-medium text-zinc-300 transition-colors">
                          <Type size={14} className="mr-2 text-zinc-500" /> 텍스트 서식
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Final Rendering */}
          {videoWizardStep === 4 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
              className="absolute inset-0 flex flex-col items-center justify-center text-center bg-[#050505] z-50"
            >
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-full border-[4px] border-zinc-900 animate-[spin_3s_linear_infinite]" />
                <div className="w-24 h-24 rounded-full border-[4px] border-white/10 border-t-transparent animate-spin absolute top-0 left-0" />
                <div className="absolute inset-0 flex items-center justify-center text-[#FFBE98]">
                  <Cpu size={24} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">문서를 생성하고 보관함에 저장 중입니다...</h3>
              <p className="text-zinc-400 text-sm">테마와 목차를 기반으로 자료를 조립하고 있습니다.</p>
              
              <div className="w-full max-w-sm mt-8 space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-zinc-500 px-1">
                  <span>진행률</span>
                  <span className="text-[#FFBE98]">78%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: "100%" }} 
                    transition={{ duration: 3, ease: "linear" }}
                    className="h-full bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5]" 
                  />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 3. Bottom Fixed Action Bar */}
        {videoWizardStep !== 3 && videoWizardStep !== 4 && (
          <div className="h-16 border-t border-white/5 bg-[#0a0a0b] flex items-center justify-between px-8 flex-shrink-0 relative z-10">
            <button 
              onClick={() => setVideoWizardStep(prev => prev > 1 ? prev - 1 : prev)}
              disabled={videoWizardStep === 1}
              className="px-5 py-2.5 text-zinc-400 hover:text-white hover:bg-white/5 font-semibold rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent flex items-center text-sm"
            >
              이전
            </button>
            
            <button 
              onClick={() => {
                if (videoWizardStep === 2) {
                  handleFinalRender();
                } else {
                  setVideoWizardStep(prev => prev + 1);
                }
              }}
              className="px-6 py-2.5 bg-[#FFBE98] text-[#050505] hover:bg-[#FCA5A5] font-bold rounded-lg transition-colors flex items-center shadow-sm text-sm"
            >
              {videoWizardStep === 2 ? "자료 완성 및 보관함 저장" : "다음 단계"} <ChevronRight size={16} className="ml-1" />
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  // DEFAULT: 3-COLUMN WORKSPACE
  // --------------------------------------------------------
  return (
    <div className="w-full h-full flex flex-col lg:flex-row overflow-hidden bg-[#050505] relative">
      
      {/* LEFT COLUMN: Sources */}
      <AnimatePresence initial={false}>
        {isLeftPanelOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: typeof window !== 'undefined' && window.innerWidth < 1024 ? '100%' : 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col bg-[#080808] overflow-hidden whitespace-nowrap absolute lg:relative z-20 h-full lg:h-auto w-full lg:w-auto"
          >
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 w-full lg:w-80 flex-shrink-0">
              <h2 className="text-sm font-semibold text-zinc-200">참고 자료</h2>
              <button onClick={() => setIsLeftPanelOpen(false)} className="text-zinc-500 hover:text-zinc-300"><PanelLeftClose size={18} /></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 w-full lg:w-80">
              <button 
                onClick={() => setIsSourceModalOpen(true)}
                className="w-full py-3 bg-[#0a0a0b] border border-zinc-800 hover:border-zinc-600 rounded-xl text-sm font-medium text-zinc-300 flex items-center justify-center transition-colors shadow-inner mb-6 group"
              >
                <Plus size={16} className="mr-2 text-zinc-500 group-hover:text-white transition-colors" /> 자료 추가하기
              </button>

              <div className="space-y-2">
                {sources.map(source => (
                  <div key={source.id} className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-white/5 hover:bg-white/[0.02] cursor-pointer transition-all group">
                    <div className="w-8 h-8 rounded bg-zinc-900 flex items-center justify-center flex-shrink-0 border border-white/5">
                      <FileText size={14} className="text-zinc-400 group-hover:text-zinc-300 transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 truncate">{source.name}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-4 bg-[#080808] border-t border-white/5 w-full lg:w-80 flex-shrink-0">
              <p className="text-[10px] text-zinc-600 text-center">선택된 자료 {sources.length}개</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MIDDLE COLUMN: Chat */}
      <div className="flex-1 flex flex-col bg-[#050505] relative z-0 border-r border-white/5 min-w-0">
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0a0a0b]">
          <div className="flex items-center gap-3 w-full">
            <Link href="/assets" className="text-zinc-500 hover:text-white transition-colors mr-1">
              <ArrowLeft size={18} />
            </Link>
            <AnimatePresence>
              {!isLeftPanelOpen && (
                <motion.button 
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setIsLeftPanelOpen(true)} 
                  className="text-zinc-500 hover:text-white transition-colors mr-2"
                >
                  <PanelLeftOpen size={18} />
                </motion.button>
              )}
            </AnimatePresence>
            <input 
              type="text" 
              value={projectTitle}
              onChange={e => setProjectTitle(e.target.value)}
              placeholder="프로젝트 제목을 입력하세요"
              className="bg-transparent border-none text-base font-bold text-zinc-100 focus:outline-none focus:border-b focus:border-zinc-400/50 flex-1 transition-colors min-w-0"
            />
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-900 px-2.5 py-1 rounded-md border border-white/5 whitespace-nowrap">
              자동 저장됨
            </span>
            <button
              onClick={() => {
                const newId = Date.now();
                setSources(prev => [{ id: newId, name: `대화내역_${new Date().getHours()}시${new Date().getMinutes()}분.txt`, type: 'doc', status: 'ready' }, ...prev]);
                alert('대화 내용이 왼쪽 참고 자료(txt)로 임포트 되었습니다!');
              }}
              className="ml-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold rounded-md border border-zinc-700 transition-colors whitespace-nowrap flex items-center"
            >
              대화 임포트
            </button>
            <AnimatePresence>
              {!isRightPanelOpen && (
                <motion.button 
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setIsRightPanelOpen(true)} 
                  className="text-zinc-500 hover:text-white transition-colors ml-3"
                >
                  <PanelRightOpen size={18} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-8">
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={cn("flex items-start gap-4 max-w-2xl w-full", msg.role === 'ai' ? "mr-auto" : "ml-auto flex-row-reverse")}>
              {msg.role === 'ai' && (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-400 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  <Cpu size={18} className="text-white" />
                </div>
              )}
              <div className={cn("pt-2", msg.role === 'user' ? "text-right" : "")}>
                <p className={cn(
                  "text-sm leading-relaxed whitespace-pre-wrap p-4 rounded-2xl",
                  msg.role === 'ai' 
                    ? "bg-[#0a0a0b] border border-white/5 text-zinc-300" 
                    : "bg-zinc-500 text-white"
                )}>
                  {msg.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6">
          <div className="max-w-3xl mx-auto relative group">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="필요한 걸 말해주세요..." 
              className="w-full bg-[#0a0a0b] border border-zinc-800 rounded-2xl pl-6 pr-14 py-4 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400/50 focus:bg-[#0c0c0e] transition-all shadow-inner"
            />
            <button 
              onClick={handleSendMessage}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Studio */}
      <AnimatePresence initial={false}>
        {isRightPanelOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: typeof window !== 'undefined' && window.innerWidth < 1024 ? '100%' : 384, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="lg:flex-shrink-0 flex flex-col bg-[#080808] z-20 overflow-hidden whitespace-nowrap absolute lg:relative right-0 h-full lg:h-auto w-full lg:w-auto"
          >
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#080808] w-full lg:w-96 flex-shrink-0">
              <h2 className="text-sm font-semibold text-zinc-200">생성 도구</h2>
              <button onClick={() => setIsRightPanelOpen(false)} className="text-zinc-500 hover:text-zinc-300"><PanelRightClose size={18} /></button>
            </div>

            <div className="flex-1 flex flex-col w-full lg:w-96 min-h-0">
              <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                {/* Generation Settings Widget */}
                <div>
                  <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-6 px-1">생성 상세 옵션</h3>
                  <div className="space-y-5">
                    <PremiumDropdown 
                      label="타겟 청중" 
                      value={audience} 
                      onChange={setAudience} 
                      options={["알아서 (AI 자동 설정)", "대학생 및 전공자", "일반인 (비전공자)", "업계 전문가", "초/중/고등학생", "사내 임직원"]} 
                    />
                    <PremiumDropdown 
                      label="발표 톤앤매너" 
                      value={tone} 
                      onChange={setTone} 
                      options={["알아서 (AI 자동 설정)", "전문적이고 신뢰감 있는", "캐주얼하고 친근한", "유머러스하고 재치있는", "열정적이고 설득력 있는", "차분하고 논리적인"]} 
                    />
                    <PremiumDropdown 
                      label="예상 발표 분량" 
                      value={duration} 
                      onChange={setDuration} 
                      options={["알아서 (AI 자동 설정)", "약 5분 (핵심 요약)", "약 10분 (표준 발표)", "약 15분 (상세 설명)", "20분 이상 (심층 분석)"]} 
                    />
                  </div>
                </div>
              </div>

              {/* Premium Omni-Generator Button Pinned to Bottom */}
              <div className="p-6 border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
                <button 
                  onClick={handleSlideVideoClick}
                  className="w-full h-14 bg-gradient-to-br from-zinc-800 to-zinc-900 hover:from-zinc-500 hover:to-zinc-500 text-white rounded-xl flex items-center justify-center gap-3 transition-all duration-300 font-bold text-sm shadow-[0_0_20px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] border border-white/10 hover:border-transparent group"
                >
                  <FileVideo size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
                  <span className="tracking-wide">프리미엄 발표 자료 생성</span>
                </button>
                <p className="text-[11px] text-zinc-500 text-center mt-4 font-medium leading-relaxed opacity-80">
                  원클릭으로 대본, 목차, 슬라이드, 퀴즈가<br/>모두 AI에 의해 자동 생성됩니다.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* ADD SOURCE MODAL REMAINS SAME */}
      <AnimatePresence>
        {isSourceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsSourceModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-[#0a0a0b] border border-white/10 rounded-[2rem] shadow-2xl relative z-10 overflow-hidden"
            >
              <button 
                onClick={() => setIsSourceModalOpen(false)}
                className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="p-10 pb-6 text-center">
                <h2 className="text-2xl font-bold text-zinc-100 mb-2">
                  <span className="text-zinc-300">참고할 자료</span>를 추가해주세요
                </h2>
                <p className="text-sm text-zinc-400">웹 문서를 검색하거나 파일을 직접 끌어다 놓으세요.</p>
              </div>

              <div className="px-10 pb-10">
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    type="text" 
                    onKeyDown={(e) => { if(e.key === 'Enter') { alert('자료 검색 중...'); setIsSourceModalOpen(false); setSources([...sources, { id: 3, name: "새로 검색된 자료.pdf", type: "pdf"}]) } }}
                    placeholder="관련 자료나 링크 검색 후 엔터..." 
                    className="w-full bg-[#050505] border border-zinc-400/50 rounded-2xl pl-12 pr-4 py-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all shadow-[0_0_20px_rgba(99,102,241,0.1)]"
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
                      onClick={() => { alert('파일 선택 창이 열립니다.'); setIsSourceModalOpen(false); setSources([...sources, { id: 4, name: "업로드된_문서.docx", type: "doc"}]); }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <UploadCloud size={14} className="mr-2" /> 파일 업로드
                    </button>
                    <button 
                      onClick={() => { alert('URL 입력 창이 열립니다.'); setIsSourceModalOpen(false); }}
                      className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center transition-colors"
                    >
                      <LinkIcon size={14} className="mr-2" /> 웹페이지
                    </button>
                    <button 
                      onClick={() => { alert('텍스트 입력 창이 열립니다.'); setIsSourceModalOpen(false); }}
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
    </div>
  );
}

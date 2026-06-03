"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sparkles, Zap, Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Basic",
    price: "무료",
    period: "",
    target: "처음 도입해보는 교사/강사, 가벼운 수업 준비",
    description: "TeachingFlow의 핵심 AI 기능을 체험해보세요.",
    icon: Sparkles,
    color: "zinc",
    features: [
      "월 3회 AI 발표 자료(초안) 생성",
      "월 1회 (최대 5분) AI 기반 발표 영상 생성",
      "보관함 용량: 1GB 제한",
      "기본 제공 테마 및 템플릿 사용 가능",
    ],
    buttonText: "현재 사용 중",
    buttonVariant: "outline",
  },
  {
    name: "Pro",
    price: "₩19,000",
    period: "/월",
    target: "매주 수업 자료와 영상을 준비하는 전업 강사 및 교사",
    description: "가장 인기 있는 주력 요금제로 완벽한 강의를 준비하세요.",
    icon: Zap,
    color: "primary",
    badge: "추천",
    features: [
      "무제한 AI 발표 자료 생성",
      "월 15회 (최대 30분) 고화질 AI 발표 영상 생성",
      "프리미엄 AI 보이스 10종 지원",
      "보관함 용량: 50GB",
      "우선 순위 렌더링 (대기 시간 단축)",
      "커스텀 워터마크 추가 기능",
    ],
    buttonText: "Pro 플랜 업그레이드",
    buttonVariant: "solid",
  },
  {
    name: "Enterprise",
    price: "별도 문의",
    period: "",
    target: "학교, 학원, 교육 기관 (B2B)",
    description: "기관 전체의 교육 퀄리티를 통합 관리하세요.",
    icon: Building2,
    color: "zinc",
    features: [
      "소속 강사/교사 계정 통합 관리 및 대시보드",
      "무제한 AI 영상 생성 및 무제한 보관함",
      "기관 전용 맞춤형 테마 및 템플릿 제작 지원",
      "LMS(학습관리시스템) 연동 API 제공",
      "전담 매니저 배정",
    ],
    buttonText: "영업팀에 문의",
    buttonVariant: "outline",
  }
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#050505] p-6 md:p-12 lg:p-20 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-semibold mb-6 border border-indigo-500/20">
            <Sparkles size={14} /> 교육자를 위한 최적의 요금제
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
            수업 준비 시간을 <span className="text-gradient-gemini">혁신적으로 단축</span>하세요
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            자료 서치, 슬라이드 디자인, 영상 편집에 쏟던 시간을 획기적으로 줄여드립니다.<br />
            오직 학생들을 가르치는 본질에만 집중하세요.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.2 }}
              className={cn(
                "relative flex flex-col rounded-3xl p-8 bg-[#0a0a0b] border transition-all duration-300",
                plan.color === 'primary' 
                  ? "border-[#FFBE98]/50 shadow-[0_0_40px_rgba(255,190,152,0.15)] scale-100 md:scale-105 z-10" 
                  : "border-white/10 hover:border-white/20"
              )}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5] text-[#050505] text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                  {plan.badge}
                </div>
              )}

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    plan.color === 'primary' ? "bg-[#FFBE98]/20 text-[#FFBE98]" : "bg-zinc-800 text-zinc-300"
                  )}>
                    <plan.icon size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-extrabold text-white tracking-tight">{plan.price}</span>
                  <span className="text-zinc-500 font-medium">{plan.period}</span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed h-10">{plan.description}</p>
              </div>

              <div className="flex-1">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">주요 혜택</p>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                      <CheckCircle2 size={18} className={cn("flex-shrink-0 mt-0.5", plan.color === 'primary' ? "text-[#FFBE98]" : "text-zinc-500")} />
                      <span className="leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button className={cn(
                "w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center",
                plan.buttonVariant === 'solid' 
                  ? "bg-gradient-to-r from-[#FFBE98] to-[#FCA5A5] hover:opacity-90 text-[#050505] shadow-[0_0_20px_rgba(255,190,152,0.3)]" 
                  : "bg-[#050505] border border-white/10 text-white hover:bg-zinc-800"
              )}>
                {plan.buttonText}
              </button>
            </motion.div>
          ))}
        </div>
        
        {/* FAQ or Footer CTA */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-20 text-center"
        >
          <p className="text-zinc-500 text-sm mb-4">연간 결제 시 20% 추가 할인이 적용됩니다.</p>
          <button className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold flex items-center justify-center gap-1 mx-auto">
            요금제 관련 자주 묻는 질문 <ChevronRight size={16} />
          </button>
        </motion.div>
      </div>
    </div>
  );
}

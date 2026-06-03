"use client";

import { motion } from "framer-motion";
import { User, Key, CreditCard, Bell, Shield, Sparkles, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "profile", name: "프로필", icon: User },
  { id: "ai", name: "AI 및 제미나이 설정", icon: Sparkles },
  { id: "billing", name: "구독 및 결제", icon: CreditCard },
  { id: "notifications", name: "알림", icon: Bell },
  { id: "security", name: "보안", icon: Shield },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("ai");

  return (
    <div className="w-full max-w-5xl mx-auto pb-24 pt-4 flex gap-10">
      {/* Settings Sidebar */}
      <div className="w-64 flex-shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 mb-8">
          설정
        </h1>
        <div className="flex flex-col gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium w-full text-left",
                  isActive 
                    ? "bg-zinc-800 border border-zinc-700 text-white shadow-inner" 
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                )}
              >
                <tab.icon size={18} className={isActive ? (tab.id === 'ai' ? 'text-zinc-300' : 'text-zinc-300') : ""} />
                {tab.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 mt-14">
        {activeTab === "ai" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-xl font-semibold text-zinc-100 mb-2">AI 모델 및 제미나이 설정</h2>
              <p className="text-sm text-zinc-500">마스터피스 스튜디오에서 사용할 AI 모델과 API 키를 관리합니다.</p>
            </div>

            <div className="metal-panel p-8 rounded-3xl space-y-8">
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Gemini API Key</label>
                <div className="flex gap-4">
                  <input 
                    type="password" 
                    defaultValue="AIzaSyA_mock_gemini_api_key_for_premium_user"
                    className="flex-1 bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-zinc-400 transition-colors shadow-inner"
                  />
                  <button 
                    onClick={() => alert('API 키가 유효합니다.')}
                    className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors border border-zinc-700"
                  >
                    키 확인
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Google AI Studio에서 발급받은 API 키를 입력해주세요.</p>
              </div>

              <hr className="border-zinc-800" />

              {/* Default Models */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">기본 텍스트 모델</label>
                  <select className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-zinc-400 transition-colors">
                    <option>Gemini 1.5 Pro (권장)</option>
                    <option>Gemini 1.5 Flash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">기본 음성 합성 모델</label>
                  <select className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-zinc-400 transition-colors">
                    <option>Google Cloud TTS (Neural2)</option>
                    <option>ElevenLabs (Premium)</option>
                  </select>
                </div>
              </div>
              
              <hr className="border-zinc-800" />

              {/* Persona */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">AI 어시스턴트 페르소나</label>
                <textarea 
                  rows={3}
                  defaultValue="당신은 대기업 연봉 10억의 수석 기획자이자 수석 디자이너입니다. 최고급 퀄리티의 산출물만을 고집하며, 사용자에게 가장 직관적이고 완벽한 기획안을 제시해야 합니다."
                  className="w-full bg-[#050505] border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-zinc-400 transition-colors shadow-inner text-sm resize-none"
                />
              </div>

              <div className="flex justify-end pt-4">
                <button 
                  onClick={() => alert('설정이 저장되었습니다.')}
                  className="px-8 py-3 bg-zinc-100 hover:bg-white text-black font-semibold rounded-full transition-all flex items-center"
                >
                  <CheckCircle2 size={18} className="mr-2" /> 변경사항 저장
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "profile" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-semibold text-zinc-100 mb-2">프로필 설정</h2>
            <p className="text-sm text-zinc-500 mb-8">기본 정보 및 계정 설정을 관리합니다.</p>
            <div className="metal-panel p-8 rounded-3xl flex items-center justify-center h-64 text-zinc-500">
              프로필 설정 화면 (준비 중)
            </div>
          </motion.div>
        )}

        {activeTab === "billing" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-xl font-semibold text-zinc-100 mb-2">구독 및 결제</h2>
            <p className="text-sm text-zinc-500 mb-8">현재 'Masterpiece Pro' 플랜을 이용 중입니다.</p>
            <div className="metal-panel p-8 rounded-3xl flex items-center justify-center h-64 text-zinc-500">
              결제 내역 화면 (준비 중)
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Command, Layers, PieChart, LayoutGrid, Play, BookOpen, CreditCard } from "lucide-react";

const menuItems = [
  { name: "대시보드", icon: LayoutGrid, href: "/" },
  { name: "내 보관함", icon: Layers, href: "/assets" },
  { name: "학생 프리뷰", icon: Play, href: "/learn" },
  { name: "학습 데이터 분석", icon: PieChart, href: "/analyze/week" },
  { name: "가이드북", icon: BookOpen, href: "/guide" },
  { name: "요금제 안내", icon: CreditCard, href: "/pricing" },
];

export default function Sidebar() {
  return (
    <div className="w-64 h-screen bg-[#050505] border-r border-white/5 flex flex-col p-6 text-zinc-300">
      <div className="flex items-center mb-12 gap-3 px-2">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
          <Command size={18} className="text-black" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-white">Flow</span>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex items-center px-4 py-3 text-sm font-medium rounded-xl hover:bg-zinc-900 hover:text-white transition-all group"
          >
            <item.icon size={18} className="mr-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            {item.name}
          </Link>
        ))}
      </nav>

      <Link href="/settings">
        <div className="mt-auto px-4 py-4 rounded-xl bg-zinc-900/50 border border-white/5 cursor-pointer hover:bg-zinc-900 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-400 flex items-center justify-center text-xs font-bold text-white group-hover:bg-[#FFBE98] transition-colors text-black">
              MJ
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white group-hover:text-[#FFBE98] transition-colors">Jeonggun Lee</span>
              <span className="text-xs text-zinc-500">Premium Plan</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LayoutGrid, Video, Play, Bell, Plus, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const menuItems = [
  { name: "대시보드", icon: LayoutGrid, href: "/" },
  { name: "보관함", icon: Library, href: "/assets" },
  { name: "학생 뷰", icon: Play, href: "/learn" },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-white/5 bg-[#0a0a0b] flex items-center justify-between px-4 lg:px-12 flex-shrink-0 relative z-50">
        <div className="flex items-center gap-2 md:gap-8">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>

          <Link href="/" className="flex items-center gap-2 md:gap-3 group">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-zinc-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              <Video size={16} className="text-white md:w-[18px] md:h-[18px]" />
            </div>
            <span className="text-base md:text-lg font-bold tracking-tight text-white hidden sm:block">TeachingFlow</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                  )}
                >
                  <item.icon size={16} className={isActive ? "text-zinc-300" : ""} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-3">


          {/* Premium Notifications */}
          <button className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-900 border border-white/5 hover:border-[#FFBE98]/30 text-zinc-400 hover:text-white transition-all shadow-inner group md:mr-1">
            <Bell size={16} className="group-hover:scale-110 transition-transform" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-gradient-to-r from-rose-400 to-red-500 rounded-full border border-[#0a0a0b] shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
          </button>

          {/* Profile */}
          <Link href="/settings">
            <div className="flex items-center gap-2 md:gap-3 p-1 md:px-3 md:py-1.5 rounded-full bg-zinc-900/50 border border-white/5 cursor-pointer hover:bg-zinc-900 transition-colors group">
              <div className="w-8 h-8 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 flex items-center justify-center text-[10px] font-bold text-white group-hover:from-[#FFBE98] group-hover:to-[#FCA5A5] transition-colors text-black shadow-sm">
                MJ
              </div>
              <span className="text-sm font-medium text-white hidden md:block group-hover:text-[#FFBE98] transition-colors">Jeonggun Lee</span>
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 left-0 w-64 bg-[#0a0a0b] border-r border-white/10 flex flex-col p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileMenuOpen(false)}>
                  <div className="w-7 h-7 rounded-lg bg-zinc-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                    <Video size={16} className="text-white" />
                  </div>
                  <span className="text-base font-bold tracking-tight text-white">TeachingFlow</span>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white bg-white/5 rounded-full flex items-center justify-center min-w-[44px] min-h-[44px]"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-2 flex-1">


                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 mt-4 ml-2">메뉴</p>
                {menuItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        isActive
                          ? "bg-zinc-800 text-white shadow-inner border border-white/5"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                      )}
                    >
                      <item.icon size={18} className={isActive ? "text-[#FFBE98]" : ""} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

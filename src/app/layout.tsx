import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "TeachingFlow - Premium AI Lecture Platform",
  description: "Create, Play, and Analyze Lectures with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className="antialiased flex flex-col h-screen bg-black text-zinc-100 overflow-hidden" suppressHydrationWarning>
        <Header />
        
        {/* Main Content Area */}
        <main className="flex-1 relative overflow-y-auto bg-[#050505] flex flex-col">
          {/* Subtle top spotlight effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-white/[0.02] blur-[100px] pointer-events-none rounded-full" />
          
          <div className="relative z-10 w-full flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

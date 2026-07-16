import Link from 'next/link';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Link
        href="/dashboard/assistant"
        aria-label="Open AI Assistant"
        title="AI Assistant"
        className="fixed bottom-4 right-4 z-[80] inline-flex items-center gap-2 rounded-full border border-cyan-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-cyan-700 shadow-[0_14px_35px_-18px_rgba(6,182,212,0.9)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-cyan-50 hover:text-cyan-800 sm:bottom-6 sm:right-6 sm:px-4 sm:py-2.5"
      >
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 text-sm text-white">
          <span className="absolute inset-0 rounded-full bg-cyan-300/60 blur-sm" />
          <span className="relative">AI</span>
        </span>
        <span className="hidden sm:inline">Assistant</span>
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      </Link>
      {children}
    </>
  );
}

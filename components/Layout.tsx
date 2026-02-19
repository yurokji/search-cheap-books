import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 text-lg font-bold text-white">B</div>
            <div>
              <p className="text-base font-semibold leading-tight">BiblioOptima</p>
              <p className="text-xs text-slate-500">중고책 가격 비교 도우미</p>
            </div>
          </div>
          <div className="hidden text-sm text-slate-500 md:block">알라딘 + 여러 판매처 가격 한눈에 비교</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
};

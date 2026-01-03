
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10 no-print">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">胰岛素滴定辅助系统</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clinical Titration Decision Support</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 p-4 text-center no-print">
        <p className="text-[10px] font-bold text-red-500 mb-1">提示：本工具仅供临床参考，所有剂量调整应根据患者实际临床表现及合并症由执业医师最终决策。</p>
        <p className="text-[9px] text-slate-400">© 2025 临床医学工具集 | 支持离线使用</p>
      </footer>
    </div>
  );
};

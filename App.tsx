
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { calculateInitialDose, getSuggestedDose, DEFAULT_CONFIG } from './services/insulinLogic';
import { DailyRecord, InitialDoseResult, AppState, TitrationConfig } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'main' | 'history' | 'config' | 'desktop'>('main');
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('insulin_helper_v3_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.config) parsed.config = DEFAULT_CONFIG;
      return parsed;
    }
    return { profile: null, history: [], config: DEFAULT_CONFIG };
  });

  const [inputWeight, setInputWeight] = useState<number | ''>(state.profile?.weight || '');
  const [editingRecord, setEditingRecord] = useState<Partial<DailyRecord>>({
    date: new Date().toISOString().split('T')[0],
    fbg: 0, preLunchBG: 0, preDinnerBG: 0, bedtimeBG: 0,
    curBasal: 0, curBreakfast: 0, curLunch: 0, curDinner: 0
  });

  useEffect(() => {
    localStorage.setItem('insulin_helper_v3_state', JSON.stringify(state));
  }, [state]);

  const handleCalcInitial = () => {
    if (inputWeight) {
      const res = calculateInitialDose(Number(inputWeight), state.config);
      setState(prev => ({ ...prev, profile: res }));
      setEditingRecord(prev => ({
        ...prev,
        curBasal: res.basalDose,
        curBreakfast: res.breakfastDose,
        curLunch: res.lunchDose,
        curDinner: res.dinnerDose
      }));
    }
  };

  const handleSaveRecord = () => {
    const suggestions = getSuggestedDose(editingRecord, state.config);
    const newRecord: DailyRecord = {
      ...(editingRecord as DailyRecord),
      id: Date.now().toString(),
      sugBasal: suggestions.basal,
      sugBreakfast: suggestions.breakfast,
      sugLunch: suggestions.lunch,
      sugDinner: suggestions.dinner
    };
    setState(prev => ({ ...prev, history: [newRecord, ...prev.history].slice(0, 90) }));
    alert('✅ 滴定方案已保存至历史记录');
  };

  // 生成真正的“便携离线版”：克隆当前页面并注入当前状态
  const downloadStandalone = () => {
    const currentHtml = document.documentElement.outerHTML;
    // 注入脚本：在页面加载时自动恢复当前配置
    const injectScript = `<script>
      localStorage.setItem('insulin_helper_v3_state', JSON.stringify(${JSON.stringify(state)}));
      console.log('配置已注入');
    </script>`;
    
    const finalContent = currentHtml.replace('</head>', `${injectScript}</head>`);
    const blob = new Blob([finalContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `胰岛素滴定助手_配置导出_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const suggestions = getSuggestedDose(editingRecord, state.config);

  return (
    <Layout>
      {/* Tab 切换 */}
      <div className="no-print mb-6 flex bg-slate-200/50 p-1 rounded-xl max-w-sm mx-auto border border-slate-200">
        {[
          { id: 'main', label: '剂量滴定' },
          { id: 'history', label: '历史轨迹' },
          { id: 'config', label: '配置规则' },
          { id: 'desktop', label: '桌面版' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'main' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 上部：初始化表格 (完全参照图片布局) */}
          <div className="bg-white border border-slate-400 rounded-sm shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-400 text-slate-800">
                <tr>
                  <th className="p-3 border-r border-slate-400 text-left">体重</th>
                  <th className="p-3 border-r border-slate-400 w-16"></th>
                  <th className="p-3 border-r border-slate-400 text-left">总剂量</th>
                  <th className="p-3 border-r border-slate-400 text-left">三餐前胰岛素</th>
                  <th className="p-3 text-left">基础胰岛素</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-xl font-bold">
                  <td className="p-1 border-r border-slate-400">
                    <input 
                      type="number" 
                      value={inputWeight} 
                      onChange={e => setInputWeight(e.target.value === '' ? '' : Number(e.target.value))}
                      onBlur={handleCalcInitial}
                      className="w-full p-2 outline-none bg-blue-50/30 text-center" 
                      placeholder="100"
                    />
                  </td>
                  <td className="border-r border-slate-400 bg-slate-50"></td>
                  <td className="p-3 border-r border-slate-400 text-center text-slate-600">{state.profile?.totalDose || '--'}</td>
                  <td className="p-3 border-r border-slate-400 text-center text-slate-600">{state.profile?.breakfastDose || '--'}</td>
                  <td className="p-3 text-center text-slate-600">{state.profile?.basalDose || '--'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 下部：滴定调整表格 (完全参照图片布局) */}
          <div className="bg-white border border-slate-400 rounded-sm shadow-md overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <tbody>
                {/* 第一行标题 */}
                <tr className="bg-slate-50 border-b border-slate-400 font-bold">
                  <td className="p-3 border-r border-slate-400 w-40">日期</td>
                  <td className="p-3 border-r border-slate-400 w-40 text-center">项目</td>
                  <td className="p-3 border-r border-slate-400 text-center">空腹血糖</td>
                  <td className="p-3 border-r border-slate-400 text-center">午餐前血糖</td>
                  <td className="p-3 border-r border-slate-400 text-center">晚餐前血糖</td>
                  <td className="p-3 text-center">睡前血糖</td>
                </tr>
                
                {/* 第二行：血糖检测录入 */}
                <tr className="border-b border-slate-400 h-20">
                  <td rowSpan={3} className="p-2 border-r border-slate-400">
                    <input 
                      type="date" 
                      value={editingRecord.date}
                      onChange={e => setEditingRecord(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded font-bold text-center"
                    />
                  </td>
                  <td className="p-3 border-r border-slate-400 bg-slate-50/50 text-center font-bold">血糖检测</td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.fbg || ''} onChange={e => setEditingRecord(prev => ({ ...prev, fbg: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-2xl text-blue-600 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preLunchBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, preLunchBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-2xl text-slate-700 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preDinnerBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, preDinnerBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-2xl text-slate-700 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1">
                    <input type="number" step="0.1" value={editingRecord.bedtimeBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, bedtimeBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-2xl text-slate-700 outline-none" placeholder="0.0" />
                  </td>
                </tr>

                {/* 第三行标题：时段名称 */}
                <tr className="bg-slate-50/80 border-b border-slate-400 font-bold text-[11px] text-slate-500 uppercase tracking-tighter">
                  <td className="p-2 border-r border-slate-400 text-center align-bottom">目前胰岛素用量</td>
                  <td className="p-2 border-r border-slate-400 text-center">早餐前</td>
                  <td className="p-2 border-r border-slate-400 text-center">午餐前</td>
                  <td className="p-2 border-r border-slate-400 text-center">晚餐前</td>
                  <td className="p-2 text-center">基础/睡前</td>
                </tr>

                {/* 第四行：目前剂量录入 */}
                <tr className="border-b border-slate-400 bg-white">
                  <td className="border-r border-slate-400 bg-slate-50/30"></td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curBreakfast || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curBreakfast: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-lg outline-none" placeholder="--" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curLunch || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curLunch: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-lg outline-none" placeholder="--" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curDinner || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curDinner: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-lg outline-none" placeholder="--" />
                  </td>
                  <td className="p-1">
                    <input type="number" value={editingRecord.curBasal || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curBasal: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-lg outline-none" placeholder="--" />
                  </td>
                </tr>

                {/* 第五行：建议剂量 (高亮显示) */}
                <tr className="bg-blue-600 text-white font-bold h-24">
                  <td colSpan={2} className="p-4 border-r border-blue-700 text-right text-base">建议胰岛素用量 (U)</td>
                  <td className="p-4 border-r border-blue-700 text-center text-3xl font-black">
                    {suggestions.breakfast}<span className="text-[10px] ml-1 opacity-50 font-normal">U</span>
                  </td>
                  <td className="p-4 border-r border-blue-700 text-center text-3xl font-black">
                    {suggestions.lunch}<span className="text-[10px] ml-1 opacity-50 font-normal">U</span>
                  </td>
                  <td className="p-4 border-r border-blue-700 text-center text-3xl font-black">
                    {suggestions.dinner}<span className="text-[10px] ml-1 opacity-50 font-normal">U</span>
                  </td>
                  <td className="p-4 text-center text-3xl font-black bg-slate-900 border-l border-slate-800">
                    {suggestions.basal}<span className="text-[10px] ml-1 opacity-50 font-normal">U</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-center py-4">
            <button 
              onClick={handleSaveRecord}
              className="px-12 py-5 bg-slate-900 text-white font-bold rounded-xl shadow-xl hover:bg-black active:scale-95 transition-all flex items-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              保存今日方案
            </button>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-16">
          <div className="bg-white border border-slate-300 rounded shadow-sm">
            <div className="bg-slate-50 p-4 border-b border-slate-300 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">1. 初始分配参数</h3>
              <button 
                onClick={() => setState(prev => ({ ...prev, config: DEFAULT_CONFIG }))}
                className="text-[10px] bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-black uppercase tracking-wider"
              >
                还原默认算法
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">总剂量系数 (U/kg)</label>
                <input 
                  type="number" step="0.1" 
                  value={state.config.tddFactor} 
                  onChange={e => setState({...state, config: {...state.config, tddFactor: Number(e.target.value)}})}
                  className="w-full p-3 border border-slate-200 rounded font-bold text-xl outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">基础占比 (0.5 = 50%)</label>
                <input 
                  type="number" step="0.05" 
                  value={state.config.basalRatio} 
                  onChange={e => setState({...state, config: {...state.config, basalRatio: Number(e.target.value)}})}
                  className="w-full p-3 border border-slate-200 rounded font-bold text-xl outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-300 rounded shadow-sm">
            <div className="bg-slate-50 p-4 border-b border-slate-300 font-bold text-slate-800">2. 基础量滴定逻辑 (基于空腹血糖)</div>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div><p className="text-[10px] font-bold text-slate-400 mb-2">严重偏高阈值 (+6u)</p><input type="number" value={state.config.basalRules.fbgHighPlus6} onChange={e => setState({...state, config: {...state.config, basalRules: {...state.config.basalRules, fbgHighPlus6: Number(e.target.value)}}})} className="w-full p-3 border rounded font-bold" /></div>
              <div><p className="text-[10px] font-bold text-slate-400 mb-2">偏高阈值 (+4u)</p><input type="number" value={state.config.basalRules.fbgMedPlus4} onChange={e => setState({...state, config: {...state.config, basalRules: {...state.config.basalRules, fbgMedPlus4: Number(e.target.value)}}})} className="w-full p-3 border rounded font-bold" /></div>
              <div><p className="text-[10px] font-bold text-slate-400 mb-2">轻度偏高阈值 (+2u)</p><input type="number" value={state.config.basalRules.fbgLowPlus2} onChange={e => setState({...state, config: {...state.config, basalRules: {...state.config.basalRules, fbgLowPlus2: Number(e.target.value)}}})} className="w-full p-3 border rounded font-bold" /></div>
            </div>
          </div>

          <div className="bg-white border border-slate-300 rounded shadow-sm">
            <div className="bg-slate-50 p-4 border-b border-slate-300 font-bold text-slate-800">3. 餐时滴定逻辑 (错位滴定)</div>
            <div className="p-6 grid grid-cols-2 gap-8">
               <div><p className="text-[10px] font-bold text-slate-400 mb-2">显著偏高阈值 (+4u)</p><input type="number" value={state.config.prandialRules.bgHighPlus4} onChange={e => setState({...state, config: {...state.config, prandialRules: {...state.config.prandialRules, bgHighPlus4: Number(e.target.value)}}})} className="w-full p-3 border rounded font-bold" /></div>
               <div><p className="text-[10px] font-bold text-slate-400 mb-2">偏高阈值 (+2u)</p><input type="number" value={state.config.prandialRules.bgMedPlus2} onChange={e => setState({...state, config: {...state.config, prandialRules: {...state.config.prandialRules, bgMedPlus2: Number(e.target.value)}}})} className="w-full p-3 border rounded font-bold" /></div>
            </div>
          </div>

          <div className="bg-blue-900 text-blue-100 p-6 rounded-xl text-xs font-medium leading-relaxed shadow-lg">
            医生提示：修改这些参数将立即改变全局的建议计算结果。请在修改后重新检查“剂量滴定”页面的输出是否符合您的预期。
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="animate-in slide-in-from-bottom-4 duration-300 space-y-4">
          <div className="flex justify-between items-center bg-white p-4 border border-slate-300 rounded">
             <h3 className="font-bold text-slate-700">患者历史数据表</h3>
             <button onClick={() => window.print()} className="bg-blue-50 text-blue-600 px-4 py-2 rounded text-xs font-bold border border-blue-100">打印纸质报告</button>
          </div>
          <div className="bg-white border border-slate-400 rounded overflow-hidden shadow-sm">
             <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-400">
                   <tr>
                      <th className="p-3 border-r border-slate-300">日期</th>
                      <th className="p-3 border-r border-slate-300">血糖谱 (mmol/L)</th>
                      <th className="p-3">调整结果 (早/午/晚/基)</th>
                   </tr>
                </thead>
                <tbody>
                   {state.history.map(r => (
                     <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                        <td className="p-3 border-r border-slate-300 font-bold">{r.date}</td>
                        <td className="p-3 border-r border-slate-300 text-slate-500">{r.fbg} - {r.preLunchBG} - {r.preDinnerBG} - {r.bedtimeBG}</td>
                        <td className="p-3 font-bold text-blue-700">{r.sugBreakfast}u / {r.sugLunch}u / {r.sugDinner}u / {r.sugBasal}u</td>
                     </tr>
                   ))}
                   {state.history.length === 0 && (
                     <tr><td colSpan={3} className="p-10 text-center text-slate-400 italic">暂无历史记录</td></tr>
                   )}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {activeTab === 'desktop' && (
        <div className="max-w-md mx-auto py-10 animate-in zoom-in-95 duration-300">
           <div className="bg-white border border-slate-300 p-10 text-center rounded-2xl shadow-xl">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                 </svg>
              </div>
              <h2 className="text-xl font-black mb-2 text-slate-800">生成医生专用单文件版</h2>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                这将下载一个包含<b>当前所有配置规则和数据</b>的 HTML 文件。<br/>
                您可以将其分发给医生或备份到 U 盘，在任何电脑上双击即用，无需网络。
              </p>
              <button 
                onClick={downloadStandalone}
                className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95"
              >
                下载离线功能文件 (.html)
              </button>
           </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

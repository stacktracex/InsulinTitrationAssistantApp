
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { calculateInitialDose, getSuggestedDose, DEFAULT_CONFIG } from './services/insulinLogic';
import { DailyRecord, AppState, TitrationConfig, UserProfile } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'main' | 'history' | 'config' | 'users'>('users');
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('insulin_helper_v4_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        users: parsed.users || [],
        history: parsed.history || [],
        config: parsed.config || DEFAULT_CONFIG,
        activeUserPhone: parsed.activeUserPhone || null
      };
    }
    return { users: [], history: [], config: DEFAULT_CONFIG, activeUserPhone: null };
  });

  // 用户搜索与录入状态
  const [searchPhone, setSearchPhone] = useState('');
  const [newUser, setNewUser] = useState({ name: '', phone: '', weight: '' });

  // 记录录入状态
  const [editingRecord, setEditingRecord] = useState<Partial<DailyRecord>>({
    date: new Date().toISOString().split('T')[0],
    fbg: 0, preLunchBG: 0, preDinnerBG: 0, bedtimeBG: 0,
    curBasal: 0, curBreakfast: 0, curLunch: 0, curDinner: 0
  });

  useEffect(() => {
    localStorage.setItem('insulin_helper_v4_state', JSON.stringify(state));
  }, [state]);

  const currentUser = useMemo(() => 
    state.users.find(u => u.phone === state.activeUserPhone) || null
  , [state.users, state.activeUserPhone]);

  const userHistory = useMemo(() => 
    state.history.filter(h => h.userPhone === state.activeUserPhone)
  , [state.history, state.activeUserPhone]);

  // 处理用户注册/切换
  const handleUserAction = () => {
    const existing = state.users.find(u => u.phone === newUser.phone);
    if (existing) {
      setState(prev => ({ ...prev, activeUserPhone: existing.phone }));
      setActiveTab('main');
    } else if (newUser.name && newUser.phone && newUser.weight) {
      const u: UserProfile = {
        name: newUser.name,
        phone: newUser.phone,
        weight: Number(newUser.weight),
        createdAt: new Date().toISOString()
      };
      setState(prev => ({
        ...prev,
        users: [...prev.users, u],
        activeUserPhone: u.phone
      }));
      setActiveTab('main');
    } else {
      alert('请完整填写用户信息');
    }
  };

  const handleSaveRecord = () => {
    if (!state.activeUserPhone) return alert('请先选择或创建用户');
    const suggestions = getSuggestedDose(editingRecord, state.config);
    const newRecord: DailyRecord = {
      ...(editingRecord as DailyRecord),
      id: Date.now().toString(),
      userPhone: state.activeUserPhone,
      sugBasal: suggestions.basal,
      sugBreakfast: suggestions.breakfast,
      sugLunch: suggestions.lunch,
      sugDinner: suggestions.dinner
    };
    setState(prev => ({ ...prev, history: [newRecord, ...prev.history] }));
    alert('✅ 滴定方案已保存');
  };

  const exportToExcel = () => {
    if (userHistory.length === 0) return alert('暂无数据可导出');
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "日期,姓名,手机号,空腹血糖,午餐前血糖,晚餐前血糖,睡前血糖,原方案(早/午/晚/基),建议方案(早/午/晚/基)\n";
    
    userHistory.forEach(r => {
      const row = [
        r.date, currentUser?.name, r.userPhone,
        r.fbg, r.preLunchBG, r.preDinnerBG, r.bedtimeBG,
        `${r.curBreakfast}/${r.curLunch}/${r.curDinner}/${r.curBasal}`,
        `${r.sugBreakfast}/${r.sugLunch}/${r.sugDinner}/${r.sugBasal}`
      ].join(",");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `患者_${currentUser?.name}_滴定历史_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  const suggestions = getSuggestedDose(editingRecord, state.config);

  return (
    <Layout>
      {/* 顶部状态条 */}
      {currentUser && (
        <div className="no-print bg-blue-600 text-white p-3 mb-4 rounded-lg flex justify-between items-center shadow-md">
          <div className="text-sm">
            当前患者: <span className="font-bold text-lg ml-2">{currentUser.name}</span> 
            <span className="ml-4 opacity-80">({currentUser.phone})</span>
            <span className="ml-4 opacity-80">体重: {currentUser.weight}kg</span>
          </div>
          <button onClick={() => setActiveTab('users')} className="text-xs bg-blue-500 hover:bg-blue-400 px-3 py-1 rounded-md font-bold transition-colors">切换患者</button>
        </div>
      )}

      {/* 导航 */}
      <div className="no-print mb-6 flex bg-slate-200/50 p-1 rounded-xl max-w-md mx-auto border border-slate-200">
        {[
          { id: 'users', label: '患者管理' },
          { id: 'main', label: '剂量滴定' },
          { id: 'history', label: '导出历史' },
          { id: 'config', label: '配置规则' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-2xl border border-slate-300 shadow-xl">
            <h3 className="text-xl font-bold mb-6 text-slate-800">患者快速检索 / 登记</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input 
                  placeholder="患者姓名" 
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                  className="p-3 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input 
                  placeholder="手机号 (唯一识别)" 
                  value={newUser.phone}
                  onChange={e => setNewUser({...newUser, phone: e.target.value})}
                  className="p-3 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input 
                placeholder="体重 (kg)" 
                type="number"
                value={newUser.weight}
                onChange={e => setNewUser({...newUser, weight: e.target.value})}
                className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button 
                onClick={handleUserAction}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-blue-700"
              >
                进入系统
              </button>
            </div>
          </div>
          
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden">
            <div className="p-4 bg-slate-50 border-b font-bold text-slate-700">最近就诊患者</div>
            <div className="max-h-60 overflow-y-auto">
              {state.users.map(u => (
                <div 
                  key={u.phone} 
                  onClick={() => { setState(prev => ({...prev, activeUserPhone: u.phone})); setActiveTab('main'); }}
                  className="p-4 flex justify-between items-center hover:bg-blue-50 cursor-pointer border-b last:border-0"
                >
                  <div>
                    <p className="font-bold">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.phone}</p>
                  </div>
                  <div className="text-sm text-slate-500 font-bold">{u.weight}kg</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'main' && currentUser && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 精准还原图片表格布局 */}
          <div className="bg-white border border-slate-400 rounded-sm shadow-md overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <tbody>
                <tr className="bg-slate-50 border-b border-slate-400 font-bold">
                  <td className="p-3 border-r border-slate-400 w-40">日期</td>
                  <td className="p-3 border-r border-slate-400 w-40 text-center">项目</td>
                  <td className="p-3 border-r border-slate-400 text-center text-blue-700">空腹血糖</td>
                  <td className="p-3 border-r border-slate-400 text-center">午餐前血糖</td>
                  <td className="p-3 border-r border-slate-400 text-center">晚餐前血糖</td>
                  <td className="p-3 text-center">睡前血糖</td>
                </tr>
                
                <tr className="border-b border-slate-400 h-20">
                  <td rowSpan={3} className="p-2 border-r border-slate-400 bg-slate-50/20">
                    <input 
                      type="date" 
                      value={editingRecord.date}
                      onChange={e => setEditingRecord(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded font-bold text-center outline-none"
                    />
                  </td>
                  <td className="p-3 border-r border-slate-400 bg-slate-50/50 text-center font-bold">血糖检测</td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.fbg || ''} onChange={e => setEditingRecord(prev => ({ ...prev, fbg: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-3xl text-blue-600 outline-none" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preLunchBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, preLunchBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-3xl text-slate-700 outline-none" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preDinnerBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, preDinnerBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-3xl text-slate-700 outline-none" />
                  </td>
                  <td className="p-1">
                    <input type="number" step="0.1" value={editingRecord.bedtimeBG || ''} onChange={e => setEditingRecord(prev => ({ ...prev, bedtimeBG: parseFloat(e.target.value) || 0 }))} className="w-full h-full p-4 text-center font-black text-3xl text-slate-700 outline-none" />
                  </td>
                </tr>

                <tr className="bg-slate-50/80 border-b border-slate-400 font-bold text-[10px] text-slate-400 uppercase">
                  <td className="p-2 border-r border-slate-400 text-center">目前胰岛素用量 (U)</td>
                  <td className="p-2 border-r border-slate-400 text-center">早餐前</td>
                  <td className="p-2 border-r border-slate-400 text-center">午餐前</td>
                  <td className="p-2 border-r border-slate-400 text-center">晚餐前</td>
                  <td className="p-2 text-center">基础(睡前)</td>
                </tr>

                <tr className="border-b border-slate-400 bg-white">
                  <td className="border-r border-slate-400 bg-slate-50/30"></td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curBreakfast || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curBreakfast: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-xl outline-none" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curLunch || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curLunch: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-xl outline-none" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" value={editingRecord.curDinner || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curDinner: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-xl outline-none" />
                  </td>
                  <td className="p-1">
                    <input type="number" value={editingRecord.curBasal || ''} onChange={e => setEditingRecord(prev => ({ ...prev, curBasal: parseInt(e.target.value) || 0 }))} className="w-full p-2 text-center font-bold text-xl outline-none" />
                  </td>
                </tr>

                <tr className="bg-blue-600 text-white font-bold h-28 shadow-inner">
                  <td colSpan={2} className="p-4 border-r border-blue-700 text-right text-base font-medium">建议方案</td>
                  <td className="p-4 border-r border-blue-700 text-center text-4xl font-black">{suggestions.breakfast}<span className="text-[10px] ml-1 opacity-60">U</span></td>
                  <td className="p-4 border-r border-blue-700 text-center text-4xl font-black">{suggestions.lunch}<span className="text-[10px] ml-1 opacity-60">U</span></td>
                  <td className="p-4 border-r border-blue-700 text-center text-4xl font-black">{suggestions.dinner}<span className="text-[10px] ml-1 opacity-60">U</span></td>
                  <td className="p-4 text-center text-4xl font-black bg-slate-900 border-l border-slate-800">{suggestions.basal}<span className="text-[10px] ml-1 opacity-60">U</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-center pt-4">
            <button onClick={handleSaveRecord} className="px-16 py-5 bg-blue-600 text-white font-bold rounded-2xl shadow-xl hover:bg-blue-700 active:scale-95 transition-all">保存并更新追踪库</button>
          </div>
        </div>
      )}

      {activeTab === 'history' && currentUser && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white p-6 rounded-xl border border-slate-300 flex justify-between items-center shadow-sm">
            <div>
              <h3 className="text-lg font-bold">滴定追踪报告 - {currentUser.name}</h3>
              <p className="text-sm text-slate-400">共 {userHistory.length} 条记录</p>
            </div>
            <button 
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              导出 Excel 报告
            </button>
          </div>
          <div className="bg-white border border-slate-400 rounded-sm overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-300">
                <tr className="font-bold">
                  <th className="p-4 border-r">日期</th>
                  <th className="p-4 border-r">血糖趋势 (空/午/晚/睡)</th>
                  <th className="p-4">调整建议 (早/午/晚/基)</th>
                </tr>
              </thead>
              <tbody>
                {userHistory.map(r => (
                  <tr key={r.id} className="border-b hover:bg-slate-50">
                    <td className="p-4 border-r font-bold text-slate-700">{r.date}</td>
                    <td className="p-4 border-r font-medium">{r.fbg} - {r.preLunchBG} - {r.preDinnerBG} - {r.bedtimeBG} <span className="text-[10px] text-slate-300 ml-1">mmol/L</span></td>
                    <td className="p-4 font-black text-blue-700">{r.sugBreakfast}u / {r.sugLunch}u / {r.sugDinner}u / {r.sugBasal}u</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-20">
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 p-4 border-b font-bold flex justify-between items-center">
              <span>初始算法参数配置</span>
              <button onClick={() => setState({...state, config: DEFAULT_CONFIG})} className="text-[10px] text-blue-600 font-bold uppercase">重置为国家指南标准</button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">TDD 系数 (U/kg)</label>
                <input type="number" step="0.1" value={state.config.tddFactor} onChange={e => setState({...state, config: {...state.config, tddFactor: Number(e.target.value)}})} className="w-full p-4 border rounded-xl font-black text-2xl outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">基础占比 (默认 0.5)</label>
                <input type="number" step="0.05" value={state.config.basalRatio} onChange={e => setState({...state, config: {...state.config, basalRatio: Number(e.target.value)}})} className="w-full p-4 border rounded-xl font-black text-2xl outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
          
          <div className="p-6 bg-slate-900 text-slate-400 rounded-2xl text-xs leading-relaxed font-mono">
            // 系统日志: 算法已启用参数化驱动<br/>
            // 存储机制: 基于 LocalStorage 的持久化 KV 存储<br/>
            // 运行模式: 离线优先模式
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

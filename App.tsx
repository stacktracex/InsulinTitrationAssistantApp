
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { calculateInitialDose, getSuggestedDose, DEFAULT_CONFIG } from './services/insulinLogic';
import { DailyRecord, AppState, TitrationConfig, UserProfile } from './types';

// 定义 SheetJS 全局变量引用
declare const XLSX: any;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'main' | 'history' | 'userList' | 'config'>('login');
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('insulin_helper_v5_state');
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

  // 状态变量
  const [newUser, setNewUser] = useState({ name: '', phone: '', weight: '' });
  const [userListPage, setUserListPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState({ phone: '', name: '' });
  const [editingRecord, setEditingRecord] = useState<Partial<DailyRecord>>({
    date: new Date().toISOString().split('T')[0],
    fbg: 0, preLunchBG: 0, preDinnerBG: 0, bedtimeBG: 0,
    curBasal: 0, curBreakfast: 0, curLunch: 0, curDinner: 0
  });

  useEffect(() => {
    localStorage.setItem('insulin_helper_v5_state', JSON.stringify(state));
  }, [state]);

  const currentUser = useMemo(() => 
    state.users.find(u => u.phone === state.activeUserPhone) || null
  , [state.users, state.activeUserPhone]);

  // 手机号严格验证
  const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);

  const handleLogin = (phone?: string) => {
    const targetPhone = phone || newUser.phone;
    const existing = state.users.find(u => u.phone === targetPhone);
    
    if (existing) {
      setState(prev => ({ ...prev, activeUserPhone: existing.phone }));
      setActiveTab('main');
    } else {
      if (!phone) {
        if (!newUser.name || !newUser.weight) return alert('新用户请填写完整信息');
        if (!validatePhone(newUser.phone)) return alert('请输入正确的11位手机号');
        
        const u: UserProfile = {
          name: newUser.name,
          phone: newUser.phone,
          weight: Number(newUser.weight),
          createdAt: new Date().toLocaleString('zh-CN')
        };
        setState(prev => ({
          ...prev,
          users: [u, ...prev.users],
          activeUserPhone: u.phone
        }));
        setActiveTab('main');
      } else {
        alert('未找到该用户');
      }
    }
  };

  const PAGE_SIZE = 10;
  const totalUserPages = Math.ceil(state.users.length / PAGE_SIZE);
  const displayedUsers = state.users.slice((userListPage - 1) * PAGE_SIZE, userListPage * PAGE_SIZE);

  const filteredHistory = useMemo(() => {
    return state.history.filter(h => {
      const user = state.users.find(u => u.phone === h.userPhone);
      const phoneMatch = h.userPhone.includes(historyFilter.phone);
      const nameMatch = user?.name.includes(historyFilter.name);
      return phoneMatch && (historyFilter.name ? nameMatch : true);
    });
  }, [state.history, state.users, historyFilter]);

  const exportToExcel = (mode: 'current' | 'all') => {
    const dataToExport = mode === 'current' 
      ? filteredHistory
      : state.history;

    if (dataToExport.length === 0) return alert('没有可导出的数据');

    const worksheetData = dataToExport.map(r => {
      const user = state.users.find(u => u.phone === r.userPhone);
      return {
        '日期': r.date,
        '姓名': user?.name || '未知',
        '手机号': r.userPhone,
        '空腹血糖(mmol/L)': r.fbg,
        '午餐前血糖(mmol/L)': r.preLunchBG,
        '晚餐前血糖(mmol/L)': r.preDinnerBG,
        '睡前血糖(mmol/L)': r.bedtimeBG,
        '目前方案(早/午/晚/基)': `${r.curBreakfast}/${r.curLunch}/${r.curDinner}/${r.curBasal}`,
        '调整建议(早/午/晚/基)': `${r.sugBreakfast}/${r.sugLunch}/${r.sugDinner}/${r.sugBasal}`
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "滴定记录数据");
    
    const fileName = mode === 'current' 
      ? `筛选数据_${new Date().toISOString().split('T')[0]}.xlsx` 
      : `全量患者数据_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
  };

  const suggestions = getSuggestedDose(editingRecord, state.config);

  const handleSaveRecord = () => {
    if (!state.activeUserPhone) return alert('请先登录');
    
    const newRecord: DailyRecord = {
      id: Date.now().toString(),
      userPhone: state.activeUserPhone,
      date: editingRecord.date || new Date().toISOString().split('T')[0],
      fbg: editingRecord.fbg || 0,
      preLunchBG: editingRecord.preLunchBG || 0,
      preDinnerBG: editingRecord.preDinnerBG || 0,
      bedtimeBG: editingRecord.bedtimeBG || 0,
      curBasal: editingRecord.curBasal || 0,
      curBreakfast: editingRecord.curBreakfast || 0,
      curLunch: editingRecord.curLunch || 0,
      curDinner: editingRecord.curDinner || 0,
      sugBasal: suggestions.basal,
      sugBreakfast: suggestions.breakfast,
      sugLunch: suggestions.lunch,
      sugDinner: suggestions.dinner,
    };

    setState(prev => ({
      ...prev,
      history: [newRecord, ...prev.history]
    }));
    alert('保存成功！记录已存入报表中心');
  };

  if (activeTab === 'login') {
    return (
      <Layout>
        <div className="max-w-md mx-auto mt-10 space-y-8 animate-in fade-in duration-500">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl">
            <h2 className="text-2xl font-black text-slate-800 mb-2">患者登录 / 注册</h2>
            <p className="text-slate-400 text-sm mb-8">输入手机号即可快速开启滴定管理</p>
            
            <div className="space-y-4">
              <input 
                placeholder="手机号 (11位)" 
                value={newUser.phone}
                onChange={e => setNewUser({...newUser, phone: e.target.value})}
                className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg"
              />
              <div className="grid grid-cols-2 gap-4">
                <input 
                  placeholder="姓名" 
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                  className="p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input 
                  placeholder="体重(kg)" 
                  type="number"
                  value={newUser.weight}
                  onChange={e => setNewUser({...newUser, weight: e.target.value})}
                  className="p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button 
                onClick={() => handleLogin()}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
              >
                进入系统
              </button>
            </div>
          </div>

          <div className="bg-white/50 backdrop-blur p-6 rounded-3xl border border-white/40">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">最近患者 (最多显示5位)</h3>
            <div className="space-y-2">
              {state.users.slice(0, 5).map(u => (
                <div 
                  key={u.phone}
                  onClick={() => handleLogin(u.phone)}
                  className="flex items-center justify-between p-3 hover:bg-white rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-100 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                      {u.name[0]}
                    </div>
                    <span className="font-bold text-slate-700">{u.name}</span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{u.phone}</span>
                </div>
              ))}
              {state.users.length === 0 && <p className="text-center text-xs text-slate-300 py-4 italic">暂无患者记录</p>}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="no-print bg-slate-900 text-white p-4 mb-6 rounded-2xl flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">当前管理对象</span>
            <span className="text-lg font-black">{currentUser?.name || '未选择'} <span className="text-xs font-normal opacity-50 ml-2">{currentUser?.phone}</span></span>
          </div>
          <div className="h-8 w-px bg-slate-800"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-bold uppercase">注册时间</span>
            <span className="text-sm font-medium">{currentUser?.createdAt || '--'}</span>
          </div>
        </div>
        <button onClick={() => setActiveTab('login')} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-all">登出系统</button>
      </div>

      <nav className="no-print flex gap-2 mb-8 bg-slate-100 p-1.5 rounded-2xl max-w-2xl mx-auto border border-slate-200">
        {[
          { id: 'main', label: '剂量滴定', icon: '💉' },
          { id: 'userList', label: '患者档案', icon: '📋' },
          { id: 'history', label: '报表中心', icon: '📊' },
          { id: 'config', label: '全局规则', icon: '⚙️' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              if (tab.id === 'history' && currentUser) setHistoryFilter({ phone: currentUser.phone, name: currentUser.name });
            }}
            className={`flex-1 py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              activeTab === tab.id ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'main' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white border border-slate-400 rounded-sm shadow-md overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr className="bg-slate-50 border-b border-slate-400 font-bold text-center">
                  <td className="p-3 border-r border-slate-400 w-40 text-left italic">DECISION MATRIX<br/><span className="text-[10px] text-slate-400">决策矩阵</span></td>
                  <td className="p-3 border-r border-slate-400 w-40">ITEM<br/><span className="text-[10px] text-slate-400">监测项目</span></td>
                  <td className="p-3 border-r border-slate-400 text-blue-700 uppercase">F.B.G<br/><span className="text-[10px] text-blue-500">空腹血糖</span></td>
                  <td className="p-3 border-r border-slate-400 uppercase">Pre-Lunch<br/><span className="text-[10px] text-slate-400">午餐前血糖</span></td>
                  <td className="p-3 border-r border-slate-400 uppercase">Pre-Dinner<br/><span className="text-[10px] text-slate-400">晚餐前血糖</span></td>
                  <td className="p-3 uppercase">Bedtime<br/><span className="text-[10px] text-slate-400">睡前血糖</span></td>
                </tr>
                <tr className="border-b border-slate-400 h-28">
                  <td rowSpan={2} className="p-4 border-r border-slate-400 bg-slate-50/20 text-center">
                    <div className="text-[10px] font-bold text-slate-400 mb-1">DATE 日期</div>
                    <input type="date" value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} className="font-bold border rounded p-2 text-xs w-full text-center" />
                  </td>
                  <td className="p-3 border-r border-slate-400 bg-slate-50 text-center text-xs font-black leading-tight">
                    BLOOD GLUCOSE<br/>
                    <span className="text-blue-600 font-bold">血糖检测 (mmol/L)</span>
                  </td>
                  <td className="p-1 border-r border-slate-400 bg-blue-50/10">
                    <input type="number" step="0.1" value={editingRecord.fbg || ''} onChange={e => setEditingRecord({...editingRecord, fbg: parseFloat(e.target.value) || 0})} className="w-full h-full p-4 text-center font-black text-4xl text-blue-600 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preLunchBG || ''} onChange={e => setEditingRecord({...editingRecord, preLunchBG: parseFloat(e.target.value) || 0})} className="w-full h-full p-4 text-center font-black text-4xl text-slate-800 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1 border-r border-slate-400">
                    <input type="number" step="0.1" value={editingRecord.preDinnerBG || ''} onChange={e => setEditingRecord({...editingRecord, preDinnerBG: parseFloat(e.target.value) || 0})} className="w-full h-full p-4 text-center font-black text-4xl text-slate-800 outline-none" placeholder="0.0" />
                  </td>
                  <td className="p-1">
                    <input type="number" step="0.1" value={editingRecord.bedtimeBG || ''} onChange={e => setEditingRecord({...editingRecord, bedtimeBG: parseFloat(e.target.value) || 0})} className="w-full h-full p-4 text-center font-black text-4xl text-slate-800 outline-none" placeholder="0.0" />
                  </td>
                </tr>
                <tr className="border-b border-slate-400 bg-slate-50/50">
                  <td className="p-3 border-r border-slate-400 text-center text-xs font-black leading-tight">
                    CURRENT DOSE (U)<br/>
                    <span className="text-slate-500 font-bold">目前用量 (单位)</span>
                  </td>
                  {[
                    { key: 'curBreakfast', label: 'Morning (早前)' },
                    { key: 'curLunch', label: 'Lunch (午前)' },
                    { key: 'curDinner', label: 'Dinner (晚前)' },
                    { key: 'curBasal', label: 'Basal/Night (基础)' }
                  ].map((item, idx) => (
                    <td key={item.key} className={`p-1 ${idx < 3 ? 'border-r border-slate-400' : ''}`}>
                      <div className="text-[8px] text-center text-slate-400 font-bold uppercase mb-1">{item.label}</div>
                      <input type="number" value={(editingRecord as any)[item.key] || ''} onChange={e => setEditingRecord({...editingRecord, [item.key]: parseInt(e.target.value) || 0})} className="w-full text-center font-bold text-xl outline-none bg-transparent" placeholder="--" />
                    </td>
                  ))}
                </tr>
                <tr className="bg-blue-600 text-white font-bold h-36">
                  <td colSpan={2} className="p-6 border-r border-blue-700 text-right leading-tight">
                    <span className="text-lg uppercase">Suggested Plan</span><br/>
                    <span className="text-base font-bold opacity-80">建议剂量调整方案</span>
                  </td>
                  {[suggestions.breakfast, suggestions.lunch, suggestions.dinner].map((val, i) => (
                    <td key={i} className="p-4 border-r border-blue-700 text-center">
                      <div className="text-[10px] opacity-60 mb-2 uppercase">Prandial 建议</div>
                      <div className="text-5xl font-black">{val}<span className="text-xs opacity-40 ml-1">U</span></div>
                    </td>
                  ))}
                  <td className="p-4 text-center bg-slate-900 border-l-4 border-slate-950">
                    <div className="text-[10px] text-blue-400 mb-2 uppercase">Basal 基础建议</div>
                    <div className="text-5xl font-black">{suggestions.basal}<span className="text-xs opacity-40 ml-1">U</span></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-center">
            <button onClick={() => { handleSaveRecord(); setEditingRecord({ ...editingRecord, fbg: 0, preLunchBG: 0, preDinnerBG: 0, bedtimeBG: 0 }); }} className="px-20 py-6 bg-blue-600 text-white font-black rounded-3xl shadow-2xl hover:bg-blue-700 active:scale-95 transition-all text-xl">确认并存入追踪库</button>
          </div>
        </div>
      )}

      {activeTab === 'userList' && (
        <div className="space-y-6 animate-in slide-in-from-right duration-500">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="font-black text-slate-800">全量患者档案管理</h3>
              <span className="text-xs text-slate-400">共 {state.users.length} 名患者</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-4 text-left">姓名</th>
                  <th className="p-4 text-left">手机号</th>
                  <th className="p-4 text-left">体重</th>
                  <th className="p-4 text-left">注册时间</th>
                  <th className="p-4 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map(u => (
                  <tr key={u.phone} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                    <td className="p-4 font-bold text-slate-700">{u.name}</td>
                    <td className="p-4 text-slate-500 font-mono">{u.phone}</td>
                    <td className="p-4 text-slate-500">{u.weight}kg</td>
                    <td className="p-4 text-xs text-slate-400">{u.createdAt}</td>
                    <td className="p-4 text-center flex items-center justify-center gap-2">
                      <button 
                        onClick={() => {
                          setState(prev => ({ ...prev, activeUserPhone: u.phone }));
                          setActiveTab('main');
                        }}
                        className="text-xs bg-slate-900 text-white px-3 py-2 rounded-xl font-bold hover:bg-black transition-all"
                      >
                        选择患者
                      </button>
                      <button 
                        onClick={() => {
                          setHistoryFilter({ phone: u.phone, name: u.name });
                          setActiveTab('history');
                        }}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-xl font-bold hover:bg-blue-600 hover:text-white transition-all"
                      >
                        查看历史
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="p-6 flex justify-between items-center bg-slate-50/30">
              <button 
                disabled={userListPage === 1}
                onClick={() => setUserListPage(l => l - 1)}
                className="p-2 disabled:opacity-30 text-xs font-bold"
              >
                上一页
              </button>
              <div className="flex gap-2">
                {Array.from({ length: totalUserPages }).map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setUserListPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold ${userListPage === i + 1 ? 'bg-blue-600 text-white' : 'bg-white'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button 
                disabled={userListPage === totalUserPages}
                onClick={() => setUserListPage(l => l + 1)}
                className="p-2 disabled:opacity-30 text-xs font-bold"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800">滴定监测报表中心</h3>
                <p className="text-xs text-slate-400">支持基于手机号/姓名的多维数据检索</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => exportToExcel('current')} className="bg-blue-50 text-blue-600 px-6 py-3 rounded-2xl text-xs font-bold border border-blue-100 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  导出 Excel 筛选结果
                </button>
                <button onClick={() => exportToExcel('all')} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-bold shadow-lg shadow-slate-200">导出全量数据库</button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">筛选患者姓名</label>
                <input 
                  value={historyFilter.name}
                  onChange={e => setHistoryFilter({...historyFilter, name: e.target.value})}
                  placeholder="输入关键字..."
                  className="w-full p-3 bg-white border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">筛选手机号</label>
                <input 
                  value={historyFilter.phone}
                  onChange={e => setHistoryFilter({...historyFilter, phone: e.target.value})}
                  placeholder="输入号码..."
                  className="w-full p-3 bg-white border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-mono"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b">
                  <tr className="font-bold text-slate-400 uppercase">
                    <th className="p-4 text-left">Date 日期</th>
                    <th className="p-4 text-left">Patient 患者</th>
                    <th className="p-4 text-left">Glucose Trend 血糖趋势</th>
                    <th className="p-4 text-right">Adjustment 建议剂量 (早/午/晚/基)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.slice(0, 100).map(r => {
                    const user = state.users.find(u => u.phone === r.userPhone);
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-blue-50/30 transition-all">
                        <td className="p-4 font-bold text-slate-600">{r.date}</td>
                        <td className="p-4">
                          <p className="font-bold text-slate-800">{user?.name || '未知'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{r.userPhone}</p>
                        </td>
                        <td className="p-4 font-medium text-slate-500">
                          <span className="text-blue-600">{r.fbg}</span> → {r.preLunchBG} → {r.preDinnerBG} → {r.bedtimeBG}
                        </td>
                        <td className="p-4 text-right font-black text-blue-700 text-sm">
                          {r.sugBreakfast} / {r.sugLunch} / {r.sugDinner} / <span className="text-slate-900">{r.sugBasal}u</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredHistory.length === 0 && (
                    <tr><td colSpan={4} className="p-20 text-center text-slate-300 italic">未查询到符合条件的滴定记录</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in zoom-in-95 duration-500 pb-20">
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-8 border-b flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800">滴定决策引擎配置 (Algorithm Config)</h3>
                <p className="text-sm text-slate-400">修改全局算法权重、初始剂量分配比及滴定梯度</p>
              </div>
              <button onClick={() => setState({...state, config: DEFAULT_CONFIG})} className="text-xs bg-red-50 text-red-500 px-6 py-3 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest">Reset to Standard</button>
            </div>
            <div className="p-8 grid grid-cols-2 gap-12">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">初始剂量系数 (U / kg)</label>
                <input type="number" step="0.1" value={state.config.tddFactor} onChange={e => setState({...state, config: {...state.config, tddFactor: Number(e.target.value)}})} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-3xl outline-none focus:ring-4 focus:ring-blue-100" />
                <p className="text-[10px] text-slate-400 leading-relaxed italic">注: 初始每日总剂量 (TDD) 估算系数。根据患者体质量设定，通常以 0.5 U·kg-1 为估算基准。</p>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">基础胰岛素分配占比</label>
                <input type="number" step="0.05" value={state.config.basalRatio} onChange={e => setState({...state, config: {...state.config, basalRatio: Number(e.target.value)}})} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-3xl outline-none focus:ring-4 focus:ring-blue-100" />
                <p className="text-[10px] text-slate-400 leading-relaxed italic">注: TDD 中分配给基础量 (Basal) 的比例。默认为 0.5 (即 50%)，剩余 50% 由三餐均分。</p>
              </div>
            </div>
          </div>
          <div className="p-8 bg-blue-900 rounded-3xl text-white/80 text-sm leading-relaxed shadow-2xl relative overflow-hidden">
             <div className="relative z-10">
               <h4 className="font-black text-white mb-2 flex items-center gap-2 text-base">
                 <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                 System Core Engine Status
               </h4>
               <p className="opacity-70 text-xs">算法模式: 智能错位滴定 (FBG -> Basal, Post-Prandial Prediction -> Pre-Prandial adjustment)</p>
               <p className="opacity-70 text-xs mt-1">数据架构: 浏览器本地持久化 + SheetJS Excel 交互模块</p>
               <p className="opacity-70 text-xs mt-1">开发版本: v5.2 (桌面便携版兼容优化)</p>
             </div>
             <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

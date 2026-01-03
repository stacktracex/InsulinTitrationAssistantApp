
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from './components/Layout';
import { getSuggestedDose, DEFAULT_CONFIG, calculateInitialDose } from './services/insulinLogic';
import { DailyRecord, UserProfile } from './types';

declare const XLSX: any;

const DB_NAME = 'InsulinHelperDB';
const DB_VERSION = 1;
const STORES = {
  USERS: 'users',
  HISTORY: 'history',
  CONFIG: 'config'
};

// 自定义 Toast 组件
const Toast: React.FC<{ msg: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ msg, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const bgClass = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-blue-600';
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 ${bgClass} text-white px-6 py-3 rounded-2xl shadow-2xl z-[9999] animate-in fade-in slide-in-from-top-4 duration-300 font-bold text-sm flex items-center gap-2`}>
      <span>{type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span>
      {msg}
    </div>
  );
};

// 自定义确认模态框，解决沙箱环境 confirm() 被禁用的问题
const ConfirmModal: React.FC<{ title: string; content: string; onConfirm: () => void; onCancel: () => void }> = ({ title, content, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4 animate-in fade-in duration-200">
    <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl space-y-6">
      <h3 className="text-xl font-black text-slate-800">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed font-medium">{content}</p>
      <div className="flex gap-3">
        <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-black rounded-2xl active:scale-95 transition-all">确定删除</button>
        <button onClick={onCancel} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl active:scale-95 transition-all">取消</button>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'main' | 'history' | 'userList' | 'config'>('login');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [activeUserPhone, setActiveUserPhone] = useState<string | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmData, setConfirmData] = useState<{ title: string; content: string; onConfirm: () => void } | null>(null);

  const [newUser, setNewUser] = useState({ name: '', phone: '', weight: '' });
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userListPage, setUserListPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFilter, setHistoryFilter] = useState({ phone: '', name: '' });
  const [loginErrors, setLoginErrors] = useState<Record<string, boolean>>({});
  const [recordErrors, setRecordErrors] = useState<Record<string, boolean>>({});

  const initialEditingRecord: Partial<DailyRecord> = {
    date: new Date().toISOString().split('T')[0],
    fbg: undefined, preLunchBG: undefined, preDinnerBG: undefined, bedtimeBG: undefined,
    curBasal: 0, curBreakfast: 0, curLunch: 0, curDinner: 0
  };
  const [editingRecord, setEditingRecord] = useState<Partial<DailyRecord>>(initialEditingRecord);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => setToast({ msg, type });

  const getDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.USERS)) db.createObjectStore(STORES.USERS, { keyPath: 'phone' });
        if (!db.objectStoreNames.contains(STORES.HISTORY)) db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.CONFIG)) db.createObjectStore(STORES.CONFIG, { keyPath: 'id' });
      };
    });
  }, []);

  const dbOperation = useCallback(async (
    storeNames: string[], 
    mode: 'readonly' | 'readwrite', 
    operation: (transaction: IDBTransaction) => void
  ) => {
    const db = await getDB();
    const tx = db.transaction(storeNames, mode);
    const promise = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    operation(tx);
    return promise;
  }, [getDB]);

  useEffect(() => {
    const init = async () => {
      try {
        const db = await getDB();
        const tx = db.transaction([STORES.USERS, STORES.HISTORY, STORES.CONFIG], 'readonly');
        const uReq = tx.objectStore(STORES.USERS).getAll();
        const hReq = tx.objectStore(STORES.HISTORY).getAll();
        const cReq = tx.objectStore(STORES.CONFIG).get('main_config');
        uReq.onsuccess = () => setUsers(uReq.result || []);
        hReq.onsuccess = () => setHistory((hReq.result || []).sort((a: any, b: any) => Number(b.id) - Number(a.id)));
        cReq.onsuccess = () => cReq.result && setConfig(cReq.result.data);
        setIsDbReady(true);
      } catch (e) { showToast('数据库加载失败', 'error'); }
    };
    init();
  }, [getDB]);

  const currentUser = useMemo(() => users.find(u => u.phone === activeUserPhone) || null, [users, activeUserPhone]);
  const initialDoseCalc = useMemo(() => currentUser ? calculateInitialDose(currentUser.weight, config) : null, [currentUser, config]);
  const suggestions = useMemo(() => getSuggestedDose(editingRecord, config), [editingRecord, config]);

  const handleLogin = async (phone?: string) => {
    const targetPhone = phone || newUser.phone;
    const existing = users.find(u => u.phone === targetPhone);
    if (existing) {
      setActiveUserPhone(existing.phone);
      setActiveTab('main');
      setLoginErrors({});
      return;
    }
    if (!phone) {
      const errs: Record<string, boolean> = {};
      if (!newUser.phone || !/^1[3-9]\d{9}$/.test(newUser.phone)) errs.phone = true;
      if (!newUser.name) errs.name = true;
      if (!newUser.weight || Number(newUser.weight) <= 0) errs.weight = true;
      if (Object.keys(errs).length > 0) { setLoginErrors(errs); return; }
      const u: UserProfile = { name: newUser.name, phone: newUser.phone, weight: Number(newUser.weight), createdAt: new Date().toLocaleString() };
      await dbOperation([STORES.USERS], 'readwrite', (tx) => tx.objectStore(STORES.USERS).add(u));
      setUsers(prev => [u, ...prev]);
      setActiveUserPhone(u.phone);
      setActiveTab('main');
      showToast(`患者 ${u.name} 已建档`, 'success');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    await dbOperation([STORES.USERS], 'readwrite', (tx) => tx.objectStore(STORES.USERS).put(editingUser));
    setUsers(prev => prev.map(u => u.phone === editingUser.phone ? editingUser : u));
    setEditingUser(null);
    showToast('档案已更新', 'success');
  };

  const handleDeleteUser = (phone: string) => {
    setConfirmData({
      title: "注销患者档案",
      content: "该操作将物理删除此患者的所有资料及其在报表中心的所有滴定历史记录，且不可恢复。",
      onConfirm: async () => {
        await dbOperation([STORES.USERS, STORES.HISTORY], 'readwrite', (tx) => {
          tx.objectStore(STORES.USERS).delete(phone);
          const hStore = tx.objectStore(STORES.HISTORY);
          history.filter(h => h.userPhone === phone).forEach(h => hStore.delete(h.id));
        });
        setUsers(prev => prev.filter(u => u.phone !== phone));
        setHistory(prev => prev.filter(h => h.userPhone !== phone));
        if (activeUserPhone === phone) { setActiveUserPhone(null); setActiveTab('login'); }
        setConfirmData(null);
        showToast('已物理删除患者档案', 'success');
      }
    });
  };

  const handleSaveRecord = async () => {
    if (!activeUserPhone) return;
    const errs: Record<string, boolean> = {};
    ['fbg', 'preLunchBG', 'preDinnerBG', 'bedtimeBG'].forEach(k => { if ((editingRecord as any)[k] === undefined) errs[k] = true; });
    if (Object.keys(errs).length > 0) { setRecordErrors(errs); showToast('请补全血糖数据', 'error'); return; }

    const date = editingRecord.date || new Date().toISOString().split('T')[0];
    if (history.some(h => h.userPhone === activeUserPhone && h.date === date)) {
      showToast(`该患者今日已保存记录`, 'error');
      return;
    }

    const rec: DailyRecord = {
      id: Date.now().toString(),
      userPhone: activeUserPhone,
      date,
      fbg: editingRecord.fbg!, preLunchBG: editingRecord.preLunchBG!, preDinnerBG: editingRecord.preDinnerBG!, bedtimeBG: editingRecord.bedtimeBG!,
      curBasal: editingRecord.curBasal || 0, curBreakfast: editingRecord.curBreakfast || 0, curLunch: editingRecord.curLunch || 0, curDinner: editingRecord.curDinner || 0,
      sugBasal: suggestions.basal, sugBreakfast: suggestions.breakfast, sugLunch: suggestions.lunch, sugDinner: suggestions.dinner
    };

    await dbOperation([STORES.HISTORY], 'readwrite', (tx) => tx.objectStore(STORES.HISTORY).add(rec));
    setHistory(prev => [rec, ...prev]);
    setEditingRecord(initialEditingRecord);
    setActiveTab('history');
    showToast('滴定方案已归档', 'success');
  };

  const handleDeleteRecord = (id: string) => {
    setConfirmData({
      title: "删除历史记录",
      content: "确定从报表中心永久移除这条滴定记录吗？",
      onConfirm: async () => {
        await dbOperation([STORES.HISTORY], 'readwrite', (tx) => tx.objectStore(STORES.HISTORY).delete(id));
        setHistory(prev => prev.filter(h => h.id !== id));
        setConfirmData(null);
        showToast('记录已移除', 'success');
      }
    });
  };

  const exportToExcel = (mode: 'current' | 'all') => {
    const data = mode === 'current' ? filteredHistory : history;
    if (data.length === 0) return showToast('暂无数据', 'info');
    const sheetData = data.map(r => {
      const u = users.find(user => user.phone === r.userPhone);
      const total = r.sugBreakfast + r.sugLunch + r.sugDinner + r.sugBasal;
      return {
        '日期': r.date, '姓名': u?.name || '未知', '体重': u?.weight,
        '空腹血糖': r.fbg, '午餐前': r.preLunchBG, '晚餐前': r.preDinnerBG, '睡前': r.bedtimeBG,
        '建议早': r.sugBreakfast, '建议午': r.sugLunch, '建议晚': r.sugDinner, '建议基础': r.sugBasal, '建议总剂量': total
      };
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "滴定报表");
    XLSX.writeFile(wb, `胰岛素滴定_${mode}_${Date.now()}.xlsx`);
  };

  const filteredHistory = useMemo(() => history.filter(h => {
    const u = users.find(user => user.phone === h.userPhone);
    const phoneMatch = h.userPhone.includes(historyFilter.phone);
    const nameMatch = !historyFilter.name || (u?.name && u.name.includes(historyFilter.name));
    return phoneMatch && nameMatch;
  }), [history, users, historyFilter]);

  const displayedUsers = users.slice((userListPage - 1) * 10, userListPage * 10);
  const displayedHistory = filteredHistory.slice((historyPage - 1) * 10, historyPage * 10);

  if (!isDbReady) return <div className="flex items-center justify-center h-screen font-black text-slate-300">SYSTEM INITIALIZING...</div>;

  if (activeTab === 'login') {
    return (
      <Layout>
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="max-w-md mx-auto mt-10 space-y-6">
          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-2xl">
            <h2 className="text-3xl font-black text-slate-800 mb-8 italic">Clinic Entry 患者接入</h2>
            <div className="space-y-4">
              <input placeholder="手机号 (唯一识别码)" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} className={`w-full p-5 bg-slate-50 border-2 rounded-2xl font-bold text-lg outline-none transition-all ${loginErrors.phone ? 'border-red-600 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="患者姓名" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className={`w-full p-5 bg-slate-50 border-2 rounded-2xl font-bold outline-none transition-all ${loginErrors.name ? 'border-red-600 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
                <input placeholder="体重 (kg)" type="number" value={newUser.weight} onChange={e => setNewUser({...newUser, weight: e.target.value})} className={`w-full p-5 bg-slate-50 border-2 rounded-2xl font-bold outline-none transition-all ${loginErrors.weight ? 'border-red-600 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
              </div>
              <button onClick={() => handleLogin()} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-xl hover:bg-blue-700 shadow-xl active:scale-95 transition-all">创建档案并进入系统</button>
            </div>
          </div>
          {users.length > 0 && (
            <div className="bg-white/50 backdrop-blur p-6 rounded-[32px] border border-slate-200">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Quick Access 快捷接入</h3>
              <div className="space-y-2">
                {users.slice(0, 5).map(u => (
                  <div key={u.phone} onClick={() => handleLogin(u.phone)} className="flex items-center justify-between p-4 bg-white/80 hover:bg-white border border-transparent hover:border-blue-200 rounded-2xl cursor-pointer shadow-sm transition-all group">
                    <span className="font-bold text-slate-700 group-hover:text-blue-600">{u.name} <span className="text-[10px] opacity-30 ml-1">{u.phone}</span></span>
                    <span className="text-[10px] bg-blue-50 text-blue-500 px-3 py-1 rounded-full font-black">{u.weight} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {confirmData && <ConfirmModal {...confirmData} onCancel={() => setConfirmData(null)} />}

      <div className="bg-slate-900 text-white p-6 mb-8 rounded-[32px] flex justify-between items-center shadow-2xl no-print">
        <div className="flex gap-12">
          <div><div className="text-[10px] opacity-40 uppercase font-black tracking-widest">Patient Profile</div><div className="text-2xl font-black">{currentUser?.name} <span className="text-xs opacity-30 font-mono ml-1 font-normal">{currentUser?.phone}</span></div></div>
          <div><div className="text-[10px] opacity-40 uppercase font-black tracking-widest">Weight</div><div className="text-2xl font-black">{currentUser?.weight} <span className="text-xs opacity-30 font-normal">kg</span></div></div>
        </div>
        <button onClick={() => setActiveTab('login')} className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-black tracking-widest uppercase transition-all">更换患者</button>
      </div>

      <nav className="flex gap-2 mb-8 bg-slate-200/50 p-2 rounded-[24px] max-w-xl mx-auto no-print">
        {[{ id: 'main', l: '滴定决策', i: '💉' }, { id: 'userList', l: '患者档案', i: '📋' }, { id: 'history', l: '报表中心', i: '📊' }, { id: 'config', l: '算法配置', i: '⚙️' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all ${activeTab === t.id ? 'bg-white text-blue-600 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><span>{t.i}</span>{t.l}</button>
        ))}
      </nav>

      {activeTab === 'main' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
          {/* 指南规则：初始剂量预览 */}
          <div className="bg-blue-50 border border-blue-100 p-6 rounded-[32px] flex items-center justify-between shadow-sm">
            <div>
              <h4 className="text-blue-900 font-black text-sm mb-1 uppercase italic tracking-tighter">Initial Dose Reference 初始剂量估算</h4>
              <p className="text-blue-600/60 text-[10px] font-bold">规则：0.5 U/kg (50% 基础 | 三餐 1/3 比例分配)</p>
            </div>
            <div className="flex gap-6 items-center">
              <div className="text-center"><div className="text-[9px] font-black text-blue-400">TDD 总</div><div className="text-lg font-black text-blue-700">{initialDoseCalc?.totalDose}u</div></div>
              <div className="text-center"><div className="text-[9px] font-black text-blue-400">早/午/晚</div><div className="text-lg font-black text-blue-700">{initialDoseCalc?.breakfastDose}u</div></div>
              <div className="text-center"><div className="text-[9px] font-black text-blue-400">基础</div><div className="text-lg font-black text-blue-700">{initialDoseCalc?.basalDose}u</div></div>
            </div>
          </div>

          <div className="bg-white border-2 border-slate-100 rounded-[40px] overflow-hidden shadow-2xl">
            <table className="w-full text-center">
              <thead className="bg-slate-50 border-b-2 border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <tr><td className="p-5 border-r-2">Date</td><td className="p-5 border-r-2">FBG 空腹</td><td className="p-5 border-r-2">午餐前</td><td className="p-5 border-r-2">晚餐前</td><td className="p-5">睡前</td></tr>
              </thead>
              <tbody>
                <tr className="h-32">
                  <td className="p-5 border-r-2 bg-slate-50"><input type="date" value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} className="w-full bg-white border-none p-3 rounded-2xl font-bold text-xs shadow-inner" /></td>
                  {['fbg', 'preLunchBG', 'preDinnerBG', 'bedtimeBG'].map(k => (
                    <td key={k} className={`p-1 border-r-2 last:border-0 transition-all ${recordErrors[k] ? 'bg-red-50' : ''}`}>
                      <input type="number" step="0.1" value={(editingRecord as any)[k] ?? ''} onChange={e => setEditingRecord({...editingRecord, [k]: e.target.value === '' ? undefined : parseFloat(e.target.value)})} placeholder="--" className={`w-full h-full text-center font-black text-5xl outline-none bg-transparent ${recordErrors[k] ? 'text-red-700' : 'text-slate-800 focus:text-blue-600'}`} />
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-t-2 border-slate-100">
                  <td className="p-5 border-r-2 font-black text-[10px] text-slate-400 uppercase tracking-widest">Current Dose 目前剂量 (U)</td>
                  {['curBreakfast', 'curLunch', 'curDinner', 'curBasal'].map(k => (
                    <td key={k} className="p-5 border-r-2 last:border-0">
                      <div className="text-[9px] opacity-40 font-black uppercase mb-1">{k.replace('cur','')}</div>
                      <input type="number" value={(editingRecord as any)[k] ?? ''} onChange={e => setEditingRecord({...editingRecord, [k]: parseInt(e.target.value)||0})} className="w-full text-center font-black text-2xl outline-none bg-transparent text-slate-600 focus:text-blue-500" />
                    </td>
                  ))}
                </tr>
                <tr className="bg-blue-600 text-white h-40 font-black shadow-inner">
                  <td className="p-5 border-r-2 border-blue-700 text-right leading-tight pr-8">
                    <div className="text-[10px] opacity-50 uppercase mb-1 tracking-widest font-bold">Titration Suggestion</div>
                    <div className="text-xl">系统滴定方案</div>
                  </td>
                  {[suggestions.breakfast, suggestions.lunch, suggestions.dinner].map((s, i) => (
                    <td key={i} className="p-5 border-r-2 border-blue-700">
                      <div className="text-6xl tabular-nums">{s}<span className="text-xs opacity-40 ml-1">U</span></div>
                      <div className="text-[10px] opacity-40 mt-1 uppercase tracking-widest">Prandial</div>
                    </td>
                  ))}
                  <td className="p-5 bg-slate-900">
                    <div className="text-6xl text-blue-400 tabular-nums">{suggestions.basal}<span className="text-xs opacity-40 ml-1">U</span></div>
                    <div className="text-[10px] opacity-40 mt-1 uppercase tracking-widest text-blue-400/50">Basal</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-center pt-4">
            <button onClick={handleSaveRecord} className="px-24 py-6 bg-blue-600 text-white font-black rounded-[32px] shadow-2xl hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all text-xl">保存并归档滴定历史</button>
          </div>
        </div>
      )}

      {activeTab === 'userList' && (
        <div className="bg-white rounded-[40px] border-2 border-slate-100 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="p-8 bg-slate-50 border-b-2 flex justify-between items-center">
            <h3 className="font-black text-slate-800 text-xl italic uppercase">Patient Archives 档案管理</h3>
            <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-5 py-2 rounded-full uppercase tracking-widest">Total: {users.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-widest border-b">
              <tr><th className="p-6 text-left">患者姓名</th><th className="p-6 text-left">手机号</th><th className="p-6 text-left">体重 (kg)</th><th className="p-6 text-center">系统操作</th></tr>
            </thead>
            <tbody>
              {displayedUsers.map(u => (
                <tr key={u.phone} className="border-b last:border-0 hover:bg-slate-50 transition-all">
                  <td className="p-6 font-bold text-slate-700 text-base">{u.name}</td>
                  <td className="p-6 font-mono text-slate-500">{u.phone}</td>
                  <td className="p-6 font-black text-blue-600 text-lg">{u.weight} kg</td>
                  <td className="p-6 text-center space-x-4">
                    <button onClick={() => setEditingUser({...u})} className="text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all border border-blue-100">修改档案</button>
                    <button onClick={() => handleDeleteUser(u.phone)} className="text-[10px] font-black uppercase text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition-all border border-red-100">注销记录</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-6 flex justify-between items-center bg-slate-50/50">
            <button disabled={userListPage === 1} onClick={() => setUserListPage(l => l - 1)} className="text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all">Previous</button>
            <span className="text-[10px] font-black opacity-30 tracking-widest uppercase italic">Page {userListPage} of {Math.ceil(users.length/10) || 1}</span>
            <button disabled={userListPage >= Math.ceil(users.length/10)} onClick={() => setUserListPage(l => l + 1)} className="text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all">Next Page</button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[500] p-4 animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[48px] w-full max-w-sm shadow-2xl space-y-8">
            <h3 className="text-2xl font-black italic uppercase text-slate-800">Edit Profile</h3>
            <div className="space-y-5">
              <div><label className="text-[10px] font-black opacity-40 uppercase ml-1 tracking-widest">Full Name</label><input value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg" /></div>
              <div><label className="text-[10px] font-black opacity-40 uppercase ml-1 tracking-widest">Weight (kg)</label><input type="number" value={editingUser.weight} onChange={e => setEditingUser({...editingUser, weight: Number(e.target.value)})} className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg" /></div>
            </div>
            <div className="flex gap-4">
              <button onClick={handleUpdateUser} className="flex-1 py-5 bg-blue-600 text-white font-black rounded-3xl active:scale-95 transition-all text-lg">确认修改</button>
              <button onClick={() => setEditingUser(null)} className="flex-1 py-5 bg-slate-100 text-slate-400 font-black rounded-3xl active:scale-95 transition-all text-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
            <div className="flex justify-between items-center">
              <div><h3 className="text-2xl font-black uppercase italic text-slate-800">History Records</h3><p className="text-xs text-slate-400 tracking-tight font-medium">支持条件检索、单条物理删除及 Excel 全量导出</p></div>
              <div className="flex gap-3">
                <button onClick={() => exportToExcel('current')} className="bg-blue-50 text-blue-600 px-6 py-3 rounded-2xl text-xs font-black hover:bg-blue-100 transition-all">导出当前筛选</button>
                <button onClick={() => exportToExcel('all')} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black hover:bg-black transition-all shadow-lg">全量导出备份</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5 bg-slate-50 p-6 rounded-[32px]">
              <input placeholder="患者姓名检索" value={historyFilter.name} onChange={e => setHistoryFilter({...historyFilter, name: e.target.value})} className="p-5 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
              <input placeholder="手机号检索" value={historyFilter.phone} onChange={e => setHistoryFilter({...historyFilter, phone: e.target.value})} className="p-5 bg-white border border-slate-200 rounded-2xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
            </div>
            <div className="border border-slate-200 rounded-[32px] overflow-hidden shadow-inner overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-6 text-left whitespace-nowrap">Date</th>
                    <th className="p-6 text-left whitespace-nowrap">Patient (Wt)</th>
                    <th className="p-6 text-center whitespace-nowrap">Glucose Matrix (mmol/L)</th>
                    <th className="p-6 text-right whitespace-nowrap">Adjustment (U)</th>
                    <th className="p-6 text-right whitespace-nowrap">Total (U)</th>
                    <th className="p-6 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHistory.map(r => {
                    const u = users.find(user => user.phone === r.userPhone);
                    const totalDose = r.sugBreakfast + r.sugLunch + r.sugDinner + r.sugBasal;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-blue-50/10 transition-all">
                        <td className="p-6 font-bold text-slate-600 whitespace-nowrap">{r.date}</td>
                        <td className="p-6">
                          <div className="font-black text-slate-800 text-sm">{u?.name} ({u?.weight}kg)</div>
                          <div className="text-[10px] opacity-30 font-mono tracking-tighter">{r.userPhone}</div>
                        </td>
                        <td className="p-6 text-center font-bold text-slate-400">
                          <span className="text-blue-600 font-black">{r.fbg}</span> | {r.preLunchBG} | {r.preDinnerBG} | {r.bedtimeBG}
                        </td>
                        <td className="p-6 text-right font-black text-blue-700 text-sm tabular-nums tracking-tighter whitespace-nowrap">
                          {r.sugBreakfast}/{r.sugLunch}/{r.sugDinner}/<span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded ml-1 italic">{r.sugBasal}u</span>
                        </td>
                        <td className="p-6 text-right">
                          <span className="bg-blue-600 text-white px-3 py-1.5 rounded-full font-black tabular-nums shadow-sm">{totalDose} U</span>
                        </td>
                        <td className="p-6 text-center">
                          <button onClick={() => handleDeleteRecord(r.id)} className="text-red-500 font-black uppercase text-[10px] bg-red-50 px-4 py-2 rounded-xl hover:bg-red-600 hover:text-white transition-all">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedHistory.length === 0 && <tr><td colSpan={6} className="p-24 text-center text-slate-300 italic font-black text-lg">No records found.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center px-4">
              <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all">Previous</button>
              <div className="flex gap-2">
                {Array.from({ length: Math.ceil(filteredHistory.length/10) }).map((_, i) => (
                  <button key={i} onClick={() => setHistoryPage(i + 1)} className={`w-10 h-10 rounded-2xl text-[10px] font-black transition-all ${historyPage === i + 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{i+1}</button>
                ))}
              </div>
              <button disabled={historyPage >= Math.ceil(filteredHistory.length/10) || historyPage === 0} onClick={() => setHistoryPage(p => p + 1)} className="text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all">Next</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-500 pb-20">
          <div className="bg-white border-2 border-slate-100 rounded-[40px] p-12 shadow-sm">
            <h3 className="text-2xl font-black italic uppercase mb-10 border-b-2 border-slate-50 pb-6 text-slate-800">Algorithm Tuner</h3>
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">Initial Factor (U/kg)</label><input type="number" step="0.1" value={config.tddFactor} onChange={e => {const c={...config, tddFactor: Number(e.target.value)}; setConfig(c); dbOperation([STORES.CONFIG],'readwrite',tx=>tx.objectStore(STORES.CONFIG).put({id:'main_config',data:c}))}} className="w-full p-5 bg-slate-50 border-none rounded-2xl font-black text-4xl outline-none focus:ring-4 focus:ring-blue-100 transition-all" /></div>
              <div className="space-y-3"><label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">Basal Ratio (%)</label><input type="number" step="0.05" value={config.basalRatio} onChange={e => {const c={...config, basalRatio: Number(e.target.value)}; setConfig(c); dbOperation([STORES.CONFIG],'readwrite',tx=>tx.objectStore(STORES.CONFIG).put({id:'main_config',data:c}))}} className="w-full p-5 bg-slate-50 border-none rounded-2xl font-black text-4xl outline-none focus:ring-4 focus:ring-blue-100 transition-all" /></div>
            </div>
            <div className="mt-12 p-8 bg-slate-900 rounded-[32px] text-white/70 text-[12px] leading-relaxed font-mono uppercase italic border-l-8 border-blue-600">
              * Guideline Protocol (v11.0-Core): <br/>
              * FBG: &gt;10(+6U), 8-10(+4U), 7-7.9(+2U), &lt;4.4(-2U). <br/>
              * Prandial: Target 4.4-7.8 mmol/L. <br/>
              * Rounding: Standard Mathematical Rounding (Nearest Integer).
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

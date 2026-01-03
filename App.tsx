
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from './components/Layout';
import { getSuggestedDose, DEFAULT_CONFIG } from './services/insulinLogic';
import { DailyRecord, UserProfile } from './types';

declare const XLSX: any;

const DB_NAME = 'InsulinHelperDB';
const DB_VERSION = 1;
const STORES = {
  USERS: 'users',
  HISTORY: 'history',
  CONFIG: 'config'
};

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'main' | 'history' | 'userList' | 'config'>('login');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [activeUserPhone, setActiveUserPhone] = useState<string | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

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
      tx.onabort = () => reject(new Error("Transaction aborted"));
    });
    operation(tx);
    return promise;
  }, [getDB]);

  useEffect(() => {
    const init = async () => {
      try {
        const db = await getDB();
        const tx = db.transaction([STORES.USERS, STORES.HISTORY, STORES.CONFIG], 'readonly');
        const uStore = tx.objectStore(STORES.USERS);
        const hStore = tx.objectStore(STORES.HISTORY);
        const cStore = tx.objectStore(STORES.CONFIG);

        const uReq = uStore.getAll();
        const hReq = hStore.getAll();
        const cReq = cStore.get('main_config');

        uReq.onsuccess = () => setUsers(uReq.result || []);
        hReq.onsuccess = () => setHistory((hReq.result || []).sort((a: any, b: any) => Number(b.id) - Number(a.id)));
        cReq.onsuccess = () => cReq.result && setConfig(cReq.result.data);
        setIsDbReady(true);
      } catch (e) { showToast('DB Init Error', 'error'); }
    };
    init();
  }, [getDB]);

  const currentUser = useMemo(() => users.find(u => u.phone === activeUserPhone) || null, [users, activeUserPhone]);
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
      showToast(`患者 ${u.name} 已建档并登录`, 'success');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    await dbOperation([STORES.USERS], 'readwrite', (tx) => tx.objectStore(STORES.USERS).put(editingUser));
    setUsers(prev => prev.map(u => u.phone === editingUser.phone ? editingUser : u));
    setEditingUser(null);
    showToast('档案更新完成', 'success');
  };

  const handleDeleteUser = async (phone: string) => {
    if (!window.confirm('删除用户将连带删除其所有滴定历史，确定继续？')) return;
    await dbOperation([STORES.USERS, STORES.HISTORY], 'readwrite', (tx) => {
      tx.objectStore(STORES.USERS).delete(phone);
      const hStore = tx.objectStore(STORES.HISTORY);
      history.filter(h => h.userPhone === phone).forEach(h => hStore.delete(h.id));
    });
    setUsers(prev => prev.filter(u => u.phone !== phone));
    setHistory(prev => prev.filter(h => h.userPhone !== phone));
    if (activeUserPhone === phone) { setActiveUserPhone(null); setActiveTab('login'); }
    showToast('档案及历史已清空', 'success');
  };

  const handleSaveRecord = async () => {
    if (!activeUserPhone) return;
    const errs: Record<string, boolean> = {};
    ['fbg', 'preLunchBG', 'preDinnerBG', 'bedtimeBG'].forEach(k => { if ((editingRecord as any)[k] === undefined) errs[k] = true; });
    if (Object.keys(errs).length > 0) { setRecordErrors(errs); showToast('请补全血糖数据', 'error'); return; }

    const date = editingRecord.date || new Date().toISOString().split('T')[0];
    if (history.some(h => h.userPhone === activeUserPhone && h.date === date)) {
      showToast(`该患者在 ${date} 已有保存记录，请先删除旧记录`, 'error');
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
    showToast('滴定方案已保存至报表', 'success');
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('确定删除此条滴定记录？')) return;
    try {
      await dbOperation([STORES.HISTORY], 'readwrite', (tx) => {
        const store = tx.objectStore(STORES.HISTORY);
        store.delete(id);
      });
      setHistory(prev => prev.filter(h => h.id !== id));
      showToast('记录已移除', 'success');
    } catch (e) {
      showToast('删除失败', 'error');
    }
  };

  const exportToExcel = (mode: 'current' | 'all') => {
    const data = mode === 'current' ? filteredHistory : history;
    if (data.length === 0) return showToast('无数据', 'info');
    const sheetData = data.map(r => {
      const u = users.find(user => user.phone === r.userPhone);
      const total = r.sugBreakfast + r.sugLunch + r.sugDinner + r.sugBasal;
      return {
        '日期': r.date, 
        '姓名': u?.name || '未知',
        '手机号': r.userPhone,
        '体重(kg)': u?.weight || '--',
        '空腹血糖': r.fbg, 
        '午餐前血糖': r.preLunchBG, 
        '晚餐前血糖': r.preDinnerBG, 
        '睡前血糖': r.bedtimeBG,
        '建议早餐剂量': r.sugBreakfast,
        '建议午餐剂量': r.sugLunch,
        '建议晚餐剂量': r.sugDinner,
        '建议基础剂量': r.sugBasal,
        '全天总剂量': total
      };
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "滴定报表");
    XLSX.writeFile(wb, `胰岛素滴定_${mode === 'current' ? '筛选' : '全量'}_${Date.now()}.xlsx`);
  };

  const filteredHistory = useMemo(() => history.filter(h => {
    const u = users.find(user => user.phone === h.userPhone);
    const phoneMatch = h.userPhone.includes(historyFilter.phone);
    const nameMatch = !historyFilter.name || (u?.name && u.name.includes(historyFilter.name));
    return phoneMatch && nameMatch;
  }), [history, users, historyFilter]);

  const displayedUsers = users.slice((userListPage - 1) * 10, userListPage * 10);
  const displayedHistory = filteredHistory.slice((historyPage - 1) * 10, historyPage * 10);

  if (!isDbReady) return <div className="flex items-center justify-center h-screen font-black text-slate-400">LOADING DATABASE...</div>;

  if (activeTab === 'login') {
    return (
      <Layout>
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        <div className="max-w-md mx-auto mt-10 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl">
            <h2 className="text-2xl font-black text-slate-800 mb-6 italic">Clinic Portal 医生端</h2>
            <div className="space-y-4">
              <input placeholder="患者手机号" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} className={`w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none ${loginErrors.phone ? 'border-red-500 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="姓名" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className={`w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none ${loginErrors.name ? 'border-red-500 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
                <input placeholder="体重(kg)" type="number" value={newUser.weight} onChange={e => setNewUser({...newUser, weight: e.target.value})} className={`w-full p-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none ${loginErrors.weight ? 'border-red-500 bg-red-50' : 'border-transparent focus:ring-2 focus:ring-blue-500'}`} />
              </div>
              <button onClick={() => handleLogin()} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 shadow-lg active:scale-95 transition-all">建立档案并进入</button>
            </div>
          </div>
          {users.length > 0 && (
            <div className="bg-white/50 backdrop-blur p-6 rounded-3xl border border-slate-200">
              <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Quick Access 快捷入口</h3>
              <div className="space-y-2">
                {users.slice(0, 5).map(u => (
                  <div key={u.phone} onClick={() => handleLogin(u.phone)} className="flex justify-between items-center p-3 bg-white hover:border-blue-300 border border-transparent rounded-xl cursor-pointer shadow-sm transition-all">
                    <span className="font-bold text-slate-700">{u.name} <span className="text-[10px] opacity-40">{u.phone}</span></span>
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-black">{u.weight}kg</span>
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
      <div className="bg-slate-900 text-white p-6 mb-8 rounded-3xl flex justify-between items-center no-print shadow-xl">
        <div className="flex gap-10">
          <div><div className="text-[10px] opacity-40 uppercase font-black tracking-tighter">Current Patient</div><div className="text-xl font-black">{currentUser?.name}</div></div>
          <div><div className="text-[10px] opacity-40 uppercase font-black tracking-tighter">Body Weight</div><div className="text-xl font-black">{currentUser?.weight}kg</div></div>
        </div>
        <button onClick={() => setActiveTab('login')} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-2xl text-xs font-black transition-all">更换患者</button>
      </div>

      <nav className="flex gap-2 mb-8 bg-slate-200 p-1.5 rounded-2xl max-w-xl mx-auto no-print">
        {[{ id: 'main', l: '剂量滴定', i: '💉' }, { id: 'userList', l: '档案管理', i: '📋' }, { id: 'history', l: '报表中心', i: '📊' }, { id: 'config', l: '算法配置', i: '⚙️' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex-1 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${activeTab === t.id ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500'}`}>{t.i}{t.l}</button>
        ))}
      </nav>

      {activeTab === 'main' && (
        <div className="animate-in fade-in duration-500 space-y-6">
          <div className="bg-white border-2 border-slate-200 rounded-3xl overflow-hidden shadow-2xl">
            <table className="w-full text-center">
              <thead className="bg-slate-50 border-b-2 border-slate-200 text-[10px] font-black uppercase text-slate-400">
                <tr><td className="p-4 border-r-2">Date</td><td className="p-4 border-r-2">FBG 空腹</td><td className="p-4 border-r-2">午餐前</td><td className="p-4 border-r-2">晚餐前</td><td className="p-4">睡前</td></tr>
              </thead>
              <tbody>
                <tr className="h-32">
                  <td className="p-4 border-r-2 bg-slate-50"><input type="date" value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} className="w-full bg-white border p-2 rounded-xl font-bold text-xs" /></td>
                  {['fbg', 'preLunchBG', 'preDinnerBG', 'bedtimeBG'].map(k => (
                    <td key={k} className={`p-1 border-r-2 last:border-0 transition-all ${recordErrors[k] ? 'bg-red-100' : ''}`}>
                      <input type="number" step="0.1" value={(editingRecord as any)[k] ?? ''} onChange={e => setEditingRecord({...editingRecord, [k]: e.target.value === '' ? undefined : parseFloat(e.target.value)})} placeholder="--" className={`w-full h-full text-center font-black text-4xl outline-none bg-transparent ${recordErrors[k] ? 'text-red-700' : 'text-slate-800'}`} />
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="p-4 border-r-2 font-black text-[10px] text-slate-400 uppercase tracking-widest">Current Dose (U)</td>
                  {['curBreakfast', 'curLunch', 'curDinner', 'curBasal'].map(k => (
                    <td key={k} className="p-4 border-r-2 last:border-0">
                      <div className="text-[9px] opacity-40 font-black uppercase mb-1">{k.replace('cur','')}</div>
                      <input type="number" value={(editingRecord as any)[k] ?? ''} onChange={e => setEditingRecord({...editingRecord, [k]: parseInt(e.target.value)||0})} className="w-full text-center font-black text-xl outline-none bg-transparent" />
                    </td>
                  ))}
                </tr>
                <tr className="bg-blue-600 text-white h-36 font-black">
                  <td className="p-4 border-r-2 border-blue-700 text-right"><div className="text-[10px] opacity-50 uppercase mb-1 tracking-widest">Clinic Suggestion</div>系统建议方案</td>
                  {[suggestions.breakfast, suggestions.lunch, suggestions.dinner].map((s, i) => (
                    <td key={i} className="p-4 border-r-2 border-blue-700">
                      <div className="text-5xl tabular-nums">{s}<span className="text-xs opacity-40 ml-1">U</span></div>
                      <div className="text-[10px] opacity-40 mt-1 uppercase">Prandial</div>
                    </td>
                  ))}
                  <td className="p-4 bg-slate-900 border-l-4 border-slate-950">
                    <div className="text-5xl text-blue-400 tabular-nums">{suggestions.basal}<span className="text-xs opacity-40 ml-1">U</span></div>
                    <div className="text-[10px] opacity-40 mt-1 uppercase">Basal</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex justify-center"><button onClick={handleSaveRecord} className="px-20 py-5 bg-blue-600 text-white font-black rounded-3xl shadow-2xl hover:bg-blue-700 hover:scale-105 transition-all text-xl active:scale-95">保存今日滴定决策</button></div>
        </div>
      )}

      {activeTab === 'userList' && (
        <div className="bg-white rounded-3xl border-2 border-slate-200 overflow-hidden shadow-sm animate-in slide-in-from-right duration-500">
          <div className="p-6 bg-slate-50 border-b-2 flex justify-between items-center"><h3 className="font-black text-slate-800 text-lg uppercase italic">Archives</h3><span className="text-[10px] font-black bg-blue-100 text-blue-600 px-4 py-1.5 rounded-full uppercase">Count: {users.length}</span></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] text-slate-400 font-black uppercase tracking-widest border-b">
              <tr><th className="p-4 text-left">姓名</th><th className="p-4 text-left">手机号</th><th className="p-4 text-left">体重</th><th className="p-4 text-center">操作</th></tr>
            </thead>
            <tbody>
              {displayedUsers.map(u => (
                <tr key={u.phone} className="border-b last:border-0 hover:bg-slate-50 transition-all">
                  <td className="p-4 font-bold">{u.name}</td><td className="p-4 font-mono text-slate-500">{u.phone}</td><td className="p-4 font-black text-blue-600">{u.weight}kg</td>
                  <td className="p-4 text-center space-x-3">
                    <button onClick={() => setEditingUser({...u})} className="text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all">修改</button>
                    <button onClick={() => handleDeleteUser(u.phone)} className="text-[10px] font-black uppercase text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 flex justify-between items-center bg-slate-50/50">
            <button disabled={userListPage === 1} onClick={() => setUserListPage(l => l - 1)} className="text-xs font-black uppercase disabled:opacity-20 hover:text-blue-600 transition-all">Prev</button>
            <span className="text-[10px] font-black opacity-30 tracking-widest uppercase">Page {userListPage}</span>
            <button disabled={userListPage >= Math.ceil(users.length/10)} onClick={() => setUserListPage(l => l + 1)} className="text-xs font-black uppercase disabled:opacity-20 hover:text-blue-600 transition-all">Next</button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-[40px] w-full max-w-sm shadow-2xl space-y-6">
            <h3 className="text-xl font-black italic uppercase text-slate-800">Update Profile</h3>
            <div className="space-y-4">
              <div><label className="text-[10px] font-black opacity-40 uppercase ml-1 tracking-widest">Full Name</label><input value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
              <div><label className="text-[10px] font-black opacity-40 uppercase ml-1 tracking-widest">Weight (kg)</label><input type="number" value={editingUser.weight} onChange={e => setEditingUser({...editingUser, weight: Number(e.target.value)})} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
            </div>
            <div className="flex gap-4">
              <button onClick={handleUpdateUser} className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl active:scale-95 transition-all">确认修改</button>
              <button onClick={() => setEditingUser(null)} className="flex-1 py-4 bg-slate-100 text-slate-400 font-black rounded-2xl active:scale-95 transition-all">取消</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
              <div><h3 className="text-xl font-black uppercase italic text-slate-800">History Records</h3><p className="text-xs text-slate-400 tracking-tight">物理物理删除与全量导出，支持分页查询</p></div>
              <div className="flex gap-2">
                <button onClick={() => exportToExcel('current')} className="bg-blue-50 text-blue-600 px-5 py-2.5 rounded-xl text-xs font-black hover:bg-blue-100 transition-all">导出当前</button>
                <button onClick={() => exportToExcel('all')} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-black transition-all">全量备份</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl">
              <input placeholder="患者姓名" value={historyFilter.name} onChange={e => setHistoryFilter({...historyFilter, name: e.target.value})} className="p-4 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
              <input placeholder="手机号检索" value={historyFilter.phone} onChange={e => setHistoryFilter({...historyFilter, phone: e.target.value})} className="p-4 bg-white border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
            </div>
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-inner overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50 border-b text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4 text-left whitespace-nowrap">Date</th>
                    <th className="p-4 text-left whitespace-nowrap">Patient (Wt)</th>
                    <th className="p-4 text-center whitespace-nowrap">BG Matrix</th>
                    <th className="p-4 text-right whitespace-nowrap">Adjustment (U)</th>
                    <th className="p-4 text-right whitespace-nowrap">Total (U)</th>
                    <th className="p-4 text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedHistory.map(r => {
                    const u = users.find(user => user.phone === r.userPhone);
                    const totalDose = r.sugBreakfast + r.sugLunch + r.sugDinner + r.sugBasal;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-blue-50/20 transition-all">
                        <td className="p-4 font-bold text-slate-600 whitespace-nowrap">{r.date}</td>
                        <td className="p-4">
                          <div className="font-black text-slate-800">{u?.name} ({u?.weight}kg)</div>
                          <div className="text-[8px] opacity-40 font-mono tracking-tighter">{r.userPhone}</div>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-400">
                          <span className="text-blue-600">{r.fbg}</span> | {r.preLunchBG} | {r.preDinnerBG} | {r.bedtimeBG}
                        </td>
                        <td className="p-4 text-right font-black text-blue-700 tabular-nums tracking-tighter whitespace-nowrap">
                          {r.sugBreakfast}/{r.sugLunch}/{r.sugDinner}/<span className="text-slate-900 bg-slate-100 px-1 rounded">{r.sugBasal}u</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full font-black tabular-nums">{totalDose}u</span>
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleDeleteRecord(r.id)} className="text-red-500 font-black uppercase text-[8px] bg-red-50 px-2 py-1 rounded-lg hover:bg-red-600 hover:text-white transition-all">Del</button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedHistory.length === 0 && <tr><td colSpan={6} className="p-20 text-center text-slate-300 italic font-bold">No records found.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center px-2">
              <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="text-[10px] font-black uppercase opacity-40 hover:opacity-100 disabled:opacity-10 hover:text-blue-600 transition-all">Previous</button>
              <div className="flex gap-2">
                {Array.from({ length: Math.ceil(filteredHistory.length/10) }).map((_, i) => (
                  <button key={i} onClick={() => setHistoryPage(i + 1)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${historyPage === i + 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{i+1}</button>
                ))}
              </div>
              <button disabled={historyPage >= Math.ceil(filteredHistory.length/10) || historyPage === 0} onClick={() => setHistoryPage(p => p + 1)} className="text-[10px] font-black uppercase opacity-40 hover:opacity-100 disabled:opacity-10 hover:text-blue-600 transition-all">Next</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in-95 duration-500 pb-20">
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-8 shadow-sm">
            <h3 className="text-xl font-black italic uppercase mb-8 border-b-2 border-slate-100 pb-4 text-slate-800">Algorithm Tuner</h3>
            <div className="grid grid-cols-2 gap-10">
              <div className="space-y-2"><label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">Initial Factor (U/kg)</label><input type="number" step="0.1" value={config.tddFactor} onChange={e => {const c={...config, tddFactor: Number(e.target.value)}; setConfig(c); dbOperation([STORES.CONFIG],'readwrite',tx=>tx.objectStore(STORES.CONFIG).put({id:'main_config',data:c}))}} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-3xl outline-none focus:ring-4 focus:ring-blue-100 transition-all" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black opacity-40 uppercase tracking-widest ml-1">Basal Ratio (%)</label><input type="number" step="0.05" value={config.basalRatio} onChange={e => {const c={...config, basalRatio: Number(e.target.value)}; setConfig(c); dbOperation([STORES.CONFIG],'readwrite',tx=>tx.objectStore(STORES.CONFIG).put({id:'main_config',data:c}))}} className="w-full p-4 bg-slate-50 border-none rounded-2xl font-black text-3xl outline-none focus:ring-4 focus:ring-blue-100 transition-all" /></div>
            </div>
            <div className="mt-10 p-6 bg-slate-900 rounded-2xl text-white/70 text-[11px] leading-relaxed font-mono uppercase italic border-l-4 border-blue-600">
              * Guideline Rules (v10.0-PRO): <br/>
              * FBG: &gt;10(+6U), 8-10(+4U), 7-7.9(+2U), &lt;4.4(-2U). <br/>
              * Prandial: Target 4.4-7.8 mmol/L. <br/>
              * Shift: Post-meal BG titrates Pre-meal Dose.
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;

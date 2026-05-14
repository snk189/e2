import React, { useState, useEffect, useMemo } from 'react';
import EnvironmentSettings from './EnvironmentSettings';
import { 
  getPendingUsers, approveUser, rejectUser,
  getAdminUsers, adminAddUser, adminRemoveUser, adminBlockUser,
  adminUnblockUser, getAdminBlockedUsers, getAdminRejectedUsers,
  adminUnfreezeUser, adminRemoveData, getDemand,
  getTodayOrders
} from '../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const AdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('demand');
  const [userTab, setUserTab] = useState('pending');
  
  // States
  const [pendingUsers, setPendingUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [demandData, setDemandData] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Add User Form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newType, setNewType] = useState('n');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchAll = async () => {
    setError('');
    try {
      if (activeTab === 'users') {
        if (userTab === 'pending') setPendingUsers(await getPendingUsers());
        else if (userTab === 'users') setUsers(await getAdminUsers());
        else if (userTab === 'blocked') {
            setBlockedUsers(await getAdminBlockedUsers());
            setRejectedUsers(await getAdminRejectedUsers());
        }
      } else if (activeTab === 'demand') {
        const data = await getDemand();
        if (data && data.error) setError(data.error);
        else setDemandData(data);
      } else if (activeTab === 'orders') {
        setTodayOrders(await getTodayOrders());
      }
    } catch (err) {
      setError(err.error || 'Failed to fetch data');
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [activeTab, userTab]);

  // Actions
  const doAction = async (actionFn, successMsg) => {
    try {
      await actionFn();
      showToast(successMsg, 'success');
      fetchAll();
    } catch (err) {
      showToast(err.error || 'Action failed', 'error');
    }
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    doAction(() => adminAddUser(newUsername, newPassword, newType), 'User added successfully').then(() => {
        setNewUsername('');
        setNewPassword('');
    });
  };

  const toggleItem = (item) => {
      if (selectedItems.includes(item)) setSelectedItems(selectedItems.filter(i => i !== item));
      else setSelectedItems([...selectedItems, item]);
  };

  // Recharts data generation for Demand
  const chartData = useMemo(() => {
      if (!demandData || !demandData.today) return [];
      const hourMap = {};
      demandData.today.forEach(item => {
          if (item.hourly) {
              item.hourly.forEach(h => {
                  if (!hourMap[h.time]) hourMap[h.time] = { time: `${h.time}:00`, totalPred: 0, totalAct: 0 };
                  hourMap[h.time][`${item.item}_pred`] = h.predicted;
                  hourMap[h.time][`${item.item}_act`] = h.actual;
                  hourMap[h.time].totalPred += h.predicted;
                  hourMap[h.time].totalAct += h.actual;
              });
          }
      });
      return Object.values(hourMap).sort((a, b) => parseInt(a.time) - parseInt(b.time));
  }, [demandData]);

  // Colors for chart lines
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];

  return (
    <div className="min-h-screen bg-gray-50 pb-8 font-sans">
      {toast.show && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg font-bold text-sm animate-in slide-in-from-top-4 fade-in duration-300 backdrop-blur-md ${toast.type === 'error' ? 'bg-red-500/90 text-white border border-red-400' : 'bg-black/90 text-white border border-gray-700'}`}>
          {toast.message}
        </div>
      )}

      <header className="bg-black text-white p-5 rounded-b-3xl shadow-md mb-6">
        <div className="flex justify-between items-center mb-1">
           <h1 className="text-2xl font-extrabold tracking-tight">Admin Console</h1>
           <button onClick={onLogout} className="bg-red-500/80 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm hover:bg-red-600 transition-colors backdrop-blur-sm">Logout</button>
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {[
                { id: 'demand', label: 'Demand Analysis' },
                { id: 'orders', label: 'Data Maintenance' },
                { id: 'users', label: 'User Maintenance' }
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === tab.id ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4">
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 text-sm font-bold border border-red-200">{error}</div>}

        {activeTab === 'users' && (
            <div className="space-y-6">
                <div className="flex space-x-2 border-b border-gray-200 pb-2">
                    {[
                        { id: 'pending', label: 'Pending Approvals' },
                        { id: 'users', label: 'All Users' },
                        { id: 'blocked', label: 'Blocked / Frozen' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setUserTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${userTab === tab.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {userTab === 'pending' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold mb-4 border-b pb-2">Pending Approvals</h2>
                    {pendingUsers.length === 0 ? <div className="text-gray-500 text-sm font-bold opacity-50 text-center py-10">No pending requests.</div> : (
                        <div className="space-y-4">
                            {pendingUsers.map((user, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                <div className="mb-2 sm:mb-0 text-left w-full sm:w-auto">
                                <h3 className="font-black text-lg">{user.username}</h3>
                                <p className="text-xs font-bold text-gray-500 uppercase">Role: {user.type}</p>
                                </div>
                                <div className="flex space-x-2 w-full sm:w-auto overflow-x-auto">
                                <button onClick={() => doAction(() => approveUser(user.username), 'Approved!')} className="flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-sm">Approve</button>
                                <button onClick={() => doAction(() => rejectUser(user.username), 'Rejected!')} className="flex-1 sm:flex-none bg-orange-100 hover:bg-orange-200 text-orange-600 font-bold px-4 py-2 rounded-xl text-sm">Reject</button>
                                <button onClick={() => doAction(() => adminBlockUser(user.username), 'Blocked!')} className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-sm">Block</button>
                                </div>
                            </div>
                            ))}
                        </div>
                    )}
                    </div>
                )}

                {userTab === 'users' && (
                    <>
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-4 border-b pb-2">Add User</h2>
                        <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row gap-3">
                            <input type="text" placeholder="Username" required value={newUsername} onChange={e=>setNewUsername(e.target.value)} className="flex-1 bg-gray-100 rounded-xl px-4 py-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none" />
                            <input type="password" placeholder="Password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="flex-1 bg-gray-100 rounded-xl px-4 py-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all outline-none" />
                            <select value={newType} onChange={e=>setNewType(e.target.value)} className="bg-gray-100 rounded-xl px-4 py-2 border-transparent focus:bg-white outline-none font-bold text-gray-700">
                                <option value="n">Normal</option>
                                <option value="m">Management</option>
                                <option value="a">Admin</option>
                            </select>
                            <button type="submit" className="bg-black text-white font-bold px-6 py-2 rounded-xl hover:bg-gray-800 transition-colors">Add</button>
                        </form>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-4 border-b pb-2">All Users</h2>
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        {users.map((user, idx) => (
                            <div key={idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                <div><h3 className="font-bold text-gray-800">{user.username}</h3><span className="text-xs font-bold text-indigo-500 uppercase">Role: {user.type}</span></div>
                                <div className="flex space-x-2">
                                    <button onClick={() => doAction(() => adminRemoveUser(user.username), 'Removed')} className="text-red-500 text-xs font-bold px-3 py-1.5 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Remove</button>
                                    <button onClick={() => doAction(() => adminBlockUser(user.username), 'Blocked')} className="text-white text-xs font-bold px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700 transition-colors">Block</button>
                                </div>
                            </div>
                        ))}
                        </div>
                    </div>
                    </>
                )}

                {userTab === 'blocked' && (
                    <>
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-4 border-b pb-2 text-red-600">Permanently Blocked</h2>
                        {blockedUsers.length === 0 ? <p className="text-gray-500 text-sm font-bold opacity-50 py-4">No blocked users.</p> : (
                            <div className="grid gap-3 md:grid-cols-2">
                                {blockedUsers.map((u, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-red-50 rounded-2xl border border-red-100">
                                        <span className="font-bold text-red-900">{u.username}</span>
                                        <button onClick={() => doAction(() => adminUnblockUser(u.username), 'Unblocked')} className="text-xs font-bold bg-white text-black px-4 py-2 rounded-xl shadow-sm hover:bg-gray-100 transition-colors">Unblock</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-4 border-b pb-2 text-orange-500">Frozen / Rejected (Cooldown)</h2>
                        {rejectedUsers.length === 0 ? <p className="text-gray-500 text-sm font-bold opacity-50 py-4">No frozen users.</p> : (
                            <div className="grid gap-3">
                                {rejectedUsers.map((u, i) => {
                                    const diffDays = (Math.floor(Date.now() / 1000) - u.timestamp) / (60 * 60 * 24);
                                    let statusMsg = '';
                                    if (u.count >= 3) statusMsg = `${Math.max(0, Math.ceil(30 - diffDays))} days left`;
                                    else statusMsg = `${Math.max(0, Math.ceil((1 - diffDays) * 24))} hours left`;

                                    return (
                                    <div key={i} className="flex flex-col sm:flex-row justify-between items-center p-4 bg-orange-50 rounded-2xl border border-orange-100">
                                        <div className="w-full sm:w-auto text-left mb-3 sm:mb-0">
                                            <span className="font-black text-lg text-orange-900">{u.username}</span>
                                            <p className="text-xs font-bold text-orange-700 uppercase tracking-wide mt-1">Rejections: {u.count} • {statusMsg}</p>
                                        </div>
                                        <button onClick={() => doAction(() => adminUnfreezeUser(u.username), 'Unfrozen')} className="w-full sm:w-auto text-xs font-bold bg-white text-black px-4 py-2 rounded-xl shadow-sm hover:bg-gray-100 transition-colors">Unfreeze</button>
                                    </div>
                                )})}
                            </div>
                        )}
                    </div>
                    </>
                )}
            </div>
        )}

        {activeTab === 'orders' && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h2 className="text-xl font-bold">Data Maintenance</h2>
                    <button onClick={fetchAll} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Refresh</button>
                </div>
                {todayOrders.length === 0 ? <div className="text-gray-500 text-sm font-bold opacity-50 text-center py-10">No orders to maintain.</div> : (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-xl border border-gray-100 shadow-inner">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 sticky top-0 backdrop-blur-md">
                                <tr>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Time</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">User</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Item</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Qty</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Type</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {todayOrders.map((d, i) => {
                                    const timeStr = new Date(d.effective_time * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                    return (
                                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-medium text-gray-800">{timeStr}</td>
                                        <td className="p-3 font-medium text-gray-800">{d.username}</td>
                                        <td className="p-3 text-gray-600 capitalize">
                                          {d.item}
                                          {d.notes && <div className="text-xs text-amber-600 font-medium mt-1">Note: {d.notes}</div>}
                                        </td>
                                        <td className="p-3"><span className="bg-gray-200 text-gray-800 px-2 py-0.5 rounded font-bold text-xs">{d.quantity}</span></td>
                                        <td className="p-3">
                                            {d.is_prebooking ? <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold text-xs">Prebook</span> : d.takeaway ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold text-xs">Takeaway</span> : <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-xs">Dine-In</span>}
                                        </td>
                                        <td className="p-3 text-right flex justify-end items-center">
                                            <button onClick={() => doAction(() => adminRemoveData(d.id), 'Removed')} className="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">Remove</button>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'demand' && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h2 className="text-xl font-bold">AI Demand Analysis & Predictions</h2>
                    <button onClick={fetchAll} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Refresh Model</button>
                </div>
                {!demandData ? <div className="text-center py-10 font-bold text-indigo-400 animate-pulse">Generating Analysis...</div> : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {chartData.length > 0 && (
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mt-4">
                                <h3 className="font-bold text-lg mb-4 text-gray-800 flex justify-between items-center">
                                    <span>Hourly Prediction Overview</span>
                                </h3>
                                
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                            <XAxis dataKey="time" tick={{fontSize: 12, fill: '#6b7280'}} />
                                            <YAxis tick={{fontSize: 12, fill: '#6b7280'}} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                                            <Legend />
                                            
                                            {selectedItems.length === 0 && <Line type="monotone" name="Total Predicted" dataKey="totalPred" stroke="#6366f1" strokeWidth={3} activeDot={{ r: 6 }} />}
                                            {selectedItems.length === 0 && <Line type="monotone" name="Total Actual" dataKey="totalAct" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} />}
                                            
                                            {demandData.today.filter(i => selectedItems.includes(i.item)).map((item, idx) => (
                                                <React.Fragment key={item.item}>
                                                    <Line type="monotone" name={`${item.item} (Pred)`} dataKey={`${item.item}_pred`} stroke={colors[idx % colors.length]} strokeWidth={3} strokeDasharray="5 5" />
                                                    <Line type="monotone" name={`${item.item} (Act)`} dataKey={`${item.item}_act`} stroke={colors[idx % colors.length]} strokeWidth={3} activeDot={{ r: 6 }} />
                                                </React.Fragment>
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Selectors */}
                                <div className="flex flex-wrap gap-2 mt-6 justify-center">
                                    <button onClick={() => setSelectedItems([])} className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all ${selectedItems.length === 0 ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>Total Demand</button>
                                    {demandData.today.map((item, idx) => (
                                        <button key={item.item} onClick={() => toggleItem(item.item)} className={`px-4 py-1.5 text-xs font-bold rounded-full border transition-all flex items-center ${selectedItems.includes(item.item) ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                                            <span className="w-2 h-2 inline-block rounded-full mr-2" style={{backgroundColor: colors[idx % colors.length]}}></span>
                                            {item.item}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100/50 shadow-sm relative overflow-hidden">
                                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">Total Revenue</p>
                                <p className="text-3xl font-black text-indigo-900">₹{demandData.financials?.totalRevenue || 0}</p>
                            </div>
                            <div className="bg-gradient-to-br from-red-50 to-orange-50 p-5 rounded-2xl border border-red-100/50 shadow-sm relative overflow-hidden">
                                <p className="text-xs text-red-500 font-bold uppercase tracking-wider mb-1">Total Cost</p>
                                <p className="text-3xl font-black text-red-900">₹{demandData.financials?.totalCost || 0}</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-100/50 shadow-sm relative overflow-hidden">
                                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">Net Profit</p>
                                <p className="text-3xl font-black text-emerald-900">₹{demandData.financials?.netProfit || 0}</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-bold text-lg mb-4 text-gray-800 flex items-center"><span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span> Today's Performance</h3>
                            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                                {demandData.today && demandData.today.map((item, i) => (
                                    <div key={i} className="bg-white p-4 rounded-2xl flex justify-between items-center border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                        <div>
                                            <p className="font-black text-lg text-gray-900">{item.item}</p>
                                            <p className="text-xs font-medium text-gray-500 mt-1">Yest: {item.yesterday} • Profit: ₹{item.profit}</p>
                                        </div>
                                        <div className="text-right flex space-x-4 items-center">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] uppercase font-bold text-gray-400">Predicted</span>
                                                <span className="font-black text-indigo-600 text-xl leading-none">{item.predicted}</span>
                                            </div>
                                            <div className="w-px h-8 bg-gray-200"></div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] uppercase font-bold text-gray-400">Actual</span>
                                                <span className="font-black text-emerald-500 text-xl leading-none">{item.actual}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-lg overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -mr-20 -mt-20"></div>
                            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 -ml-20 -mb-20"></div>
                            
                            <h3 className="font-bold text-lg mb-6 relative z-10 flex items-center"><span className="w-2 h-2 bg-yellow-400 rounded-full mr-2 shadow-[0_0_8px_rgba(250,204,21,0.8)]"></span> Tomorrow's Forecast</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 relative z-10">
                                {demandData.tomorrow && demandData.tomorrow.map((item, i) => (
                                    <div key={i} className="bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl text-center hover:bg-white/20 transition-colors cursor-default">
                                        <p className="text-sm font-bold text-indigo-200 uppercase tracking-wider mb-2">{item.item}</p>
                                        <p className="text-5xl font-black text-white">{item.predicted}</p>
                                        <p className="text-[10px] text-gray-300 mt-2 font-medium uppercase tracking-widest">Est. Orders</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

      </main>
    </div>
  );
};

export default AdminDashboard;

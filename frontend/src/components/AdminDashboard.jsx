import React, { useState, useEffect } from 'react';
import { 
  getPendingUsers, approveUser, rejectUser,
  getAdminUsers, adminAddUser, adminRemoveUser, adminBlockUser,
  adminUnblockUser, getAdminBlockedUsers, getAdminRejectedUsers,
  adminUnfreezeUser, getAdminRecentData, adminRemoveData, getDemand
} from '../services/api';

const AdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('pending');
  
  // States
  const [pendingUsers, setPendingUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [recentData, setRecentData] = useState([]);
  const [demandData, setDemandData] = useState(null);

  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'pending') {
        setPendingUsers(await getPendingUsers());
      } else if (activeTab === 'users') {
        setUsers(await getAdminUsers());
      } else if (activeTab === 'blocked') {
        setBlockedUsers(await getAdminBlockedUsers());
        setRejectedUsers(await getAdminRejectedUsers());
      } else if (activeTab === 'dataset') {
        setRecentData(await getAdminRecentData());
      } else if (activeTab === 'demand') {
        const data = await getDemand();
        if (data && data.error) setError(data.error);
        else setDemandData(data);
      }
    } catch (err) {
      setError(err.error || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [activeTab]);

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
           <button onClick={onLogout} className="bg-red-500/80 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm hover:bg-red-600 transition-colors backdrop-blur-sm">Exit</button>
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {[
                { id: 'pending', label: 'Pending' },
                { id: 'users', label: 'Manage Users' },
                { id: 'blocked', label: 'Blocked / Frozen' },
                { id: 'dataset', label: 'Dataset' },
                { id: 'demand', label: 'Demand Analysis' }
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

        {activeTab === 'pending' && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-4 border-b pb-2">Pending Approvals</h2>
              {loading ? <div className="text-center py-4">Loading...</div> : pendingUsers.length === 0 ? <div className="text-gray-500 text-sm font-bold opacity-50 text-center py-10">No pending requests.</div> : (
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

        {activeTab === 'users' && (
            <div className="space-y-6">
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
                        <button type="submit" className="bg-black text-white font-bold px-6 py-2 rounded-xl hover:bg-gray-800 transition-colors">Add User</button>
                    </form>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold mb-4 border-b pb-2">All Users</h2>
                    {loading ? <div className="text-center py-4">Loading...</div> : (
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
                    )}
                </div>
            </div>
        )}

        {activeTab === 'blocked' && (
            <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold mb-4 border-b pb-2 text-red-600">Permanently Blocked Users</h2>
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
                    <h2 className="text-xl font-bold mb-4 border-b pb-2 text-orange-500">Frozen / Rejected Users (Cooldown)</h2>
                    {rejectedUsers.length === 0 ? <p className="text-gray-500 text-sm font-bold opacity-50 py-4">No frozen users.</p> : (
                        <div className="grid gap-3">
                            {rejectedUsers.map((u, i) => {
                                const diffDays = (Math.floor(Date.now() / 1000) - u.timestamp) / (60 * 60 * 24);
                                let statusMsg = '';
                                if (u.count >= 3) statusMsg = `${Math.max(0, Math.ceil(30 - diffDays))} days left of 30-day freeze`;
                                else statusMsg = `${Math.max(0, Math.ceil((1 - diffDays) * 24))} hours left of 1-day freeze`;

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
            </div>
        )}

        {activeTab === 'dataset' && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 overflow-hidden">
                <h2 className="text-xl font-bold mb-2 border-b pb-2">Recent Dataset Entries</h2>
                <p className="text-xs font-medium text-gray-500 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">Remove recent anomalous orders to correct the model's training data. Changes will automatically trigger a model retraining in the background.</p>
                {loading ? <div className="py-4 text-center">Loading...</div> : (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-gray-100 shadow-inner">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 sticky top-0 backdrop-blur-md">
                                <tr>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">User</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Item</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Slot</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs">Qty</th>
                                    <th className="p-3 font-bold uppercase tracking-wider text-xs text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {recentData.map((d, i) => (
                                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-3 font-medium text-gray-800">{d.username}</td>
                                        <td className="p-3 text-gray-600 capitalize">{d.item}</td>
                                        <td className="p-3 text-gray-600">{d.time_slot}:00</td>
                                        <td className="p-3"><span className="bg-gray-200 text-gray-800 px-2 py-0.5 rounded font-bold text-xs">{d.quantity}</span></td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => doAction(() => adminRemoveData(d.id), 'Datapoint removed')} className="text-red-500 hover:text-red-700 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">Remove</button>
                                        </td>
                                    </tr>
                                ))}
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
                {loading ? <div className="text-center py-10 font-bold text-indigo-400 animate-pulse">Generating Analysis...</div> : demandData ? (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100/50 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 -mr-4 -mt-4 w-16 h-16 bg-indigo-200 rounded-full opacity-20"></div>
                                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">Total Revenue</p>
                                <p className="text-3xl font-black text-indigo-900">₹{demandData.financials?.totalRevenue || 0}</p>
                            </div>
                            <div className="bg-gradient-to-br from-red-50 to-orange-50 p-5 rounded-2xl border border-red-100/50 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 -mr-4 -mt-4 w-16 h-16 bg-red-200 rounded-full opacity-20"></div>
                                <p className="text-xs text-red-500 font-bold uppercase tracking-wider mb-1">Total Cost</p>
                                <p className="text-3xl font-black text-red-900">₹{demandData.financials?.totalCost || 0}</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-100/50 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 -mr-4 -mt-4 w-16 h-16 bg-emerald-200 rounded-full opacity-20"></div>
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
                ) : <div className="text-gray-500 text-sm font-medium py-10 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">No analysis data available. The background model is likely running. Refresh in a few seconds.</div>}
            </div>
        )}

      </main>
    </div>
  );
};

export default AdminDashboard;

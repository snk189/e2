import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  Database,
  LogOut,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
  Settings,
  CheckCircle2,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import EnvironmentSettings from './EnvironmentSettings';
import {
  getPendingUsers,
  approveUser,
  rejectUser,
  getAdminUsers,
  adminAddUser,
  adminRemoveUser,
  adminBlockUser,
  adminUnblockUser,
  getAdminBlockedUsers,
  getAdminRejectedUsers,
  adminUnfreezeUser,
  adminRemoveData,
  adminChangePassword,
  getDemand,
  getOrdersByDate,
  getDemandByDate,
  getMenuIntelligence,
  retrainModel,
  getModelStatus,
  getModelStats,
  triggerOptunaTuning
} from '../services/api';
import { MENU_ITEMS } from '../data/items';

const CHART_COLORS = [
  '#f43f5e', // rose
  '#3b82f6', // blue
  '#10b981', // emerald
  '#eab308', // yellow
  '#8b5cf6', // violet
  '#f97316', // orange
  '#14b8a6', // teal
  '#ec4899', // pink
];

const AdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('demand');
  const [userTab, setUserTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [demandData, setDemandData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [maintenanceDate, setMaintenanceDate] = useState(() => toDateInput(new Date()));
  const [maintenanceUserId, setMaintenanceUserId] = useState('');
  const [showAllDays, setShowAllDays] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '' });
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newType, setNewType] = useState('n');


  const showToast = (message) => {
    setToast({ show: true, message });
    window.setTimeout(() => setToast({ show: false, message: '' }), 2600);
  };

  const fetchAll = useCallback(async () => {
    setError('');
    try {
      if (activeTab === 'users') {
        if (userTab === 'pending') setPendingUsers(await getPendingUsers());
        if (userTab === 'users') setUsers(await getAdminUsers());
        if (userTab === 'blocked') {
          setBlockedUsers(await getAdminBlockedUsers());
          setRejectedUsers(await getAdminRejectedUsers());
        }
      }
      if (activeTab === 'demand') {
        const data = await getDemand();
        if (data?.error) setError(data.error);
        else setDemandData(data);
      }
      if (activeTab === 'orders') {
        const data = await getOrdersByDate(showAllDays ? '' : maintenanceDate, maintenanceUserId);
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err.error || err.message || 'Failed to fetch data.');
    }
  }, [activeTab, userTab, maintenanceDate, maintenanceUserId, showAllDays]);

  useEffect(() => {
    fetchAll();
    const interval = window.setInterval(fetchAll, 5000);
    return () => window.clearInterval(interval);
  }, [fetchAll]);

  const doAction = async (actionFn, successMsg) => {
    try {
      await actionFn();
      showToast(successMsg);
      fetchAll();
    } catch (err) {
      showToast(err.error || 'Action failed.');
    }
  };

  const handleAddUser = (event) => {
    event.preventDefault();
    doAction(() => adminAddUser(newUsername.trim(), newPassword, newType), 'User added.').then(() => {
      setNewUsername('');
      setNewPassword('');
    });
  };

  return (
    <div className="app-bg admin-theme min-h-dvh">
      <div className={`cn-toast ${toast.show ? 'show' : ''}`}>{toast.message}</div>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />

      <main className="app-shell-narrow">
        {error && (
          <div className="mb-5 rounded-3xl bg-[var(--error-container)] p-4 text-sm font-bold text-[var(--error)]">
            {error}
          </div>
        )}

        {activeTab === 'demand' && <AdminDemand demandData={demandData} onRefresh={fetchAll} />}
        {activeTab === 'orders' && (
          <DataMaintenance
            orders={orders}
            date={maintenanceDate}
            setDate={setMaintenanceDate}
            username={maintenanceUserId}
            setUsername={setMaintenanceUserId}
            showAllDays={showAllDays}
            setShowAllDays={setShowAllDays}
            onRefresh={fetchAll}
            doAction={doAction}
          />
        )}
        {activeTab === 'users' && (
          <UserMaintenance
            userTab={userTab}
            setUserTab={setUserTab}
            pendingUsers={pendingUsers}
            users={users}
            blockedUsers={blockedUsers}
            rejectedUsers={rejectedUsers}
            doAction={doAction}
            newUsername={newUsername}
            setNewUsername={setNewUsername}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            newType={newType}
            setNewType={setNewType}
            handleAddUser={handleAddUser}

          />
        )}
        {activeTab === 'intelligence' && <MenuIntelligence />}
        {activeTab === 'settings' && <EnvironmentSettings />}
      </main>

      <nav className="bottom-nav">
        <button className={activeTab === 'demand' ? 'active' : ''} onClick={() => setActiveTab('demand')} type="button"><BarChart3 className="mx-auto mb-1" size={18} />Demand</button>
        <button className={activeTab === 'intelligence' ? 'active' : ''} onClick={() => setActiveTab('intelligence')} type="button"><BarChart3 className="mx-auto mb-1" size={18} />Intelligence</button>
        <button className={activeTab === 'orders' ? 'active' : ''} onClick={() => setActiveTab('orders')} type="button"><Database className="mx-auto mb-1" size={18} />Data</button>
        <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')} type="button"><Users className="mx-auto mb-1" size={18} />Users</button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')} type="button"><Shield className="mx-auto mb-1" size={18} />Settings</button>
      </nav>
    </div>
  );
};

const Header = ({ activeTab, setActiveTab, onLogout }) => (
  <header className="cn-topbar">
    <div className="cn-topbar-inner">
      <div className="brand-lockup">
        <div className="brand-mark"><Shield size={22} /></div>
        <div>
          <h1 className="brand-title">Admin Console</h1>
          <p className="brand-subtitle">Users, demand, and clean data</p>
        </div>
      </div>
      <div className="topbar-actions">
        {[
          ['demand', 'Demand', BarChart3],
          ['intelligence', 'Intelligence', BarChart3],
          ['orders', 'Data', Database],
          ['users', 'Users', Users],
          ['settings', 'Settings', Shield],
        ].map(([id, label, Icon]) => (
          <button key={id} className={`cn-button hide-mobile ${activeTab === id ? 'cn-button-primary' : 'cn-button-secondary'}`} onClick={() => setActiveTab(id)} type="button">
            <Icon size={16} />
            {label}
          </button>
        ))}
        <button className="cn-button cn-button-danger cn-icon-button" onClick={onLogout} type="button" aria-label="Logout">
          <LogOut size={17} />
        </button>
      </div>
    </div>
  </header>
);

const AdminDemand = ({ demandData, onRefresh }) => {
  const [demandTab, setDemandTab] = useState('normal');
  const [advancedDate, setAdvancedDate] = useState('');
  const [advancedDemand, setAdvancedDemand] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState('idle'); // 'idle' or 'training'
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStats, setModelStats] = useState(null);

  useEffect(() => {
    let intervalId;
    const checkStatus = async () => {
      try {
        const res = await getModelStatus();
        setModelStatus(res.is_training ? res.is_training : 'idle');
        setModelProgress(res.progress || 0);
        
        // Fetch stats if not training
        if (!res.is_training) {
          const statsRes = await getModelStats();
          setModelStats(statsRes);
        }
      } catch (err) {
        console.error("Failed to fetch model status", err);
      }
    };
    checkStatus();
    intervalId = setInterval(checkStatus, 5000);
    return () => clearInterval(intervalId);
  }, []);

  
  const handleOptuna = async () => {
    try {
      await triggerOptunaTuning();
      setModelStatus('optuna');
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetrain = async () => {
    try {
      await retrainModel();
      setModelStatus('model');
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdvancedDemand = async (date) => {
    if (!date) return;
    setAdvancedLoading(true);
    try {
      const data = await getDemandByDate(date);
      setAdvancedDemand(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAdvancedLoading(false);
    }
  };

  const financials = demandData?.financials || {};
  const today = demandData?.today || [];
  const chartData = buildChartData(today);
  const [selectedItems, setSelectedItems] = useState([]);
  const toggleItem = (itemName) => {
    setSelectedItems((current) => current.includes(itemName) ? current.filter((item) => item !== itemName) : [...current, itemName]);
  };
  return (
    <div className="space-y-5">
      <section className="ops-hero p-5 sm:p-7">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Admin intelligence layer</p>
            <h2 className="section-title">AI Demand Analysis</h2>
            <p className="section-copy">Forecast accuracy, tomorrow planning, and financial health in one command surface.</p>
          </div>
          <div className="flex items-center gap-3">
            {modelStatus === 'optuna' ? (
              <span className="flex items-center gap-2 text-xs font-bold text-indigo-500">
                <RefreshCw size={14} className="animate-spin" /> Running Optuna Tuning ({modelProgress}%)...
              </span>
            ) : modelStatus === 'model' || modelStatus === 'training' || modelStatus === true ? (
              <span className="flex items-center gap-2 text-xs font-bold text-blue-500">
                <RefreshCw size={14} className="animate-spin" /> Retraining model ({modelProgress}%)...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-500">
                <CheckCircle2 size={14} /> System Idle
              </span>
            )}
            <button className="cn-button cn-button-secondary" onClick={handleOptuna} disabled={modelStatus !== 'idle'} type="button">
              <Settings size={14} /> Run Optuna Tuning
            </button>
            <button className="cn-button cn-button-primary" onClick={handleRetrain} disabled={modelStatus !== 'idle'} type="button">
              <RefreshCw size={14} className={modelStatus !== 'idle' ? "animate-spin" : ""} /> Retrain Model
            </button>
            <button className="cn-button cn-button-primary" onClick={onRefresh} type="button">
              <RefreshCw size={16} />
              Refresh Data
            </button>
          </div>
        </div>
        
        {modelStats && (
          <div className="mt-4 rounded-xl bg-white/50 p-4 border border-[var(--outline-variant)] text-sm space-y-4">
            
            {modelStats.model_info && (
              <div>
                <h4 className="font-bold mb-2 flex items-center gap-2">
                  <Activity size={16} className="text-emerald-500" />
                  Model Training Status
                </h4>
                <p className="text-xs text-[var(--on-surface-variant)]">Last Retrain Finished: <span className="font-bold text-[var(--on-surface)]">{modelStats.model_info.last_trained_ist}</span></p>
              </div>
            )}

            {modelStats.optuna && (
              <div>
                <h4 className="font-bold mb-2 flex items-center gap-2 border-t border-[var(--outline-variant)] pt-4">
                  <Activity size={16} className="text-[var(--primary)]" />
                  LightGBM + Optuna Parameters
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-[var(--on-surface-variant)] uppercase tracking-wider font-bold">N-Estimators</p>
                    <p className="font-mono">{modelStats.optuna.params.n_estimators}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--on-surface-variant)] uppercase tracking-wider font-bold">Max Depth</p>
                    <p className="font-mono">{modelStats.optuna.params.max_depth}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--on-surface-variant)] uppercase tracking-wider font-bold">Learning Rate</p>
                    <p className="font-mono">{Number(modelStats.optuna.params.learning_rate).toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--on-surface-variant)] uppercase tracking-wider font-bold">Num Leaves</p>
                    <p className="font-mono">{modelStats.optuna.params.num_leaves}</p>
                  </div>
                </div>
                <p className="text-xs text-[var(--on-surface-variant)] mt-3">Last tuned: {modelStats.optuna.last_run_ist}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex border-b border-[var(--outline-variant)] overflow-x-auto no-scrollbar mb-4">
        <button
          className={`px-4 py-3 text-sm font-bold tracking-wide uppercase transition-colors whitespace-nowrap ${demandTab === 'normal' ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]'}`}
          onClick={() => setDemandTab('normal')}
        >
          Normal
        </button>
        <button
          className={`px-4 py-3 text-sm font-bold tracking-wide uppercase transition-colors whitespace-nowrap ${demandTab === 'advanced' ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]' : 'text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]'}`}
          onClick={() => setDemandTab('advanced')}
        >
          Advanced
        </button>
      </div>

      {demandTab === 'advanced' && (
        <div className="glass-card p-5 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 mb-6">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">Select Date for Advanced Prediction</label>
              <input 
                type="date" 
                className="cn-input w-full" 
                value={advancedDate}
                onChange={(e) => setAdvancedDate(e.target.value)}
              />
            </div>
            <button 
              className="cn-button cn-button-primary"
              disabled={!advancedDate || advancedLoading}
              onClick={() => fetchAdvancedDemand(advancedDate)}
            >
              {advancedLoading ? 'Predicting...' : 'Run Advanced Analysis'}
            </button>
          </div>
          
          {advancedLoading ? (
            <LoadingState label="Running advanced AI prediction models..." />
          ) : advancedDemand ? (
            advancedDemand.error ? (
              <EmptyState label={advancedDemand.error} />
            ) : (
              <DemandList title={`Advanced Forecast for ${advancedDemand.customDate}`} items={advancedDemand.demand || []} />
            )
          ) : (
            <EmptyState label="Select a date and run analysis to see advanced demand." />
          )}
        </div>
      )}

      {demandTab === 'normal' && (
        !demandData || demandData.error ? (
          <EmptyState label={demandData?.error || "Generating analysis..."} />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <Metric label="Total Revenue" value={money(financials.totalRevenue || 0)} tone="revenue" />
              <Metric label="Total Cost" value={money(financials.totalCost || 0)} tone="cost" />
              <Metric label="Net Profit" value={money(financials.netProfit || 0)} tone="profit" />
            </section>
          <section className="analytics-grid">
            <div className="analytics-card chart-panel">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="section-title text-2xl">Model Performance Curve</h2>
                  <p className="section-copy">Total predicted and actual demand by hour.</p>
                </div>
                <span className="cn-chip cn-chip-success">XGBoost</span>
              </div>
              {chartData.length === 0 ? (
                <EmptyState label="Hourly chart data is not available." />
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 18, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(134,116,97,0.18)" strokeDasharray="4 4" />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#534434' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#534434' }} />
                      <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(216,195,173,.5)' }} />
                      {selectedItems.length === 0 && <Line type="monotone" dataKey="totalPred" name="Total Predicted" stroke="#6366f1" strokeWidth={3} dot={false} />}
                      {selectedItems.length === 0 && <Line type="monotone" dataKey="totalAct" name="Total Actual" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />}
                      {selectedItems.map((itemName, index) => (
                        <React.Fragment key={itemName}>
                          <Line type="monotone" dataKey={`${itemName}_pred`} name={`${itemName} Pred`} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={3} strokeDasharray="5 5" dot={false} />
                          <Line type="monotone" dataKey={`${itemName}_act`} name={`${itemName} Act`} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={3} dot={{ r: 3 }} />
                        </React.Fragment>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button className={`category-chip ${selectedItems.length === 0 ? 'active' : ''}`} onClick={() => setSelectedItems([])} type="button">Total Demand</button>
                {today.map((item, index) => (
                  <button key={item.item} className={`category-chip ${selectedItems.includes(item.item) ? 'active' : ''}`} onClick={() => toggleItem(item.item)} type="button">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                    {item.item}
                  </button>
                ))}
              </div>
            </div>
            <DemandList title="Tomorrow's Forecast" items={demandData.tomorrow || []} />
          </section>
          <DemandList title="Today's Performance" items={demandData.today || []} today />
        </>
        )
      )}
    </div>
  );
};

const DemandList = ({ title, items, today = false }) => {
  const [expandedItem, setExpandedItem] = useState(null);

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title text-2xl">{title}</h2>
        <span className="cn-chip">{items.length} items</span>
      </div>
      {items.length === 0 ? <EmptyState label="No demand rows." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <article 
              className={`forecast-card cursor-pointer transition-all ${expandedItem === item.item ? 'ring-2 ring-[var(--primary)]' : ''}`} 
              key={`${title}-${item.item}`}
              onClick={() => setExpandedItem(expandedItem === item.item ? null : item.item)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="m-0 text-xl font-bold capitalize">{item.item}</h3>
                </div>
                <div className="flex items-center gap-6 text-right">
                  {today && (
                    <div>
                      <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">Predicted</p>
                      <p className="m-0 text-3xl font-black text-[var(--on-surface)]">{item.predicted || 0}</p>
                    </div>
                  )}
                  <div>
                    <p className="m-0 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">{today ? 'Actual' : 'Expected'}</p>
                    <p className="m-0 text-4xl font-black text-[var(--primary)]">{today ? item.actual || 0 : item.predicted || 0}</p>
                  </div>
                </div>
              </div>
              <div className="forecast-meter mt-4"><span style={{ width: `${Math.max(8, Math.round(((today ? item.actual || 0 : item.predicted || 0) / Math.max(...items.map((entry) => today ? entry.actual || 0 : entry.predicted || 0), 1)) * 100))}%` }} /></div>
              {today && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`cn-chip ${((item.actual||0) - (item.predicted||0)) > 0 ? 'cn-chip-success' : ((item.actual||0) - (item.predicted||0)) < 0 ? '!bg-red-100 !text-red-700' : 'cn-chip-primary'}`}>
                    {((item.actual||0) - (item.predicted||0)) > 0 ? `+${(item.actual||0) - (item.predicted||0)} Variance` : ((item.actual||0) - (item.predicted||0)) < 0 ? `${(item.actual||0) - (item.predicted||0)} Variance` : 'Exact Match'}
                  </span>
                  <span className="cn-chip cn-chip-warm">{money(item.profit || 0)} profit</span>
                </div>
              )}
              {expandedItem === item.item && item.hourly && item.hourly.length > 0 && (
                <div className="mt-4 border-t border-[var(--outline-variant)]/30 pt-4 animate-in slide-in-from-top-2">
                  <p className="text-sm font-bold mb-4 text-[var(--on-surface-variant)] uppercase tracking-wider">Hourly Breakdown (8:00 - 18:00)</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {item.hourly.map((h, i) => {
                      const hDiff = (h.actual || 0) - (h.predicted || 0);
                      const ratio = Math.min(1, Math.max(0, (h.predicted || 0) / 500));
                      const hue = 120 * (1 - ratio);
                      const bgColor = `hsla(${hue}, 80%, 75%, 0.25)`;
                      const borderColor = `hsla(${hue}, 80%, 70%, 0.6)`;
                      
                      return (
                        <div key={i} className="flex flex-col items-center justify-center rounded-xl py-3 px-2 shadow-sm transition-colors duration-300" style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}>
                          <span className="text-sm font-black mb-2">{h.time}:00</span>
                          <div className="flex gap-4 w-full justify-center mb-1">
                            <div className="text-center">
                              <span className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase block mb-0.5">Pred</span>
                              <span className="text-lg font-black text-[var(--on-surface)]">{h.predicted}</span>
                            </div>
                            {today && (
                              <div className="text-center">
                                <span className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase block mb-0.5">Act</span>
                                <span className="text-lg font-black text-[var(--primary)]">{h.actual || 0}</span>
                              </div>
                            )}
                          </div>
                          {today && (
                            <div className={`mt-1 text-[10px] font-black uppercase tracking-widest ${hDiff > 0 ? 'text-emerald-600' : hDiff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                              {hDiff > 0 ? `${hDiff} demand ▲` : hDiff < 0 ? `${Math.abs(hDiff)} short ▼` : 'spot on ✅'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

const DataMaintenance = ({ orders, date, setDate, username, setUsername, showAllDays, setShowAllDays, onRefresh, doAction }) => {
  const totals = useMemo(() => {
    const costMap = { dosa: 25, pizza: 70, sandwich: 20, milkshake: 40, tea: 5, samosa: 5, panipuri: 10, burger: 40, idly: 15, pulao: 50, coffee: 10, juice: 20, icecream: 25 };
    return orders.reduce((acc, order) => {
      const itemId = String(order.item || '').toLowerCase();
      const qty = Number(order.quantity || 0);
      const menuItem = MENU_ITEMS.find((item) => item.id === itemId);
      const price = menuItem ? priceValue(menuItem.price) : 0;
      const cost = costMap[itemId] || price * 0.4;
      return {
        count: acc.count + qty,
        revenue: acc.revenue + price * qty,
        cost: acc.cost + cost * qty,
      };
    }, { count: 0, revenue: 0, cost: 0 });
  }, [orders]);

  const setPresetDate = (offset) => {
    const next = new Date();
    next.setDate(next.getDate() + offset);
    setShowAllDays(false);
    setDate(toDateInput(next));
  };

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">Data Maintenance</h2>
          <p className="section-copy">Inspect and remove order rows when needed.</p>
        </div>
        <button className="cn-button cn-button-secondary" onClick={onRefresh} type="button"><RefreshCw size={16} />Refresh</button>
      </div>

      <div className="mb-5 grid gap-3 rounded-3xl border border-white/70 bg-white/52 p-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-wrap gap-2">
          <button className="cn-button cn-button-secondary" onClick={() => setPresetDate(-1)} type="button">Yesterday</button>
          <button className="cn-button cn-button-secondary" onClick={() => setPresetDate(0)} type="button">Today</button>
          <button className="cn-button cn-button-secondary" onClick={() => setPresetDate(1)} type="button">Tomorrow</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_auto]">
          <input className="form-input" type="text" placeholder="User ID" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input className="form-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={showAllDays} />
          <label className="cn-chip cursor-pointer">
            <input type="checkbox" checked={showAllDays} onChange={(event) => setShowAllDays(event.target.checked)} />
            All Days
          </label>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Metric label="Items" value={totals.count} tone="items" />
        <Metric label="Revenue" value={money(totals.revenue)} tone="revenue" />
        <Metric label="Cost" value={money(Math.round(totals.cost))} tone="cost" />
        <Metric label="Profit" value={money(Math.round(totals.revenue - totals.cost))} tone="profit" />
      </div>

      {orders.length === 0 ? <EmptyState label="No orders found for this date." /> : (
        <div className="cn-table-wrap max-h-[620px]">
          <table className="cn-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>User</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Type</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...orders].sort((a, b) => (b.effective_time || b.timestamp || 0) - (a.effective_time || a.timestamp || 0)).map((order, index) => (
                <tr key={order.id || `${order.item}-${order.timestamp}-${index}`} className={order.is_delivered ? 'opacity-55' : ''}>
                  <td>{order.dateStr || '-'}</td>
                  <td>{formatTime(order.effective_time || order.timestamp)}</td>
                  <td className="font-semibold">{order.username}</td>
                  <td className="capitalize">{order.item}{order.notes && <div className="mt-1 text-xs font-semibold text-[var(--primary)]">Note: {order.notes}</div>}</td>
                  <td><span className="cn-chip">{order.quantity}</span></td>
                  <td>{order.is_prebooking ? <span className="cn-chip cn-chip-warm">Prebook</span> : <span className="cn-chip cn-chip-success">Dine-In</span>}</td>
                  <td className="text-right">
                    <button className="cn-button cn-button-danger" onClick={() => doAction(() => adminRemoveData(order.id), 'Order removed.')} type="button">
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const UserMaintenance = ({
  userTab,
  setUserTab,
  pendingUsers,
  users,
  blockedUsers,
  rejectedUsers,
  doAction,
  newUsername,
  setNewUsername,
  newPassword,
  setNewPassword,
  newType,
  setNewType,
  handleAddUser,
}) => {
  const [changePasswordMode, setChangePasswordMode] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingPassword, setEditingPassword] = useState('');

  return (
  <div className="space-y-5">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {[
        ['pending', 'Pending'],
        ['users', 'All Users'],
        ['blocked', 'Blocked'],
      ].map(([id, label]) => (
        <button key={id} className={`cn-button whitespace-nowrap ${userTab === id ? 'cn-button-primary' : 'cn-button-secondary'}`} onClick={() => setUserTab(id)} type="button">
          {label}
        </button>
      ))}
    </div>

    {userTab === 'pending' && (
      <section className="glass-card p-5 sm:p-6">
        <h2 className="section-title mb-4">Pending Approvals</h2>
        {pendingUsers.length === 0 ? <EmptyState label="No pending users." /> : (
          <div className="grid gap-3">
            {pendingUsers.map((user) => (
              <UserRow key={user.username} title={user.username} subtitle={`Role: ${user.type}`}>
                <button className="cn-button cn-button-primary" onClick={() => doAction(() => approveUser(user.username), 'User approved.')} type="button"><Check size={15} />Approve</button>
                <button className="cn-button cn-button-secondary" onClick={() => doAction(() => rejectUser(user.username), 'User rejected.')} type="button"><X size={15} />Reject</button>
                <button className="cn-button cn-button-danger" onClick={() => doAction(() => adminBlockUser(user.username), 'User blocked.')} type="button">Block</button>
              </UserRow>
            ))}
          </div>
        )}
      </section>
    )}

    {userTab === 'users' && (
      <>
        <section className="glass-card p-5 sm:p-6">
          <h2 className="section-title mb-4">Add User</h2>
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={handleAddUser}>
            <input className="form-input" required placeholder="Username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
            <input className="form-input" required placeholder="Password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <select className="form-input" value={newType} onChange={(event) => setNewType(event.target.value)}>
              <option value="n">Normal</option>
              <option value="m">Management</option>
              <option value="a">Admin</option>
            </select>
            <button className="cn-button cn-button-primary" type="submit"><UserPlus size={16} />Add</button>
          </form>
        </section>
        <section className="glass-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">All Users</h2>
            <button
              className={`cn-button ${changePasswordMode ? 'cn-button-primary' : 'cn-button-secondary'}`}
              onClick={() => setChangePasswordMode(current => !current)}
              type="button"
            >
              <Shield size={16} />
              {changePasswordMode ? 'Done' : 'Change Password'}
            </button>
          </div>
          {changePasswordMode && (
            <p className="section-copy mb-4 font-bold text-[var(--primary)]">Click "Set Password" on any user below to assign a new password.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {users.map((user) => (
              <UserRow key={user.username} title={user.username} subtitle={`Role: ${user.type}`}>
                {changePasswordMode ? (
                  editingUser === user.username ? (
                    <div className="flex gap-2 items-center w-full sm:w-auto mt-2 sm:mt-0">
                      <input 
                        type="text" 
                        className="form-input flex-1 min-w-[120px] h-9 text-sm px-2" 
                        placeholder="New password" 
                        value={editingPassword}
                        onChange={(e) => setEditingPassword(e.target.value)}
                        autoFocus
                      />
                      <button 
                        className="cn-button cn-button-primary h-9 px-3" 
                        onClick={() => {
                          if (editingPassword.trim()) {
                            doAction(() => adminChangePassword(user.username, editingPassword.trim()), 'Password changed.')
                              .then(() => setEditingUser(null));
                          }
                        }}
                      >
                        Save
                      </button>
                      <button 
                        className="cn-button cn-button-secondary h-9 px-3"
                        onClick={() => setEditingUser(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="cn-button cn-button-primary"
                      onClick={() => {
                        setEditingUser(user.username);
                        setEditingPassword('');
                      }}
                      type="button"
                    >
                      Set Password
                    </button>
                  )
                ) : (
                  <>
                    <button className="cn-button cn-button-danger" onClick={() => doAction(() => adminRemoveUser(user.username), 'User removed.')} type="button">Remove</button>
                    <button className="cn-button cn-button-secondary" onClick={() => doAction(() => adminBlockUser(user.username), 'User blocked.')} type="button">Block</button>
                  </>
                )}
              </UserRow>
            ))}
          </div>
        </section>
      </>
    )}

    {userTab === 'blocked' && (
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass-card p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="section-title">Permanently Blocked</h2>
            <p className="section-copy">Users here cannot log in or register until unblocked.</p>
          </div>
          {blockedUsers.length === 0 ? <EmptyState label="No blocked users." /> : (
            <div className="grid gap-3">
              {blockedUsers.map((user) => (
                <UserRow key={`blocked-${user.username}`} title={user.username} subtitle="Blocked account">
                  <button className="cn-button cn-button-primary" onClick={() => doAction(() => adminUnblockUser(user.username), 'User unblocked.')} type="button">
                    Unblock
                  </button>
                </UserRow>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="section-title">Frozen / Rejected</h2>
            <p className="section-copy">Cooldown users can be unfrozen without deleting their strike count.</p>
          </div>
          {rejectedUsers.length === 0 ? <EmptyState label="No frozen users." /> : (
            <div className="grid gap-3">
              {rejectedUsers.map((user) => (
                <UserRow key={`frozen-${user.username}`} title={user.username} subtitle={`Rejected ${user.count || 1} time(s)`}>
                  <button className="cn-button cn-button-primary" onClick={() => doAction(() => adminUnfreezeUser(user.username), 'User unfrozen.')} type="button">
                    Unfreeze
                  </button>
                </UserRow>
              ))}
            </div>
          )}
        </section>
      </div>
    )}
  </div>
);
};

const UserRow = ({ title, subtitle, children }) => (
  <div className="user-control-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="m-0 text-base font-bold">{title}</p>
      <p className="m-0 mt-1 text-xs font-bold uppercase text-[var(--on-surface-variant)]">{subtitle}</p>
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const Metric = ({ label, value, tone = 'revenue' }) => (
  <article className={`metric-card ${tone}`}>
    <p className="eyebrow mb-2">{label}</p>
    <strong>{value}</strong>
  </article>
);

const LoadingState = ({ label }) => (
  <div className="glass-card flex min-h-48 flex-col items-center justify-center p-8 text-center">
    <RefreshCw className="mb-3 animate-spin text-[var(--primary)]" size={28} />
    <p className="m-0 text-sm font-bold uppercase text-[var(--on-surface-variant)]">{label}</p>
  </div>
);

const EmptyState = ({ label }) => (
  <div className="rounded-3xl border border-dashed border-[var(--outline-variant)] bg-white/45 p-8 text-center text-sm font-semibold text-[var(--on-surface-variant)]">
    {label}
  </div>
);

const priceValue = (price) => parseInt(String(price).replace(/\D/g, ''), 10) || 0;
const money = (value) => `Rs. ${value}`;
const formatTime = (timestamp) => (timestamp ? new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--');
const buildChartData = (items) => {
  const hourMap = {};
  items.forEach((item) => {
    (item.hourly || []).forEach((hour) => {
      const key = `${hour.time}:00`;
      if (!hourMap[key]) hourMap[key] = { time: key, totalPred: 0, totalAct: 0 };
      hourMap[key][`${item.item}_pred`] = Number(hour.predicted || 0);
      hourMap[key][`${item.item}_act`] = Number(hour.actual || 0);
      hourMap[key].totalPred += Number(hour.predicted || 0);
      hourMap[key].totalAct += Number(hour.actual || 0);
    });
  });
  return Object.values(hourMap).sort((a, b) => Number.parseInt(a.time, 10) - Number.parseInt(b.time, 10));
};
const toDateInput = (date) => {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().split('T')[0];
};

const MenuIntelligence = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchIntelligence = async () => {
    try {
      setLoading(true);
      const res = await getMenuIntelligence();
      setData(res);
    } catch (err) {
      setError(err.error || 'Failed to fetch menu intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntelligence();
  }, []);

  return (
    <div className="space-y-5">
      <section className="ops-hero p-5 sm:p-7">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Menu Optimization</p>
            <h2 className="section-title">Menu Popularity Intelligence</h2>
            <p className="section-copy">Identify trending, declining, and most profitable menu items based on historical data.</p>
          </div>
          <button className="cn-button cn-button-secondary" onClick={fetchIntelligence} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      {loading ? (
        <LoadingState label="Analyzing menu trends..." />
      ) : error ? (
        <EmptyState label={error} />
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-5 sm:p-6 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <BarChart3 className="text-emerald-600" size={24} />
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">Trending Items</p>
            <h3 className="text-2xl font-black text-emerald-600 capitalize">
              {data.trending?.slice(0, 3).join(', ') || 'None'}
            </h3>
          </div>

          <div className="glass-card p-5 sm:p-6 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <BarChart3 className="text-red-600 rotate-180" size={24} />
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">Declining Items</p>
            <h3 className="text-2xl font-black text-red-600 capitalize">
              {data.declining?.join(', ') || 'None'}
            </h3>
          </div>

          <div className="glass-card p-5 sm:p-6 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <Check className="text-blue-600" size={24} />
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">Fastest Growing</p>
            <h3 className="text-2xl font-black text-blue-600 capitalize">
              {data.fastestGrowing || 'None'}
            </h3>
          </div>

          <div className="glass-card p-5 sm:p-6 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Check className="text-amber-600" size={24} />
            </div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--on-surface-variant)] mb-2">Most Profitable</p>
            <h3 className="text-2xl font-black text-amber-600 capitalize">
              {data.mostProfitable || 'None'}
            </h3>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminDashboard;

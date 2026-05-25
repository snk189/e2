import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, LogOut, RefreshCw, Settings, Clock } from 'lucide-react';
import iconImg from '../../assets/icon.png';

const IconImgComponent = ({ size, className }) => <img src={iconImg} alt="" className={`object-contain ${className || ''}`} style={{ width: size, height: size }} />;
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDemand, getTodayOrders, updateOrderStatus } from '../services/api';
import EnvironmentSettings from './EnvironmentSettings';

const STATUSES = ['pending', 'preparing', 'ready', 'delivered'];
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

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('orders');
  const [demand, setDemand] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      if (activeTab === 'demand') {
        const data = await getDemand();
        if (data?.error) setError(data.error);
        else setDemand(data);
      } else if (activeTab === 'orders') {
        const orders = await getTodayOrders();
        setTodayOrders(Array.isArray(orders) ? orders : []);
      }
    } catch (err) {
      setError(err.message || err.error || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData(true);
    const interval = window.setInterval(() => fetchData(false), 5000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  const handleUpdateOrderStatus = async (id, currentStatus, direction = 1) => {
    const index = STATUSES.indexOf(currentStatus || 'pending');
    const nextStatus = STATUSES[Math.max(0, Math.min(STATUSES.length - 1, index + direction))];
    if (!id || nextStatus === currentStatus) return;
    try {
      await updateOrderStatus(id, nextStatus);
      fetchData(false);
    } catch {
      setError('Failed to update order status.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'orders') return;
    
    const handleKeyDown = (e) => {
      if (todayOrders.length === 0) return;
      
      const sortedOrders = [...todayOrders].sort(sortOrders);
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, sortedOrders.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'ArrowRight' && activeIndex >= 0 && activeIndex < sortedOrders.length) {
        e.preventDefault();
        const order = sortedOrders[activeIndex];
        const status = order.status || (order.is_delivered ? 'delivered' : 'pending');
        handleUpdateOrderStatus(order.id, status, 1);
      } else if (e.key === 'ArrowLeft' && activeIndex >= 0 && activeIndex < sortedOrders.length) {
        e.preventDefault();
        const order = sortedOrders[activeIndex];
        const status = order.status || (order.is_delivered ? 'delivered' : 'pending');
        handleUpdateOrderStatus(order.id, status, -1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, todayOrders, activeIndex, handleUpdateOrderStatus]);

  return (
    <div className="app-bg management-theme min-h-dvh">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} onLogout={onLogout} />
      <main className="app-shell-narrow">
        {error && (
          <div className="mb-5 rounded-3xl bg-[var(--error-container)] p-4 text-sm font-bold text-[var(--error)]">
            {error}
          </div>
        )}

        {activeTab === 'settings' && <EnvironmentSettings />}

        {activeTab === 'orders' && (
          <section className="glass-card p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="section-title">Today&apos;s Orders</h2>
                <p className="section-copy">Update status as each kitchen ticket moves.</p>
              </div>
              <button className="cn-button cn-button-secondary" onClick={fetchData} type="button">
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
            {loading ? (
              <LoadingState label="Loading orders..." />
            ) : todayOrders.length === 0 ? (
              <EmptyState label="No orders today." />
            ) : (
              <div className="cn-table-wrap max-h-[640px]">
                <table className="cn-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Type</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...todayOrders].sort(sortOrders).map((order, index) => {
                      const status = order.status || (order.is_delivered ? 'delivered' : 'pending');
                      const isSelected = index === activeIndex;
                      return (
                        <tr 
                          key={order.id || `${order.item}-${order.timestamp}-${index}`} 
                          className={`${status === 'delivered' ? 'opacity-55' : ''} ${isSelected ? 'ring-2 ring-[var(--primary)] ring-inset bg-white/40' : ''}`}
                        >
                          <td>{formatTime(order.effective_time || order.timestamp)}</td>
                          <td className="font-semibold">{order.username}</td>
                          <td className="capitalize">
                            {order.item}
                            {order.notes && <div className="mt-1 text-xs font-semibold text-[var(--primary)]">Note: {order.notes}</div>}
                          </td>
                          <td><span className="cn-chip">{order.quantity}</span></td>
                          <td>{order.is_prebooking ? <span className="cn-chip cn-chip-warm">Prebook</span> : <span className="cn-chip cn-chip-success">Dine-In</span>}</td>
                          <td>
                            <div className="flex items-center justify-end gap-2">
                              <span className="cn-chip capitalize">{status.replace(/_/g, ' ')}</span>
                              {status !== 'pending' && (
                                <button className="cn-button cn-button-secondary cn-icon-button" onClick={() => handleUpdateOrderStatus(order.id, status, -1)} type="button" aria-label="Previous status">
                                  <ChevronLeft size={16} />
                                </button>
                              )}
                              {status !== 'delivered' && (
                                <button className="cn-button cn-button-primary cn-icon-button" onClick={() => handleUpdateOrderStatus(order.id, status, 1)} type="button" aria-label="Next status">
                                  <ChevronRight size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'demand' && (
          <DemandView demand={demand} loading={loading} onRefresh={fetchData} todayOrders={todayOrders} />
        )}
      </main>

      <nav className="bottom-nav">
        <button className={activeTab === 'orders' ? 'active' : ''} onClick={() => setActiveTab('orders')} type="button">
          <IconImgComponent size={18} className="mx-auto mb-1" />
          Orders
        </button>
        <button className={activeTab === 'demand' ? 'active' : ''} onClick={() => setActiveTab('demand')} type="button">
          <BarChart3 className="mx-auto mb-1" size={18} />
          Demand
        </button>
        <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')} type="button">
          <Settings className="mx-auto mb-1" size={18} />
          Settings
        </button>
      </nav>
    </div>
  );
};

const Header = ({ activeTab, setActiveTab, onLogout }) => (
  <header className="cn-topbar">
    <div className="cn-topbar-inner">
      <div className="brand-lockup">
        <div className="flex items-center justify-center bg-white rounded-full p-1.5 shadow-sm w-12 h-12"><img src={iconImg} alt="Logo" className="w-full h-full object-contain" /></div>
        <div>
          <h1 className="brand-title">Management</h1>
          <p className="brand-subtitle">Culinary control center</p>
        </div>
      </div>
      <div className="topbar-actions">
        {[
          ['orders', 'Orders', IconImgComponent],
          ['demand', 'Demand', BarChart3],
          ['settings', 'Settings', Settings],
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

const PRICES = {
  dosa: 60, idly: 40, pulao: 100, pizza: 150, sandwich: 50, burger: 80,
  tea: 20, coffee: 25, juice: 45, 'ice cream': 50, samosa: 15, 'pani puri': 30
};
const COSTS = {
  dosa: 30, idly: 15, pulao: 50, pizza: 70, sandwich: 20, burger: 35,
  tea: 5, coffee: 10, juice: 20, 'ice cream': 25, samosa: 5, 'pani puri': 10
};

const DemandView = ({ demand, loading, onRefresh, todayOrders }) => {
  const isClosed = demand ? (demand.currentHour < 8 || demand.currentHour >= 18) : true;
  const tomorrow = useMemo(() => {
    const rawTomorrow = demand?.tomorrow || [];
    return rawTomorrow.map(item => {
       const newHourly = [];
       for (let h = 8; h <= 18; h++) {
           const existingHour = (item.hourly || []).find(x => x.time === h);
           const predQty = existingHour ? existingHour.predicted : 0;
           newHourly.push({
               time: h,
               predicted: predQty
           });
       }
       return { ...item, hourly: newHourly };
    });
  }, [demand]);
  
  const financials = useMemo(() => {
    let rev = 0;
    let cost = 0;
    (todayOrders || []).forEach(order => {
        const itemLower = order.item.toLowerCase();
        const price = PRICES[itemLower] || 0;
        const itemCost = COSTS[itemLower] || 0;
        rev += price * order.quantity;
        cost += itemCost * order.quantity;
    });
    return {
      totalRevenue: rev,
      totalCost: cost,
      netProfit: rev - cost
    };
  }, [todayOrders]);

  const today = useMemo(() => {
    const rawToday = demand?.today || [];
    const actuals = {};
    const actualsHourly = {};
    (todayOrders || []).forEach(o => {
        const key = o.item.toLowerCase();
        
        const effectiveTime = o.effective_time || o.order_timestamp || Math.floor(Date.now() / 1000);
        let hour = new Date(effectiveTime * 1000).getHours();
        if (hour < 8) hour = 8;
        if (hour > 18) hour = 18;
        
        actuals[key] = (actuals[key] || 0) + o.quantity;
        if (!actualsHourly[key]) actualsHourly[key] = {};
        actualsHourly[key][hour] = (actualsHourly[key][hour] || 0) + o.quantity;
    });
    return rawToday.map(item => {
       const key = item.item.toLowerCase();
       const actual = actuals[key] || 0;
       const rev = actual * (PRICES[key] || 0);
       const cost = actual * (COSTS[key] || 0);
       
       const newHourly = [];
       for (let h = 8; h <= 18; h++) {
           const existingHour = (item.hourly || []).find(x => x.time === h);
           const predQty = existingHour ? existingHour.predicted : 0;
           const actQty = actualsHourly[key] ? (actualsHourly[key][h] || 0) : 0;
           newHourly.push({
               time: h,
               predicted: predQty,
               actual: actQty
           });
       }
       
       return {
          ...item,
          actual: actual,
          profit: rev - cost,
          hourly: newHourly
       };
    });
  }, [demand, todayOrders]);


  return (
    <div className="space-y-5">
      <section className="ops-hero p-5 sm:p-7">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Management cockpit</p>
            <h2 className="section-title">Demand Analytics</h2>
            <p className="section-copy">Live forecast, actuals, variance, and profit signals for kitchen planning.</p>
          </div>
          <button className="cn-button cn-button-secondary" onClick={onRefresh} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap gap-3">
          <span className={`cn-chip ${isClosed ? '!bg-red-100 !text-red-700 !border-red-200' : 'cn-chip-success'}`}>
            <span className="pulse-dot" style={{ backgroundColor: isClosed ? '#dc2626' : undefined }} />
            {isClosed ? 'Canteen closed' : 'Canteen open'}
          </span>
          <span className="cn-chip"><Clock size={14} /> Hour {demand?.currentHour ?? '--'}:00</span>
        </div>
      </section>

      {loading ? (
        <LoadingState label="Analyzing demand..." />
      ) : !demand ? (
        <EmptyState label="Demand data is not available yet." />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Metric label="Revenue" value={money(financials.totalRevenue || 0)} tone="revenue" />
            <Metric label="Cost" value={money(financials.totalCost || 0)} tone="cost" />
            <Metric label="Net Profit" value={money(financials.netProfit || 0)} tone="profit" />
          </section>

          <div className="grid gap-4">
            <ForecastSection title="Today's Performance" items={today} mode="today" />
            <TomorrowForecastSection items={tomorrow} />
          </div>
        </>
      )}
    </div>
  );
};

const ForecastSection = ({ title, items, mode }) => {
  const [expandedItem, setExpandedItem] = useState(null);

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title text-2xl">{title}</h2>
        <span className="cn-chip">{items.length} items</span>
      </div>
      {items.length === 0 ? (
        <EmptyState label="No forecast rows." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const diff = (item.actual || 0) - (item.predicted || 0);
            const value = mode === 'today' ? item.actual ?? 0 : item.predicted ?? 0;
            const max = Math.max(...items.map((entry) => mode === 'today' ? entry.actual || 0 : entry.predicted || 0), 1);
            return (
              <article 
                key={`${mode}-${item.item}`} 
                className={`forecast-card cursor-pointer transition-all ${expandedItem === item.item ? 'ring-2 ring-[var(--primary)]' : ''}`}
                onClick={() => setExpandedItem(expandedItem === item.item ? null : item.item)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-xl font-bold capitalize">{item.item}</h3>
                    {mode !== 'today' && (
                      <p className="m-0 mt-1 text-xs font-bold uppercase text-[var(--on-surface-variant)]">
                        Predicted {item.predicted ?? 0}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex items-center h-full">
                    {mode === 'today' ? (
                      <p className="m-0 text-sm font-bold text-[var(--on-surface)] tracking-wide">
                        Predicted <span className="text-[var(--on-surface-variant)]">{item.predicted ?? 0}</span><span className="mx-1 text-[var(--outline-variant)] font-normal">|</span>Actual <span className="text-[var(--primary)] text-base">{item.actual ?? 0}</span>
                      </p>
                    ) : (
                      <div className="flex flex-col items-end">
                        <p className="m-0 text-3xl font-bold text-[var(--primary)]">{value}</p>
                        <p className="m-0 text-xs font-bold uppercase text-[var(--on-surface-variant)]">Qty</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="forecast-meter mt-4"><span style={{ width: `${Math.max(8, Math.round((value / max) * 100))}%` }} /></div>
                {mode === 'today' && (
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <span className={`text-xs font-black uppercase tracking-wider ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {diff > 0 ? `${diff} demand ▲` : diff < 0 ? `${Math.abs(diff)} short ▼` : 'spot on ✅'}
                    </span>
                    <span className="cn-chip cn-chip-warm ml-2">{money(item.profit || 0)} profit</span>
                  </div>
                )}
                {expandedItem === item.item && item.hourly && item.hourly.length > 0 && (
                  <div className="mt-4 border-t border-[var(--outline-variant)]/30 pt-4 animate-in slide-in-from-top-2">
                    <p className="text-sm font-bold mb-4 text-[var(--on-surface-variant)] uppercase tracking-wider">Hourly Breakdown (8:00 - 18:00)</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {item.hourly.map((h, i) => {
                        const hDiff = (h.actual || 0) - (h.predicted || 0);
                        return (
                          <div key={i} className="flex flex-col items-center justify-center bg-white/30 border border-white/60 rounded-xl py-3 px-2 shadow-sm">
                            <span className="text-sm font-black mb-2">{h.time}:00</span>
                            <div className="flex gap-4 w-full justify-center mb-1">
                              <div className="text-center">
                                <span className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase block mb-0.5">Pred</span>
                                <span className="text-lg font-black text-[var(--on-surface)]">{h.predicted}</span>
                              </div>
                              {mode === 'today' && (
                                <div className="text-center">
                                  <span className="text-[10px] font-bold text-[var(--on-surface-variant)] uppercase block mb-0.5">Act</span>
                                  <span className="text-lg font-black text-[var(--primary)]">{h.actual || 0}</span>
                                </div>
                              )}
                            </div>
                            {mode === 'today' && (
                              <div className={`mt-1 text-[10px] font-black uppercase tracking-widest ${hDiff > 0 ? 'text-emerald-500' : hDiff < 0 ? 'text-red-500' : 'text-blue-500'}`}>
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
            );
          })}
        </div>
      )}
    </section>
  );
};

const TomorrowForecastSection = ({ items }) => {
  const [expandedItem, setExpandedItem] = useState(null);

  return (
    <section className="mt-6 mb-4">
      <div className="mb-6 flex items-center justify-between gap-3 px-2 sm:px-0">
        <h2 className="section-title text-2xl">Tomorrow's Forecast</h2>
        <span className="cn-chip">{items.length} items</span>
      </div>
      {items.length === 0 ? (
        <EmptyState label="No forecast rows." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {items.map((item) => {
            const isExpanded = expandedItem === item.item;
            return (
              <div key={item.item} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden relative group transition-all">
                <div 
                  className="p-6 relative z-10 cursor-pointer"
                  onClick={() => setExpandedItem(isExpanded ? null : item.item)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-black text-2xl text-white drop-shadow-md mb-1 capitalize">{item.item}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI Projected</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 block pb-1 border-b border-white/10 mb-1">{item.predicted ?? 0}</span>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Qty</span>
                    </div>
                  </div>
                </div>
                
                {isExpanded && item.hourly && item.hourly.length > 0 && (
                  <div className="relative z-10 bg-black/40 backdrop-blur-md border-t border-white/10 p-6 animate-in slide-in-from-top-2">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">AI Timeline Prediction</h4>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {item.hourly.map((h, i) => (
                        <div key={i} className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl py-4 px-2 hover:bg-white/10 transition-colors">
                          <span className="text-sm font-bold text-slate-400 mb-2">{h.time}:00</span>
                          <span className="text-lg font-black text-white">{h.predicted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

const Metric = ({ label, value, tone }) => {
  return (
    <article className={`metric-card ${tone}`}>
      <p className="eyebrow mb-2">{label}</p>
      <strong>{value}</strong>
    </article>
  );
};

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

const sortOrders = (a, b) => {
  const aDone = a.is_delivered || a.status === 'delivered';
  const bDone = b.is_delivered || b.status === 'delivered';
  if (aDone !== bDone) return aDone ? 1 : -1;
  return (a.effective_time || a.timestamp || 0) - (b.effective_time || b.timestamp || 0);
};

const formatTime = (timestamp) => {
  if (!timestamp) return '--:--';
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const money = (value) => `Rs. ${value}`;

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

export default Dashboard;

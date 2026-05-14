import React, { useState, useEffect } from 'react';
import { getDemand, getTodayOrders, updateOrderStatus, adminRemoveData } from '../services/api';
import EnvironmentSettings from './EnvironmentSettings';

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'demand', 'settings'
  const [demand, setDemand] = useState(null);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedToday, setExpandedToday] = useState(null);
  const [expandedTomorrow, setExpandedTomorrow] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const rowRefs = React.useRef([]);

  const fetchData = async () => {
    try {
      if (activeTab === 'demand') {
        const data = await getDemand();
        if (data && data.error) setError(data.error);
        else setDemand(data);
      } else if (activeTab === 'orders') {
        const orders = await getTodayOrders();
        // Sorting logic: Prebooking -> prebooking_datetime, Dine-in -> order_timestamp (FIFO)
        // the backend already sorts by effective_time, but we can enforce it here if needed
        setTodayOrders(orders);
      }
      setError('');
    } catch (err) {
      setError(err.message || err.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 5000); // auto-refresh for new orders/demand
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleUpdateOrderStatus = async (id, currentStatus, direction = 1) => {
    const STATUSES = ['pending', 'preparing', 'ready', 'delivered'];
    const idx = STATUSES.indexOf(currentStatus || 'pending');
    let nextIdx = idx + direction;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= STATUSES.length) nextIdx = STATUSES.length - 1;
    const nextStatus = STATUSES[nextIdx];
    
    if (nextStatus === currentStatus) return;

    try {
      await updateOrderStatus(id, nextStatus);
      fetchData();
    } catch (err) {
      setError('Failed to update status');
    }
  };

  useEffect(() => {
    if (activeTab !== 'orders' || todayOrders.length === 0) return;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input (though there are none in this view)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev < todayOrders.length - 1 ? prev + 1 : prev;
          if (rowRefs.current[next]) rowRefs.current[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = prev > 0 ? prev - 1 : prev;
          if (rowRefs.current[next]) rowRefs.current[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const order = todayOrders[selectedIndex];
        if (order) {
          handleUpdateOrderStatus(order.id, order.status || (order.is_delivered ? 'delivered' : 'pending'), 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        const order = todayOrders[selectedIndex];
        if (order) {
          handleUpdateOrderStatus(order.id, order.status || (order.is_delivered ? 'delivered' : 'pending'), -1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, todayOrders, selectedIndex]);

  const showTomorrowOnly = demand && demand.currentHour > 18;

  const ITEM_ORDER = ['dosa', 'pizza', 'sandwich', 'milkshake', 'tea'];
  const sortItems = (a, b) => {
      const idxA = ITEM_ORDER.indexOf(a.item.toLowerCase());
      const idxB = ITEM_ORDER.indexOf(b.item.toLowerCase());
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  };

  const renderSkeletonSection = (title) => (
    <section>
      <div className="flex items-center gap-3 mb-6 px-2 mt-4">
        <h3 className="text-2xl font-black text-slate-800">{title}</h3>
      </div>
      <div className="bg-white/40 backdrop-blur-sm rounded-3xl border border-gray-100 p-12 flex flex-col justify-center items-center h-48 shadow-inner">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-400 rounded-full blur animate-ping opacity-30"></div>
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin relative z-10"></div>
        </div>
        <p className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Analyzing AI Data...</p>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200 pb-12 font-sans relative selection:bg-indigo-200">
      
      {/* Premium Header */}
      <header className="bg-white/70 backdrop-blur-2xl border-b border-white/50 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-lg shadow-indigo-200 flex items-center justify-center text-white font-black text-xl">
                M
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Management</h1>
                <p className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-500 mt-0.5">Control Center</p>
              </div>
            </div>
            <button onClick={onLogout} className="sm:hidden px-4 py-2 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl font-bold text-sm transition-all">Logout</button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 w-full sm:w-auto flex-1 sm:flex-none">
             <button onClick={() => setActiveTab('orders')} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'orders' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>Order Management</button>
             <button onClick={() => setActiveTab('demand')} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'demand' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>Demand Analysis</button>
             <button onClick={() => setActiveTab('settings')} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}>Environment Variables</button>
          </div>
          <button onClick={onLogout} className="hidden sm:block px-4 py-2 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl font-bold text-sm transition-all ml-auto">Logout</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {error && (
           <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-red-100 flex items-center gap-4 animate-in slide-in-from-top-2">
             <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-2xl font-bold">!</div>
             <p className="text-red-600 font-extrabold text-lg">{error}</p>
           </div>
        )}

        {activeTab === 'settings' && <EnvironmentSettings />}

        {activeTab === 'orders' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-300">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                  <h2 className="text-xl font-bold">Today's Orders</h2>
                  <button onClick={fetchData} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">Refresh</button>
              </div>
              {todayOrders.length === 0 ? <div className="text-gray-500 text-sm font-bold opacity-50 text-center py-10">No orders today.</div> : (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto rounded-xl border border-gray-100 shadow-inner">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead className="bg-gray-50 text-gray-500 sticky top-0 backdrop-blur-md z-10">
                              <tr>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs">Time</th>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs">User</th>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs">Item</th>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs">Qty</th>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs">Type</th>
                                  <th className="p-3 font-bold uppercase tracking-wider text-xs text-right">Status</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {todayOrders.map((d, i) => {
                                  const timeStr = new Date(d.effective_time * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                  const isSelected = selectedIndex === i;
                                  return (
                                  <tr 
                                      key={i} 
                                      ref={el => rowRefs.current[i] = el}
                                      onClick={() => setSelectedIndex(i)}
                                      className={`transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500 shadow-sm' : 'hover:bg-gray-50'} ${d.is_delivered || d.status === 'delivered' ? 'opacity-50' : ''}`}
                                  >
                                      <td className="p-3 font-medium text-gray-800">{timeStr}</td>
                                      <td className="p-3 font-medium text-gray-800">{d.username}</td>
                                      <td className="p-3 text-gray-600 capitalize">
                                        {d.item}
                                        {d.notes && <div className="text-xs text-amber-600 font-medium mt-1">Note: {d.notes}</div>}
                                      </td>
                                      <td className="p-3"><span className="bg-gray-200 text-gray-800 px-2 py-0.5 rounded font-bold text-xs">{d.quantity}</span></td>
                                      <td className="p-3">
                                          {d.is_prebooking ? <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold text-xs">Prebook</span> : <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-xs">Dine-In</span>}
                                      </td>
                                      <td className="p-3 text-right">
                                            <div className="flex justify-end gap-2 items-center">
                                              <span className="text-xs font-bold text-gray-500 uppercase mr-2">
                                                {(d.status || (d.is_delivered ? 'delivered' : 'pending')).replace(/_/g, ' ')}
                                              </span>
                                              {(d.status || (d.is_delivered ? 'delivered' : 'pending')) !== 'pending' && (
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(d.id, d.status || (d.is_delivered ? 'delivered' : 'pending'), -1); }} 
                                                  className="px-2 py-1 rounded-lg text-xs font-bold transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                >
                                                    ⬅ Prev
                                                </button>
                                              )}
                                              {(d.status || (d.is_delivered ? 'delivered' : 'pending')) !== 'delivered' && (
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(d.id, d.status || (d.is_delivered ? 'delivered' : 'pending'), 1); }} 
                                                  className="px-2 py-1 rounded-lg text-xs font-bold transition-colors bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                                >
                                                    Next ➔
                                                </button>
                                              )}
                                            </div>
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
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Status Hero Card */}
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-8 border border-white shadow-xl shadow-indigo-100/50 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-indigo-300 to-purple-300 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
              
              <div className="relative z-10 w-full sm:w-auto text-center sm:text-left">
                <h2 className="text-3xl font-black text-slate-900 mb-2">
                  Demand Analytics
                </h2>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-sm border border-gray-100 backdrop-blur-sm">
                  {loading || !demand ? (
                    <span className="font-bold text-sm text-indigo-500 tracking-wide uppercase animate-pulse">Syncing AI Brain...</span>
                  ) : (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${showTomorrowOnly ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${showTomorrowOnly ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                      </span>
                      <span className="font-bold text-sm text-slate-700 tracking-wide uppercase">
                        {showTomorrowOnly ? "Canteen Closed" : "Canteen Open"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="text-center sm:text-right relative z-10">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Current Hour</p>
                <p className="text-4xl font-black font-mono text-slate-800">
                  {demand ? `${demand.currentHour}:00` : '--:--'}
                </p>
              </div>
            </div>

            {/* Financial Overview */}
            {!loading && demand && demand.financials && (
              <section className="animate-in slide-in-from-bottom-4 duration-500 mb-8">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Financial Performance</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Revenue</p>
                      <p className="text-2xl font-black text-slate-800">₹{demand.financials.totalRevenue}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">₹</div>
                  </div>
                  
                  <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Manufacturing Cost</p>
                      <p className="text-2xl font-black text-rose-600">₹{demand.financials.totalCost}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center font-bold text-xl">-</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-6 rounded-3xl border border-indigo-400 shadow-lg shadow-indigo-200 flex items-center justify-between text-white relative overflow-hidden transition-transform hover:-translate-y-1">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
                    <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-purple-500 opacity-20 rounded-full blur-3xl"></div>
                    <div className="relative z-10">
                      <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mb-1">Net Profit</p>
                      <p className="text-3xl font-black">₹{demand.financials.netProfit}</p>
                    </div>
                    <div className="relative z-10 w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-2xl">+</div>
                  </div>
                </div>
              </section>
            )}

            {/* Data Sections */}
            {loading || !demand ? (
              <>
                {renderSkeletonSection("Today's Performance")}
                {renderSkeletonSection("Tomorrow's Forecast")}
              </>
            ) : (
              <>
                {/* Today's Data vs Current Status */}
                <section className="mb-10">
                  <div className="flex items-center gap-3 mb-6 px-2">
                    <h3 className="text-2xl font-black text-slate-800">Today's Performance</h3>
                    <span className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold uppercase rounded-full tracking-wider">Metrics</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {demand.today && [...demand.today].sort(sortItems).map((item, idx) => {
                      const diff = item.actual - item.predicted;
                      const isExpanded = expandedToday === item.item;
                      return (
                        <div key={idx} className={`bg-white rounded-3xl border transition-all duration-300 shadow-sm hover:shadow-xl ${isExpanded ? 'border-indigo-300 shadow-indigo-100' : 'border-gray-100 hover:border-gray-300'} overflow-hidden`}>
                          <div 
                            className="p-6 cursor-pointer relative group"
                            onClick={() => setExpandedToday(isExpanded ? null : item.item)}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            <div className="relative z-10 flex justify-between items-start">
                              <div className="flex flex-col">
                                <span className="font-black text-2xl text-slate-900 drop-shadow-sm mb-1">{item.item}</span>
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Pred: {item.predicted}</p>
                                </div>
                              </div>
                              
                              <div className="text-right flex flex-col items-end">
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Actual</p>
                                <div className="flex items-center gap-2 mb-2">
                                  <p className="text-3xl font-black text-slate-800 leading-none">{item.actual}</p>
                                  {item.yesterday !== undefined && (
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest shadow-sm ${item.actual > item.yesterday ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : item.actual < item.yesterday ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                        {item.actual > item.yesterday ? '▲' : item.actual < item.yesterday ? '▼' : '–'} {Math.abs(item.actual - item.yesterday)}
                                      </span>
                                  )}
                                </div>
                                
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {diff > 0 && <span className="inline-block px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md border border-emerald-200 shadow-sm">▲ {Math.abs(diff)} Demand</span>}
                                  {diff < 0 && <span className="inline-block px-2 py-1 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-md border border-rose-200 shadow-sm">▼ {Math.abs(diff)} Short</span>}
                                  {diff === 0 && <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md border border-slate-200 shadow-sm">✓ Spot On</span>}
                                  
                                  <span className="inline-block px-2 py-1 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 text-[10px] font-black rounded-md border border-indigo-100 shadow-sm tracking-wide">
                                    ₹{item.profit} PROFIT
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {isExpanded && item.hourly && (
                            <div className="bg-slate-50 border-t border-slate-100 p-6 animate-in slide-in-from-top-2 duration-200">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Detailed Hourly Timeline</h4>
                              <div className="grid grid-cols-2 gap-3">
                                {item.hourly.map((h, i) => (
                                  <div key={i} className="flex justify-between items-center bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                                    <span className="font-black text-slate-400 text-sm">{h.time}:00</span>
                                    <div className="text-right text-xs space-y-1">
                                      <p className="text-slate-500 font-bold">P: <span className="text-indigo-600">{h.predicted}</span></p>
                                      <p className="text-slate-500 font-bold">A: <span className="text-slate-900">{h.actual}</span></p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Tomorrow's Forecast */}
                <section>
                  <div className="flex items-center gap-3 mb-6 px-2 mt-4">
                    <h3 className="text-2xl font-black text-slate-800">Tomorrow's Forecast</h3>
                    {showTomorrowOnly && <span className="px-3 py-1 bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold uppercase rounded-full tracking-wider animate-pulse">Primary Focus</span>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {demand.tomorrow && [...demand.tomorrow].sort(sortItems).map((item, idx) => {
                      const isExpanded = expandedTomorrow === item.item;
                      return (
                        <div key={idx} className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden relative group">
                          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                          
                          <div 
                            className="p-6 relative z-10 cursor-pointer"
                            onClick={() => setExpandedTomorrow(isExpanded ? null : item.item)}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="font-black text-2xl text-white drop-shadow-md mb-1">{item.item}</span>
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">AI Projected</span>
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 block pb-1 border-b border-white/10 mb-1">{item.predicted}</span>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Qty</span>
                              </div>
                            </div>
                          </div>
                          
                          {isExpanded && item.hourly && (
                            <div className="relative z-10 bg-black/40 backdrop-blur-md border-t border-white/10 p-6">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">AI Timeline Prediction</h4>
                              <div className="grid grid-cols-3 gap-2">
                                {item.hourly.map((h, i) => (
                                  <div key={i} className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl py-3 hover:bg-white/10 transition-colors">
                                    <span className="text-xs font-bold text-slate-500 mb-1">{h.time}:00</span>
                                    <span className="font-black text-white text-xl">{h.predicted}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;

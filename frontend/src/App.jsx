import React, { useCallback, useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Calendar,
  Check,
  Clock,
  History,
  LogOut,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  X,
} from 'lucide-react';
import iconImg from '../assets/icon.png';
import { MENU_ITEMS } from './data/items';
import { submitOrder, setApiUser, getHistory, logoutUser } from './services/api';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';

const priceValue = (price) => parseInt(String(price).replace(/\D/g, ''), 10) || 0;
const money = (value) => `Rs. ${value}`;
const categories = [...new Set(MENU_ITEMS.map((item) => item.category || 'Other'))];
const categoryStyles = {
  'Main Course': { id: 'main-course', tone: 'main', color: '#dc2626' },
  'Fast Food': { id: 'fast-food', tone: 'fast', color: '#ea580c' },
  Beverages: { id: 'beverages', tone: 'bev', color: '#059669' },
  Dessert: { id: 'dessert', tone: 'dessert', color: '#db2777' },
  Snacks: { id: 'snacks', tone: 'snacks', color: '#4f46e5' },
};

const App = () => {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);

  useEffect(() => {
    if (user) setApiUser(user);
  }, [user]);

  const handleLogin = (username, type) => {
    setUser(username);
    setUserType(type);
    setApiUser(username);
  };

  const handleLogout = async () => {
    if (user) await logoutUser();
    localStorage.removeItem('bitespeed_user');
    localStorage.removeItem('bitespeed_type');
    setUser(null);
    setUserType(null);
    setApiUser('Unknown_User');
  };

  if (!user) return <Auth onLogin={handleLogin} />;
  if (userType === 'a') return <AdminDashboard onLogout={handleLogout} />;
  if (userType === 'm') return <Dashboard onLogout={handleLogout} />;
  return <BookingInterface onLogout={handleLogout} username={user} />;
};

const AppHeader = ({ title = 'BiteSpeed', subtitle, actions }) => (
  <header className="cn-topbar">
    <div className="cn-topbar-inner">
      <div className="brand-lockup">
        <div className="flex items-center justify-center bg-white rounded-full p-1.5 shadow-sm w-12 h-12">
          <img src={iconImg} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="brand-title truncate">{title}</h1>
          {subtitle && <p className="brand-subtitle truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="topbar-actions">{actions}</div>
    </div>
  </header>
);

const Toast = ({ toast }) => (
  <div className={`cn-toast ${toast.show ? 'show' : ''}`}>{toast.message}</div>
);

const BookingInterface = ({ onLogout, username }) => {
  const [quantities, setQuantities] = useState({});
  const [orderType, setOrderType] = useState('dine-in');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [instructions, setInstructions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeMobileView, setActiveMobileView] = useState('menu');
  const [refreshing, setRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startX, setStartX] = useState(0);
  const [offerApplied, setOfferApplied] = useState(false);
  const [showTrayPopup, setShowTrayPopup] = useState(false);

  const hourOfDay = new Date().getHours();
  const isLive = hourOfDay >= 8 && hourOfDay < 18;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return next.toISOString().split('T')[0];
  }, []);

  const selectedItems = useMemo(
    () => Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ item: MENU_ITEMS.find((entry) => entry.id === id), qty }))
      .filter(({ item }) => Boolean(item)),
    [quantities],
  );

  const totalItems = selectedItems.reduce((sum, { qty }) => sum + qty, 0);
  const subtotal = selectedItems.reduce((sum, { item, qty }) => sum + priceValue(item.price) * qty, 0);
  const discount = orderType === 'prebook' ? Math.round(subtotal * 0.05) : 0;
  const finalTotal = subtotal - discount;
  const groupedMenu = categories.map((category) => ({
    category,
    items: MENU_ITEMS.filter((item) => item.category === category),
  }));

  const showToast = (message) => {
    setToast({ show: true, message });
    window.setTimeout(() => setToast({ show: false, message: '' }), 2600);
  };

  const fetchHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingHistory(true);
      const data = await getHistory(username);
      setHistoryData(Array.isArray(data) ? data : []);
      if (!silent) setShowHistory(true);
    } catch {
      if (!silent) showToast('Could not load order history.');
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }, [username]);

  useEffect(() => {
    if (!showHistory) return undefined;
    const interval = window.setInterval(() => fetchHistory(true), 5000);
    return () => window.clearInterval(interval);
  }, [fetchHistory, showHistory]);

  useEffect(() => {
    if (orderType !== 'prebook' || totalItems === 0 || offerApplied) return;
    setOfferApplied(true);
    confetti({
      particleCount: 90,
      spread: 70,
      origin: { y: 0.64 },
      colors: ['#006c49', '#4edea3', '#f59e0b', '#855300'],
      zIndex: 9999,
    });
  }, [offerApplied, orderType, totalItems]);

  useEffect(() => {
    if (orderType !== 'prebook' || totalItems === 0) setOfferApplied(false);
  }, [orderType, totalItems]);

  const handleQuantity = (id, delta) => {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(10, (prev[id] || 0) + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleSetQuantity = (id, value) => {
    if (value === '') {
      setQuantities((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, Math.min(10, parsed)) }));
  };

  const jumpToCategory = (category) => {
    setActiveCategory(category);
    const target = category === 'All'
      ? document.getElementById('booking-menu')
      : document.getElementById(`cat-${categoryStyles[category]?.id || category.toLowerCase().replace(/\s+/g, '-')}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTouchStart = (event) => {
    if (window.scrollY === 0) setStartY(event.touches[0].clientY);
    setStartX(event.touches[0].clientX);
  };

  const handleTouchMove = (event) => {
    if (window.scrollY !== 0 || startY <= 0 || refreshing) return;
    if (event.touches[0].clientY - startY > 86) {
      setRefreshing(true);
      setQuantities({});
      setInstructions([]);
      window.setTimeout(() => setRefreshing(false), 900);
      setStartY(0);
    }
  };

  const handleTouchEnd = (event) => {
    if (startX > 0) {
      const endX = event.changedTouches[0].clientX;
      const diffX = startX - endX;
      if (diffX > 50) {
        setOrderType('prebook');
        if (!date) setDate(todayStr);
        if (!time) setTime('13:00');
      } else if (diffX < -50) {
        setOrderType('dine-in');
      }
    }
    setStartY(0);
    setStartX(0);
  };

  const addInstruction = () => {
    if (instructions.length >= 5) return;
    setInstructions((prev) => [...prev, { text: '', items: [] }]);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (totalItems === 0) {
      showToast('Add at least one item to continue.');
      return;
    }

    const now = new Date();
    if (orderType === 'prebook') {
      if (!date || !time) {
        showToast('Choose a date and time for prebooking.');
        return;
      }
      const selectedDateTime = new Date(`${date}T${time}`);
      if (selectedDateTime <= now) {
        showToast('Prebook time must be in the future.');
        return;
      }
      const hour = selectedDateTime.getHours();
      if (hour < 8 || hour >= 18) {
        showToast('Canteen operates between 8 AM and 6 PM.');
        return;
      }
    }

    setLoading(true);
    const timestamp = Math.floor(now.getTime() / 1000);
    const prebookDate = orderType === 'prebook' ? new Date(date) : null;
    const ordersArray = selectedItems.map(({ item, qty }) => {
      const itemInstructions = instructions
        .filter((inst) => inst.items.includes(item.id) && inst.text.trim())
        .map((inst) => inst.text.trim())
        .join(' | ');

      return {
        username,
        item: item.id,
        time_slot: orderType === 'prebook' ? Number.parseInt(time.split(':')[0], 10) : now.getHours(),
        quantity: qty,
        is_prebooking: orderType === 'prebook' ? 1 : 0,
        takeaway: 0,
        day_of_week: orderType === 'prebook' ? prebookDate.getDay() : now.getDay(),
        prebooking_date: orderType === 'prebook' ? date : '',
        prebooking_time: orderType === 'prebook' ? time : '',
        notes: itemInstructions,
        status: 'pending',
        timestamp,
      };
    });


    try {
      await submitOrder(ordersArray);
      showToast('Order booked successfully.');
      setQuantities({});
      setInstructions([]);
      setDate('');
      setTime('');
    } catch {
      showToast('Order failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="app-bg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Toast toast={toast} />
      {refreshing && (
        <div className="fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-full bg-white/90 p-3 shadow-lg">
          <RefreshCw className="animate-spin text-[var(--primary)]" size={20} />
        </div>
      )}

      <AppHeader
        title="BiteSpeed Co."
        subtitle={`Hello, ${username}`}
        actions={(
          <>
            <span className={`cn-chip ${isLive ? 'cn-chip-success' : 'cn-chip-danger'} text-[11px] sm:text-sm max-w-[150px] sm:max-w-none overflow-hidden text-ellipsis whitespace-nowrap`}>
              {isLive ? <span className="pulse-dot" /> : null}
              {isLive ? 'Live' : 'Offline'}
            </span>
            <button className="cn-button cn-button-danger cn-icon-button" onClick={onLogout} type="button" aria-label="Logout">
              <LogOut size={17} />
            </button>
          </>
        )}
      />

      {activeMobileView === 'menu' && (
      <main className="app-shell max-w-md mx-auto">
        <section className="mb-6">
          <aside className="glass-card p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="section-title text-2xl">Ordering Method</h2>
                <p className="section-copy">
                  {orderType === 'prebook' ? 'Reserve ahead and save 5%.' : 'Immediate prep for dine-in.'}
                </p>
              </div>
            </div>
            <div className="cn-segmented">
              <button
                className={`cn-segment cn-segment-dine ${orderType === 'dine-in' ? 'active' : ''}`}
                onClick={() => setOrderType('dine-in')}
                type="button"
              >
                <img src={iconImg} alt="" className="w-4 h-4 object-contain brightness-0 invert" />
                Dine-In
              </button>
              <button
                className={`cn-segment cn-segment-prebook ${orderType === 'prebook' ? 'active' : ''}`}
                onClick={() => {
                  setOrderType('prebook');
                  if (!date) setDate(todayStr);
                  if (!time) setTime('13:00');
                  if (navigator.vibrate) navigator.vibrate(35);
                }}
                type="button"
              >
                <Calendar size={16} />
                Prebook
              </button>
            </div>

            {orderType === 'prebook' && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex gap-2">
                  <button className="cn-button cn-button-secondary flex-1" onClick={() => setDate(todayStr)} type="button">Today</button>
                  <button className="cn-button cn-button-secondary flex-1" onClick={() => setDate(tomorrowStr)} type="button">Tomorrow</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="form-label" htmlFor="order-date">Date</label>
                    <input
                      id="order-date"
                      className="form-input"
                      type="date"
                      min={todayStr}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="order-time">Time</label>
                    <input
                      id="order-time"
                      className="form-input"
                      type="time"
                      min="08:00"
                      max="18:00"
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </aside>
        </section>

        <section className="mb-6">
          <div>
            <div className="flex justify-between items-end mb-4" id="booking-menu">
              <h3 className="font-display-lg text-2xl text-[var(--on-surface)] m-0">Menu</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded text-[var(--on-surface-variant)]/70 uppercase">
                 {MENU_ITEMS.length} Items Total
              </span>
            </div>
            
            <div className="sticky top-[64px] z-40 bg-white/90 backdrop-blur-md border-b border-[var(--surface-container-high)] flex overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
                {['All', ...categories].map((category) => {
                  const isActive = activeCategory === category;
                  const tone = category === 'All' ? 'main' : (categoryStyles[category]?.tone || 'main');
                  const colorVar = category === 'All' ? 'var(--on-surface)' : (categoryStyles[category]?.color || 'var(--on-surface)');
                  return (
                    <button
                      key={category}
                      className={`font-righteous flex-shrink-0 px-4 py-3 text-[14px] uppercase tracking-wider active:scale-95 transition-all relative group ${isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                      style={{ color: colorVar }}
                      onClick={() => jumpToCategory(category)}
                      type="button"
                    >
                      {category}
                      <div className={`absolute bottom-0 left-4 right-4 h-[3px] rounded-t-full transition-all ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'} ${category === 'All' ? 'bg-[var(--on-surface)]' : `gradient-${tone}`}`}></div>
                    </button>
                  );
                })}
            </div>

            <div className="menu-category-stack">
              {groupedMenu.map(({ category, items }) => (
                <section
                  className="menu-category"
                  id={`cat-${categoryStyles[category]?.id || category.toLowerCase().replace(/\s+/g, '-')}`}
                  key={category}
                >
                  <div className="category-line">
                    <span className={`ultra-pro-header font-black uppercase tracking-[0.15em] text-white px-5 rounded-full text-sm py-2 gradient-${categoryStyles[category]?.tone || 'main'}`}>{category}</span>
                  </div>
                  <div className="menu-list">
                    {items.map((item, index) => (
                      <MenuRow
                        key={item.id}
                        item={item}
                        index={index}
                        quantity={quantities[item.id] || 0}
                        onQuantity={handleQuantity}
                        onSetQuantity={handleSetQuantity}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-5 pb-12">


          {totalItems > 0 && (
            <aside className="glass-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title text-xl">Special Instructions</h2>
                <button className="cn-button cn-button-secondary" onClick={addInstruction} type="button">Add</button>
              </div>
              <div className="space-y-3">
                {instructions.length === 0 && (
                  <p className="m-0 text-sm font-semibold text-[var(--on-surface-variant)]">No special instructions added.</p>
                )}
                {instructions.map((inst, index) => (
                  <InstructionCard
                    key={`${index}-${inst.items.join('-')}`}
                    inst={inst}
                    index={index}
                    quantities={quantities}
                    setInstructions={setInstructions}
                  />
                ))}
              </div>
            </aside>
          )}

          <aside className="glass-card p-5 mt-8 border-t-4 border-[var(--primary)] shadow-xl">
            <h2 className="section-title text-2xl mb-4">Order Summary</h2>
            <div className="space-y-3">
              <SummaryLine label="Items selected" value={totalItems} />
              <SummaryLine label="Subtotal" value={money(subtotal)} />
              {orderType === 'prebook' && totalItems > 0 && (
                <SummaryLine className="cn-chip-success rounded-2xl p-3" label="Prebook discount" value={`- ${money(discount)}`} />
              )}
              <div className="flex items-center justify-between border-t border-dashed border-[var(--outline-variant)] pt-4 text-xl font-bold">
                <span>Total</span>
                <span>{money(finalTotal)}</span>
              </div>
            </div>

            <button className="cn-button cn-button-primary mt-5 w-full text-lg h-14 shadow-lg" disabled={loading || totalItems === 0} onClick={handleSubmit} type="button">
              <Check size={20} />
              {loading ? 'Processing...' : `Confirm Order (${totalItems})`}
            </button>
          </aside>
        </section>
      </main>
      )}

      {activeMobileView === 'orders' && (
        <main className="mx-auto max-w-md pt-24 pb-32 px-4 animate-in fade-in duration-500 relative z-10">
          <div className="glass-card p-6 border-t-4 border-[var(--primary)] shadow-2xl rounded-[32px]">
            <h2 className="font-['Righteous'] text-3xl mb-6 text-[var(--on-surface)] flex items-center justify-center gap-3">
              <History size={28} className="text-[var(--primary)]" />
              History
            </h2>
            {loadingHistory ? (
              <div className="text-center py-12 text-[var(--on-surface-variant)] animate-pulse">
                <div className="inline-block w-12 h-12 rounded-full border-4 border-[var(--primary)] border-t-transparent animate-spin mb-4"></div>
                <p>Loading your past orders...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-12 text-[var(--on-surface-variant)] bg-[var(--surface-container-low)] rounded-3xl border border-dashed border-[var(--outline-variant)]">
                <Receipt size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg font-bold mb-2">No orders yet</p>
                <p className="opacity-70 text-sm">When you place an order, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historyData.map((order, i) => (
                  <div key={i} className="bg-white/80 backdrop-blur-sm p-4 rounded-[20px] border border-white/60 shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] transition-all relative overflow-hidden flex flex-col gap-3">
                    <div className={`absolute top-0 left-0 w-full h-1 ${order.status === 'completed' ? 'bg-emerald-500' : 'bg-yellow-400'}`}></div>
                    
                    <div className="flex justify-between items-start mt-1">
                      <div className="flex flex-col">
                        <span className="font-['Righteous'] text-xl text-slate-800 tracking-wide">{order.item}</span>
                        <span className="text-xs text-slate-500 font-semibold mt-0.5"><Clock size={12} className="inline mr-1 mb-0.5"/> {order.timestamp ? new Date(order.timestamp * 1000).toLocaleString() : 'Just now'}</span>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-sm font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">Qty: {order.quantity}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>{order.status}</span>
                      </div>
                    </div>
                    {order.is_prebooking ? (
                      <div className="mt-1 pt-3 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-orange-600">
                        <span className="flex items-center gap-1"><Calendar size={14}/> Prebook Slot</span>
                        <span>{order.time_slot}:00</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Floating Tray Icon */}
      <div className="fixed bottom-24 right-4 lg:right-6 z-50 flex flex-col items-end pointer-events-none">
        {showTrayPopup && (
          <div className="mb-4 w-80 max-w-[calc(100vw-32px)] rounded-[24px] bg-[rgba(48,49,46,0.95)] p-5 text-[var(--inverse-on-surface)] shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom-2 pointer-events-auto">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h3 className="m-0 text-lg font-bold">Your Tray</h3>
              <button className="rounded-full p-1 hover:bg-white/10" onClick={() => setShowTrayPopup(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
              {selectedItems.length === 0 ? (
                <p className="text-sm opacity-70">Tray is empty.</p>
              ) : selectedItems.map(({ item, qty }) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate flex-1">{item.name} <span className="opacity-70 text-xs">x{qty}</span></span>
                  <span className="font-semibold">{money(priceValue(item.price) * qty)}</span>
                </div>
              ))}
            </div>
            {totalItems > 0 && (
              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between font-bold">
                <span>Total</span>
                <span className="text-[var(--primary)]">{money(finalTotal)}</span>
              </div>
            )}
          </div>
        )}
        <button 
          className="hidden lg:flex h-16 w-16 items-center justify-center rounded-full bg-[var(--inverse-surface)] text-[var(--inverse-on-surface)] shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:scale-105 transition-transform relative border border-white/10 pointer-events-auto"
          onClick={() => setShowTrayPopup(!showTrayPopup)}
          title="View Tray"
        >
          <ShoppingBag size={26} />
          {totalItems > 0 && (
            <span className="absolute top-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm ring-2 ring-white">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {totalItems > 0 && activeMobileView === 'menu' && (
        <button 
          className="fixed bottom-24 right-4 z-40 bg-[var(--inverse-surface)] text-[var(--inverse-on-surface)] w-14 h-14 rounded-full shadow-2xl border border-white/10 flex items-center justify-center active:scale-90 transition-transform lg:hidden"
          onClick={() => setShowTrayPopup(!showTrayPopup)}
        >
          <ShoppingBag size={24} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-[var(--background)]">
            {totalItems}
          </span>
        </button>
      )}

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-white/90 backdrop-blur-xl border border-[var(--outline-variant)] shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-full p-1.5 gap-1 w-max">
        <button 
          className={`font-righteous flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm tracking-wide transition-all ${activeMobileView === 'menu' ? 'bg-yellow-400 text-slate-900 shadow-lg' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'}`} 
          onClick={() => { setActiveMobileView('menu'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
          type="button"
        >
          <img src={iconImg} alt="Order" className={`w-5 h-5 object-contain ${activeMobileView === 'menu' ? 'brightness-0' : 'brightness-0 opacity-50'}`} style={activeMobileView === 'menu' ? {filter: 'invert(9%) sepia(85%) saturate(7181%) hue-rotate(345deg) brightness(85%) contrast(105%)'} : {}} />
          Order
        </button>
        <button 
          className={`font-righteous flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm tracking-wide transition-all ${activeMobileView === 'orders' ? 'bg-yellow-400 text-slate-900 shadow-lg' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'}`} 
          onClick={() => { setActiveMobileView('orders'); fetchHistory(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
          type="button"
        >
          <History size={18} />
          History
        </button>
      </nav>
    </div>
  );
};

const SummaryLine = ({ label, value, className = '' }) => (
  <div className={`flex items-center justify-between gap-4 text-sm font-semibold text-[var(--on-surface-variant)] ${className}`}>
    <span>{label}</span>
    <strong className="text-[var(--on-surface)]">{value}</strong>
  </div>
);

const MenuRow = ({ item, quantity, onQuantity, onSetQuantity, index }) => (
  <article className="menu-row-card" style={{ animationDelay: `${Math.min(index * 42, 220)}ms` }}>
    <div className="menu-row-image">
      <img src={item.img} alt={item.name} loading="lazy" />
    </div>
    <div className="menu-row-body">
      <div className="min-w-0">
        <h3>{item.name}</h3>
        <p>{item.description}</p>
      </div>
      <div className="menu-row-meta">
        <span>{item.price}</span>
      </div>
    </div>
    <div className="menu-row-qty">
      <button className="qty-round ghost" onClick={() => onQuantity(item.id, -1)} type="button" aria-label={`Decrease ${item.name}`}>
        <Minus size={15} />
      </button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={quantity || ''}
        onChange={(event) => onSetQuantity(item.id, event.target.value)}
        placeholder="0"
        aria-label={`${item.name} quantity`}
      />
      <button className="qty-round add" onClick={() => onQuantity(item.id, 1)} type="button" aria-label={`Increase ${item.name}`}>
        <Plus size={15} />
      </button>
    </div>
  </article>
);

const InstructionCard = ({ inst, index, quantities, setInstructions }) => {
  const selectedIds = Object.keys(quantities).filter((id) => quantities[id] > 0);
  return (
    <div className="rounded-3xl border border-white/70 bg-white/55 p-4">
      <div className="mb-3 flex gap-2">
        <input
          className="form-input"
          type="text"
          placeholder="Extra spicy, no onion..."
          value={inst.text}
          onChange={(event) => {
            setInstructions((prev) => prev.map((entry, idx) => (idx === index ? { ...entry, text: event.target.value } : entry)));
          }}
        />
        <button
          className="cn-button cn-button-danger cn-icon-button"
          onClick={() => setInstructions((prev) => prev.filter((_, idx) => idx !== index))}
          type="button"
          aria-label="Remove instruction"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedIds.map((id) => {
          const item = MENU_ITEMS.find((entry) => entry.id === id);
          const active = inst.items.includes(id);
          return (
            <button
              key={id}
              className={`cn-button ${active ? 'cn-button-primary' : 'cn-button-secondary'}`}
              onClick={() => {
                setInstructions((prev) => prev.map((entry, idx) => {
                  if (idx !== index) return entry;
                  return {
                    ...entry,
                    items: active ? entry.items.filter((itemId) => itemId !== id) : [...entry.items, id],
                  };
                }));
              }}
              type="button"
            >
              {item?.name || id}
            </button>
          );
        })}
      </div>
    </div>
  );
};


export default App;

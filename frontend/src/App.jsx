import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { MENU_ITEMS } from './data/items';
import { submitOrder, setApiUrl, changePassword, setApiUser, getHistory, logoutUser } from './services/api';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';

const App = () => {
  const [user, setUser] = useState(() => localStorage.getItem('bitespeed_user'));
  const [userType, setUserType] = useState(() => localStorage.getItem('bitespeed_type') || 'n');

  React.useEffect(() => {
    if (user) setApiUser(user);
  }, [user]);

  const handleLogin = (username, type) => {
    setUser(username);
    setUserType(type);
    setApiUser(username);
  };

  const handleLogout = async () => {
    if (user) await logoutUser();
    setUser(null);
    setUserType(null);
    setApiUser('Unknown_User');
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  if (userType === 'a') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (userType === 'm') {
    return <Dashboard onLogout={handleLogout} />;
  }

  // Normal User Booking Interface
  return <BookingInterface onLogout={handleLogout} username={user} />;
};



const BookingInterface = ({ onLogout, username }) => {
  const [quantities, setQuantities] = useState({});
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in', 'prebook'
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // New states for Toast, Refresh, and Promo Popup
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [offerApplied, setOfferApplied] = useState(false);
  const [promoAmount, setPromoAmount] = useState(0);
  const [startY, setStartY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    if (window.scrollY === 0 && startY > 0) {
      if (e.touches[0].clientY - startY > 80 && !refreshing) {
        setRefreshing(true);
        // Reset quantities to simulate a fresh state
        setQuantities({});
        setTimeout(() => setRefreshing(false), 1000);
        setStartY(0);
      }
    }
  };

  const handleTouchEnd = () => setStartY(0);

  const todayStr = new Date().toISOString().split('T')[0];
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  const tmrStr = tmr.toISOString().split('T')[0];

  const fetchHistory = async (silent = false) => {
    try {
      if (!silent) setLoadingHistory(true);
      const data = await getHistory(username);
      setHistoryData(data); // Already sorted newest first by backend
      if (!silent) setShowHistory(true);
    } catch (err) {
      if (!silent) showToast("Failed to load history", "error");
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  };

  React.useEffect(() => {
    let interval;
    if (showHistory) {
      interval = setInterval(() => fetchHistory(true), 5000);
    }
    return () => clearInterval(interval);
  }, [showHistory]);

  const handleQuantity = (id, delta) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(10, current + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleSetQuantity = (id, value) => {
    let next = parseInt(value, 10);
    if (isNaN(next) && value !== '') return;
    if (value === '') next = 0;
    if (next < 0) return;
    if (next > 10) next = 10;
    
    setQuantities(prev => {
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const calculateTotalItems = () => Object.values(quantities).reduce((a, b) => a + b, 0);

  const calculateTotalPrice = () => {
    let total = 0;
    Object.keys(quantities).forEach(id => {
      const item = MENU_ITEMS.find(i => i.id === id);
      if (item) {
        const price = parseInt(item.price.replace('₹', ''), 10);
        total += price * quantities[id];
      }
    });
    return total;
  };

  React.useEffect(() => {
    const totalItems = Object.values(quantities).reduce((a, b) => a + b, 0);
    const hasOffer = orderType === 'prebook' && totalItems > 0;
    
    if (hasOffer && !offerApplied) {
      setOfferApplied(true);
      // Fire celebration blast!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10B981', '#34D399', '#FBBF24', '#F59E0B'],
        zIndex: 9999,
      });
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 120,
          origin: { y: 0.5 },
          zIndex: 9999,
        });
      }, 250);
    } else if (!hasOffer && offerApplied) {
      setOfferApplied(false);
    }
  }, [orderType, quantities, offerApplied]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (calculateTotalItems() === 0) {
        showToast("Please add at least one item.", "error");
        return;
    }

    const now = new Date();

    if (orderType === 'prebook') {
        if (!date || !time) {
            showToast("Please select a date and time for prebooking.", "error");
            return;
        }
        
        const selectedDateTime = new Date(`${date}T${time}`);
        
        if (selectedDateTime <= now) {
            showToast("Cannot book in the past!", "error");
            return;
        }
        
        const hour = selectedDateTime.getHours();
        if (hour < 8 || hour >= 18) {
            showToast("Canteen operates between 8 AM and 6 PM.", "error");
            return;
        }
    }
    
    setLoading(true);
    
    const timestamp = Math.floor(now.getTime() / 1000);
    
    let time_slot;
    let day_of_week;

    if (orderType === 'prebook') {
        const prebookDateObj = new Date(date);
        day_of_week = prebookDateObj.getDay();
        time_slot = parseInt(time.split(':')[0], 10);
    } else {
        time_slot = now.getHours();
        day_of_week = now.getDay();
    }
    
    const is_prebooking = orderType === 'prebook' ? 1 : 0;

    const ordersArray = Object.keys(quantities).map(id => {
      return {
        username: username,
        item: id,
        time_slot: time_slot,
        quantity: quantities[id],
        is_prebooking: is_prebooking,
        takeaway: 0,
        day_of_week: day_of_week,
        prebooking_date: orderType === 'prebook' ? date : '',
        prebooking_time: orderType === 'prebook' ? time : '',
        notes: notes,
        status: 'pending',
        timestamp: timestamp
      };
    });

    try {
      await submitOrder(ordersArray);
      showToast("Order booked successfully!", "success");
      setQuantities({});
      setDate('');
      setTime('');
      setNotes('');
    } catch (error) {
      showToast("Order failed. Please try again.", "error");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gray-50 pb-8 font-sans relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        @keyframes burst {
          0% { transform: scale(0.5) translateY(0); opacity: 1; }
          50% { transform: scale(1.5) translateY(-30px); opacity: 1; }
          100% { transform: scale(2) translateY(-50px); opacity: 0; }
        }
        .animate-burst {
          animation: burst 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg font-bold text-sm animate-in slide-in-from-top-4 fade-in duration-300 backdrop-blur-md ${toast.type === 'error' ? 'bg-red-500/90 text-white border border-red-400' : 'bg-black/90 text-white border border-gray-700'}`}>
          {toast.message}
        </div>
      )}

      {/* Pull to Refresh Indicator */}
      {refreshing && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40 bg-white rounded-full p-2 shadow-md animate-bounce border border-gray-100">
           <svg className="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
        </div>
      )}





      <header className="bg-gradient-to-br from-[#1a1025] to-[#0d0614] text-white pt-6 pb-5 px-5 rounded-b-[2rem] shadow-2xl shadow-indigo-900/20 mb-6 relative z-10 border-b border-indigo-900/50">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-gray-100 via-gray-300 to-gray-500 drop-shadow-md">BiteSpeed</h1>
            <p className="text-indigo-200/60 text-sm font-bold mt-0.5 tracking-wide">Hello, <span className="text-white">{username}</span></p>
          </div>
          <div className="flex flex-col gap-2.5">
            <button onClick={() => fetchHistory()} className="bg-white/10 hover:bg-indigo-500/90 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all duration-300 backdrop-blur-sm border border-white/10 shadow-sm text-center">
              Order History
            </button>
            <button onClick={onLogout} className="bg-white/10 hover:bg-red-500/90 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all duration-300 backdrop-blur-sm border border-white/10 shadow-sm text-center">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4">
        
        {/* Booking Type Section */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3">Ordering Method</h2>
          <div className="flex p-1.5 rounded-2xl mb-4 shadow-inner border border-gray-100 bg-gray-50/80 backdrop-blur">
            <button
              onClick={() => { setOrderType('dine-in'); setIsPrebooking(false); }}
              className={`flex-1 py-3.5 text-sm font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${orderType === 'dine-in' ? 'bg-[#e23744] text-white shadow-lg shadow-red-500/30 transform scale-[1.02]' : 'bg-transparent text-gray-500 hover:text-gray-800 hover:bg-white'}`}
            >
              <div className={`flex items-center justify-center w-7 h-7 rounded-full ${orderType === 'dine-in' ? 'bg-white/25 shadow-sm' : 'bg-gray-200'}`}>🍽️</div> Dine-In
            </button>
            <button
              onClick={() => {
                setOrderType('prebook');
                setIsPrebooking(true);
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              className={`flex-1 py-3.5 text-sm font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${orderType === 'prebook' ? 'bg-[#fc8019] text-white shadow-lg shadow-orange-500/30 transform scale-[1.02]' : 'bg-transparent text-gray-500 hover:text-gray-800 hover:bg-white'}`}
            >
              <div className={`flex items-center justify-center w-7 h-7 rounded-full ${orderType === 'prebook' ? 'bg-white/25 shadow-sm' : 'bg-gray-200'}`}>📅</div> Prebook
            </button>
          </div>

          <div className={`overflow-hidden transition-all duration-300 ${orderType === 'prebook' ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="flex flex-col space-y-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 shadow-inner mt-2">
              <div className="flex space-x-2">
                <button onClick={() => setDate(todayStr)} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${date === todayStr ? 'bg-indigo-600 text-white shadow-md border-indigo-600' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}>Today ({new Date(todayStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })})</button>
                <button onClick={() => setDate(tmrStr)} className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${date === tmrStr ? 'bg-indigo-600 text-white shadow-md border-indigo-600' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}>Tomorrow ({new Date(tmrStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })})</button>
              </div>
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Date</label>
                  <input 
                    type="date" 
                    min={todayStr}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full p-2.5 border-2 border-indigo-100 rounded-xl text-sm bg-white font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Time (8 AM - 5 PM)</label>
                  <input 
                    type="time" 
                    list="time-slots"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full p-2.5 border-2 border-indigo-100 rounded-xl text-sm bg-white font-semibold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  />
                  <datalist id="time-slots">
                    {Array.from({ length: 10 }, (_, i) => i + 8).map(h => (
                      <option key={h} value={`${h.toString().padStart(2, '0')}:00`} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Section */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3 flex items-center justify-between">
            Menu
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{MENU_ITEMS.length} Items</span>
          </h2>
          
          <div className="space-y-8">
            {[...new Set(MENU_ITEMS.map(i => i.category || 'Other'))].map((category, idx) => {
              const colorClass = ['text-white bg-red-500', 'text-white bg-blue-500', 'text-white bg-emerald-500', 'text-white bg-amber-500', 'text-white bg-purple-500'][idx % 5];
              const lineClass = ['bg-red-200', 'bg-blue-200', 'bg-emerald-200', 'bg-amber-200', 'bg-purple-200'][idx % 5];
              return (
              <div key={category} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className={`font-black uppercase tracking-widest text-xs px-3 py-1 rounded-md shadow-sm ${colorClass}`}>{category}</h3>
                  <div className={`h-px flex-1 ${lineClass}`}></div>
                </div>
                <div className="space-y-3">
                  {MENU_ITEMS.filter(i => (i.category || 'Other') === category).map(item => (
                    <div key={item.id} className="flex justify-between items-center group p-2 sm:p-3 bg-white hover:bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all duration-300 hover:shadow-md">
                      <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0 pr-2">
                        <img src={item.img} alt={item.name} className="w-16 h-16 object-cover rounded-2xl shadow-sm border border-gray-100 shrink-0 transform group-hover:scale-105 transition-transform duration-300" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-800 drop-shadow-sm truncate text-base sm:text-lg leading-tight transition-colors">{item.name}</h3>
                          <p className="text-sm font-extrabold text-indigo-500 mt-1">{item.price}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 sm:space-x-2 bg-gray-100 rounded-full py-1.5 px-1.5 sm:px-2 border border-gray-200 shadow-inner shrink-0 transform transition-transform group-hover:scale-105">
                        <button 
                          onClick={() => handleQuantity(item.id, -1)}
                          className="w-8 h-8 flex items-center justify-center font-bold text-gray-700 bg-white rounded-full shadow-sm hover:bg-gray-200 transition-colors active:scale-95"
                        >
                          -
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={quantities[item.id] || ''}
                          onChange={(e) => handleSetQuantity(item.id, e.target.value)}
                          placeholder="0"
                          className="w-6 sm:w-8 text-center font-extrabold text-gray-700 bg-transparent outline-none text-sm sm:text-base"
                        />
                        <button 
                          onClick={() => handleQuantity(item.id, 1)}
                          className="w-8 h-8 flex items-center justify-center font-bold text-white bg-black rounded-full shadow-md hover:bg-gray-800 transition-colors active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )})}
          </div>
        </div>

        {/* Notes Section */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-sm font-bold text-gray-800 mb-2">Special Instructions</h2>
          <textarea
            placeholder="Any notes for the chef?"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-colors text-sm font-medium resize-none h-20"
          />
        </div>

        {/* Order Summary Section */}
        {calculateTotalItems() > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3">Order Summary</h2>
            <div className="space-y-3 mb-4">
              {Object.keys(quantities).map(id => {
                const item = MENU_ITEMS.find(i => i.id === id);
                if (!item || quantities[id] === 0) return null;
                const price = parseInt(item.price.replace('₹', ''), 10);
                const itemTotal = price * quantities[id];
                return (
                  <div key={id} className="flex justify-between items-center text-sm font-medium text-gray-700">
                    <span className="flex-1 truncate pr-4">{item.name} <span className="text-gray-400 ml-1">x{quantities[id]}</span></span>
                    <span className="shrink-0 font-bold">₹{itemTotal}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="border-t border-dashed border-gray-200 pt-3 space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-gray-500">
                <span>Subtotal</span>
                <span>₹{calculateTotalPrice()}</span>
              </div>
              
              {orderType === 'prebook' && (
                <div className="flex justify-between items-center text-sm font-bold text-emerald-600 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 mt-2">
                  <span className="flex items-center"><span className="text-lg mr-2">🎉</span> Pre-booking Discount (5%)</span>
                  <span>- ₹{Math.round(calculateTotalPrice() * 0.05)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-xl font-black text-gray-800 pt-3 border-t border-gray-100 mt-3">
                <span>Final Total</span>
                <span>
                  ₹{orderType === 'prebook' 
                    ? calculateTotalPrice() - Math.round(calculateTotalPrice() * 0.05) 
                    : calculateTotalPrice()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-4 relative">
          
          {/* Animated Celebration handled by canvas-confetti in useEffect */}

          <button
            onClick={handleSubmit}
            disabled={loading || calculateTotalItems() === 0}
            className="w-full bg-black text-white font-extrabold text-lg py-4 sm:py-5 rounded-2xl shadow-xl hover:bg-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 active:translate-y-0 flex flex-col items-center justify-center relative overflow-hidden group"
          >
            <span className="flex items-center space-x-2">
              <span>{loading ? 'Processing Order...' : `Confirm Order (${calculateTotalItems()})`}</span>
              {!loading && calculateTotalItems() > 0 && (
                <>
                  <span className="opacity-50 mx-1">•</span>
                  {orderType === 'prebook' ? (
                    <div className="flex items-center space-x-2">
                      <span className="line-through opacity-60 text-sm">₹{calculateTotalPrice()}</span>
                      <span className="text-emerald-400 font-black">₹{calculateTotalPrice() - Math.round(calculateTotalPrice() * 0.05)}</span>
                    </div>
                  ) : orderType === 'takeaway' ? (
                    <span className="text-red-300 font-black">₹{calculateTotalPrice()}</span>
                  ) : (
                    <span>₹{calculateTotalPrice()}</span>
                  )}
                </>
              )}
            </span>
          </button>
        </div>
      </main>

      {/* History Modal Overlay */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h2 className="text-xl font-bold flex flex-col">
                Order History
                <span className="text-xs text-gray-500 font-medium mt-1">Your past cravings</span>
              </h2>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold hover:bg-gray-300 transition-colors">✕</button>
            </div>
            
            <div className="overflow-y-auto p-5 scrollbar-hide flex-1">
              {historyData.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                   <p className="font-bold text-lg text-gray-800">No orders yet</p>
                   <p className="text-sm text-gray-500">Time to grab a bite!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyData.map((order, idx) => {
                    const orderDate = new Date(order.timestamp * 1000).toLocaleString(undefined, {
                       month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    return (
                      <div key={idx} className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-black text-lg text-gray-800 capitalize">{order.item}</span>
                          <span className="font-bold bg-gray-100 text-gray-800 px-2 py-0.5 rounded-md text-sm">x{order.quantity}</span>
                        </div>
                        <div className="flex justify-between items-end">
                           <div className="flex flex-col">
                             <span className="text-xs font-bold text-gray-400 mb-1">ORDERED ON</span>
                             <span className="text-xs font-semibold text-gray-600">{orderDate}</span>
                           </div>
                           <div className="flex flex-col items-end">
                             {order.is_prebooking ? (
                               <span className="text-[10px] uppercase tracking-wider font-extrabold bg-indigo-50 text-indigo-500 px-2.5 py-1 rounded-md border border-indigo-100 mb-1">
                                 Prebook
                               </span>
                             ) : order.takeaway ? (
                               <span className="text-[10px] uppercase tracking-wider font-extrabold bg-orange-50 text-orange-600 px-2.5 py-1 rounded-md border border-orange-100 mb-1">
                                 Takeaway
                               </span>
                             ) : (
                               <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-md border border-emerald-100 mb-1">
                                 Dine-In
                               </span>
                             )}
                             <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-md border ${(order.status === 'delivered' || order.is_delivered) ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                               {(order.status || (order.is_delivered ? 'delivered' : 'pending')).replace(/_/g, ' ')}
                             </span>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


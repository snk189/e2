import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { MENU_ITEMS } from './data/items';
import { submitOrder, setApiUrl } from './services/api';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

const App = () => {
  const [networkConfigured, setNetworkConfigured] = useState(false);
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);

  const handleLogin = (username, type) => {
    setUser(username);
    setUserType(type);
  };

  const handleLogout = () => {
    setUser(null);
    setUserType(null);
  };

  if (!networkConfigured) {
    return <NetworkConfig onConnect={() => setNetworkConfigured(true)} />;
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  if (userType === 'm') {
    return <Dashboard onLogout={handleLogout} />;
  }

  // Normal User Booking Interface
  return <BookingInterface onLogout={handleLogout} username={user} />;
};

const NetworkConfig = ({ onConnect }) => {
  const [ip, setIp] = useState('');
  // Ngrok provides one free static URL! This will be your permanent default internet URL.
  const LOCAL_FALLBACK = 'https://nondefensible-helminthological-tennie.ngrok-free.dev';

  const handleConnect = (e) => {
    e.preventDefault();
    const finalIp = ip.trim() || LOCAL_FALLBACK;
    setApiUrl(finalIp);
    onConnect();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm border border-gray-100 animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-center mb-2 text-gray-800">API Connection</h2>
        <p className="text-center text-sm text-gray-500 mb-6 font-medium">To use the Native App over Mobile Data, paste today's Ngrok URL below!</p>
        
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Ngrok API Server URL</label>
            <input 
              type="text" 
              placeholder={`e.g. https://xyz.ngrok-free.app`}
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="w-full p-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:bg-white outline-none font-mono text-sm transition-all"
            />
          </div>
          <button type="submit" className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200">
            Connect
          </button>
        </form>
      </div>
    </div>
  );
};

const BookingInterface = ({ onLogout, username }) => {
  const [quantities, setQuantities] = useState({});
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' or 'prebook'
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const { getHistory } = await import('./services/api');
      const data = await getHistory(username);
      setHistoryData(data.reverse()); // latest first
      setShowHistory(true);
    } catch (err) {
      showToast("Failed to load history", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleQuantity = (id, delta) => {
    setQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
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
        if (hour < 8 || hour >= 20) {
            showToast("Canteen operates between 8 AM and 8 PM.", "error");
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
        day_of_week: day_of_week,
        prebooking_date: orderType === 'prebook' ? date : '',
        prebooking_time: orderType === 'prebook' ? time : '',
        timestamp: timestamp
      };
    });

    try {
      await submitOrder(ordersArray);
      showToast("Order booked successfully!", "success");
      setQuantities({});
      setDate('');
      setTime('');
    } catch (error) {
      showToast(`Backend failed: ${error.message}. Contact the AI if this continues.`, "error");
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



      <header className="bg-black text-white p-5 rounded-b-3xl shadow-md mb-6">
        <div className="flex justify-between items-center mb-1">
           <h1 className="text-2xl font-extrabold tracking-tight">BiteSpeed</h1>
           <div className="flex space-x-2">
              <button 
                onClick={fetchHistory} 
                className="bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                {loadingHistory ? 'Wait...' : 'History'}
              </button>
              <button 
                onClick={onLogout} 
                className="bg-red-500/80 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm hover:bg-red-600 transition-colors backdrop-blur-sm"
              >
                Exit
              </button>
           </div>
        </div>
        <p className="text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Welcome, <span className="text-white">{username}</span></p>
      </header>

      <main className="max-w-md mx-auto px-4">
        
        {/* Menu Section */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3 flex items-center justify-between">
            Menu
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{MENU_ITEMS.length} Items</span>
          </h2>
          <div className="space-y-4">
            {MENU_ITEMS.map(item => (
              <div key={item.id} className="flex justify-between items-center group py-2">
                <div className="flex items-center space-x-3 flex-1 min-w-0 pr-2">
                  <img src={item.img} alt={item.name} className="w-14 h-14 object-cover rounded-2xl shadow-sm border border-gray-100 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 drop-shadow-sm truncate text-base sm:text-lg leading-tight">{item.name}</h3>
                    <p className="text-sm font-semibold text-gray-500 mt-0.5">{item.price}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2 bg-gray-50 rounded-full py-1 px-1 sm:px-1.5 border border-gray-200 shadow-sm shrink-0">
                  <button 
                    onClick={() => handleQuantity(item.id, -1)}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-gray-600 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors"
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
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-white bg-black rounded-full shadow-sm hover:bg-gray-800 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Booking Type Section */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3">Ordering Method</h2>
          <div className="flex space-x-3 mb-4">
            <button
              onClick={() => setOrderType('dine-in')}
              className={`flex-1 py-3 font-bold rounded-2xl transition-colors ${orderType === 'dine-in' ? 'bg-black text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
            >
              Dine-In Now
            </button>
            <button
              onClick={() => setOrderType('prebook')}
              className={`flex-1 py-3 font-bold rounded-2xl transition-colors ${orderType === 'prebook' ? 'bg-black text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200'}`}
            >
              Prebook
            </button>
          </div>

          {orderType === 'prebook' && (
            <div className="flex space-x-3 p-4 bg-gray-50 rounded-2xl border border-gray-200 shadow-inner">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Date</label>
                <input 
                  type="date" 
                  min={todayStr}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full p-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white font-semibold focus:border-black focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Time</label>
                <input 
                  type="time" 
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full p-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white font-semibold focus:border-black focus:ring-0 outline-none transition-colors"
                />
              </div>
            </div>
          )}
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
                <span className="text-xs text-gray-500 font-medium">Your past cravings</span>
              </h2>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold hover:bg-gray-300 transition-colors">✕</button>
            </div>
            
            <div className="overflow-y-auto p-5 scrollbar-hide flex-1">
              {historyData.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                   <p className="font-bold text-lg">No orders yet</p>
                   <p className="text-sm">Time to grab a bite!</p>
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
                           {order.is_prebooking ? (
                             <span className="text-[10px] uppercase tracking-wider font-extrabold bg-indigo-50 text-indigo-500 px-2.5 py-1 rounded-md border border-indigo-100">
                               Prebook • {order.prebooking_date}
                             </span>
                           ) : (
                             <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-md border border-emerald-100">
                               Dine-In
                             </span>
                           )}
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


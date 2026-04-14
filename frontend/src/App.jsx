import React, { useState } from 'react';
import { MENU_ITEMS } from './data/items';
import { submitOrder } from './services/api';

const App = () => {
  const [quantities, setQuantities] = useState({});
  const [orderType, setOrderType] = useState('dine-in'); // 'dine-in' or 'prebook'
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);

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

  const calculateTotalItems = () => Object.values(quantities).reduce((a, b) => a + b, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (calculateTotalItems() === 0) {
        alert("Please add at least one item.");
        return;
    }

    if (orderType === 'prebook' && (!date || !time)) {
        alert("Please select a date and time for prebooking.");
        return;
    }
    
    setLoading(true);
    
    const now = new Date();
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
      alert("Order booked successfully!");
      setQuantities({});
      setDate('');
      setTime('');
    } catch (error) {
      alert(`Backend failed: ${error.message}. Contact the AI if this continues.`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8 font-sans">
      <header className="bg-black text-white p-5 rounded-b-3xl shadow-md mb-4">
        <h1 className="text-3xl font-extrabold text-center tracking-tight">BiteSpeed</h1>
      </header>

      <main className="max-w-md mx-auto px-4">
        
        {/* Menu Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">Menu Items</h2>
          <div className="space-y-4">
            {MENU_ITEMS.map(item => (
              <div key={item.id} className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-800">{item.name}</h3>
                  <p className="text-sm font-semibold text-gray-500">{item.price}</p>
                </div>
                <div className="flex items-center space-x-3 bg-gray-100 rounded-full py-1 px-2 border border-gray-200">
                  <button 
                    onClick={() => handleQuantity(item.id, -1)}
                    className="w-8 h-8 flex items-center justify-center font-bold text-gray-600 bg-white rounded-full shadow-sm"
                  >
                    -
                  </button>
                  <span className="w-4 text-center font-bold">{quantities[item.id] || 0}</span>
                  <button 
                    onClick={() => handleQuantity(item.id, 1)}
                    className="w-8 h-8 flex items-center justify-center font-bold text-white bg-black rounded-full shadow-sm"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Booking Type Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">Order Options</h2>
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => setOrderType('dine-in')}
              className={`flex-1 py-3 font-bold rounded-xl ${orderType === 'dine-in' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Dine-In Now
            </button>
            <button
              onClick={() => setOrderType('prebook')}
              className={`flex-1 py-3 font-bold rounded-xl ${orderType === 'prebook' ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Prebook Later
            </button>
          </div>

          {orderType === 'prebook' && (
            <div className="flex space-x-2 mb-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 mb-1">Time</label>
                <input 
                  type="time" 
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || calculateTotalItems() === 0}
          className="w-full bg-black text-white font-bold text-lg py-4 rounded-xl shadow-lg disabled:opacity-50"
        >
          {loading ? 'Booking...' : `Book Order (${calculateTotalItems()} items)`}
        </button>
      </main>
    </div>
  );
};

export default App;

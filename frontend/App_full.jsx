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
  Utensils,
  X,
} from 'lucide-react';
import { MENU_ITEMS } from './data/items';
import { submitOrder, setApiUser, getHistory, logoutUser } from './services/api';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';

const priceValue = (price) => parseInt(String(price).replace(/\D/g, ''), 10) || 0;
const money = (value) => `Rs. ${value}`;
const categories = [...new Set(MENU_ITEMS.map((item) => item.category || 'Other'))];
const categoryStyles = {
  'Main Course': { id: 'main-course', tone: 'main' },
  'Fast Food': { id: 'fast-food', tone: 'fast' },
  Beverages: { id: 'beverages', tone: 'bev' },
  Dessert: { id: 'dessert', tone: 'dessert' },
  Snacks: { id: 'snacks', tone: 'snacks' },
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
    localSto
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto p-5">
        {loadingHistory ? (
          <p className="text-center text-sm font-semibold text-[var(--on-surface-variant)]">Loading history...</p>
        ) : historyData.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-[var(--outline-variant)] bg-white/45 p-8 text-center text-sm font-semibold text-[var(--on-surface-variant)]">
            No orders yet.
          </p>
        ) : (
          <div className="space-y-3">
            {historyData.map((order, index) => {
              const orderDate = order.timestamp
                ? new Date(order.timestamp * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Recent';
              const status = (order.status || (order.is_delivered ? 'delivered' : 'pending')).replace(/_/g, ' ');
              return (
                <div key={`${order.item}-${order.timestamp}-${index}`} className="rounded-3xl border border-white/70 bg-white/62 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="m-0 text-base font-bold capitalize">{order.item} x{order.quantity}</p>
                      <p className="m-0 mt-1 text-xs font-semibold text-[var(--on-surface-variant)]">{orderDate}</p>
                    </div>
                    <span className="cn-chip cn-chip-success capitalize">{status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default App;

import React, { useState, useEffect } from 'react';
import { loginUser, registerUser, setApiUrl, getApiUrl } from '../services/api';

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('n');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamic Server URL
  const [serverUrl, setServerUrlState] = useState(() => {
    return localStorage.getItem('bitespeed_server_url') || getApiUrl();
  });
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking', 'online', 'offline'

  useEffect(() => {
    handleUrlChange(serverUrl);
  }, []);

  const handleUrlChange = (url) => {
    setServerUrlState(url);
    localStorage.setItem('bitespeed_server_url', url);
    setApiUrl(url);
    checkConnection();
  };

  const checkConnection = async () => {
    setServerStatus('checking');
    try {
      const cleanUrl = getApiUrl();
      const res = await fetch(`${cleanUrl}/demand`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'ngrok-skip-browser-warning': 'true'
        }
      });
      if (res.ok || res.status === 202) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (serverStatus === 'offline') {
      setError('Backend is offline. Please check the Server URL.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const data = await loginUser(username, password);
        onLogin(data.user || username, data.type || 'n');
      } else {
        const data = await registerUser(username, password, type);
        onLogin(data.user || username, data.type || 'n');
      }
    } catch (err) {
      setError(err.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-sans px-4">
      <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md border border-gray-100 mt-8 mb-8">
        <h1 className="text-4xl font-extrabold text-center tracking-tight mb-8 text-black">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm font-semibold border border-red-200">
            {error}
          </div>
        )}

        {/* Server Connection Panel */}
        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-gray-700">Server URL (Mobile Data)</label>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              serverStatus === 'online' ? 'bg-green-100 text-green-700' : 
              serverStatus === 'checking' ? 'bg-yellow-100 text-yellow-700' : 
              'bg-red-100 text-red-700'
            }`}>
              {serverStatus === 'online' ? '● Online' : serverStatus === 'checking' ? 'Checking...' : '○ Offline'}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrlState(e.target.value)}
              onBlur={() => handleUrlChange(serverUrl)}
              className="flex-1 w-full p-2 text-sm border-2 border-gray-200 rounded-lg focus:border-black focus:ring-0 outline-none transition-colors"
              placeholder="https://your-ngrok-site.ngrok.app"
            />
            <button 
              onClick={(e) => { e.preventDefault(); checkConnection(); }}
              className="bg-gray-200 hover:bg-gray-300 text-black font-bold px-3 rounded-lg text-sm transition-colors"
            >
              Ping
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-black focus:ring-0 outline-none transition-colors"
              placeholder="Enter your username"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-black focus:ring-0 outline-none transition-colors"
              placeholder="Enter your password"
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Account Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-black focus:ring-0 outline-none transition-colors bg-white font-semibold text-gray-700"
              >
                <option value="n">Normal User</option>
                <option value="m">Management</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || serverStatus !== 'online'}
            className={`w-full font-bold text-lg py-4 rounded-xl shadow-lg transition-all mt-4 ${
              serverStatus === 'online' 
                ? 'bg-black text-white hover:bg-gray-800' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loading ? 'Processing...' : (isLogin ? 'Log In' : 'Register')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-gray-500 font-semibold hover:text-black transition-colors"
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Log In'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;

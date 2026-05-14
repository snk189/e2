import React, { useState, useEffect } from 'react';
import { loginUser, registerUser, setApiUrl, getApiUrl } from '../services/api';

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('n');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamic Server URL
  const [serverUrl, setServerUrlState] = useState(() => {
    return localStorage.getItem('bitespeed_server_url') || getApiUrl();
  });
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking', 'online', 'offline'

  useEffect(() => {
    handleUrlChange(serverUrl);
  }, [serverUrl]);

  const handleUrlChange = (url) => {
    setServerUrlState(url);
    localStorage.setItem('bitespeed_server_url', url);
    setApiUrl(url);
    checkConnection(url);
  };

  const checkConnection = async (urlToUse = serverUrl) => {
    // Optional: avoid setting 'checking' every second to prevent flicker, 
    // only if we are currently offline or first time.
    if (serverStatus !== 'online') {
      setServerStatus('checking');
    }
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
    setSuccess('');

    try {
      if (isLogin) {
        const data = await loginUser(username, password);
        onLogin(data.user || username, data.type || 'n');
      } else {
        const data = await registerUser(username, password, type);
        setSuccess(data.message || 'Registration request sent. Waiting for admin approval.');
        setIsLogin(true); // switch to login so they can wait
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

        {success && (
          <div className="bg-green-50 text-green-600 p-3 rounded-xl mb-4 text-sm font-semibold border border-green-200">
            {success}
          </div>
        )}

        {/* Server Connection Panel */}
        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold text-gray-700">Server URL (Mobile Data)</label>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border transition-colors ${
              serverStatus === 'online' ? 'bg-green-50 text-green-700 border-green-200' : 
              serverStatus === 'checking' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 
              'bg-red-50 text-red-700 border-red-200'
            }`}>
              {serverStatus === 'online' ? (
                 <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span> Online</>
              ) : serverStatus === 'checking' ? (
                 <><svg className="w-3 h-3 animate-spin text-yellow-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Pinging...</>
              ) : (
                 <><span className="w-2 h-2 rounded-full bg-red-500"></span> Offline</>
              )}
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
                <option value="a">Admin</option>
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
              setSuccess('');
            }}
            className="text-gray-500 font-semibold hover:text-black transition-colors"
          >
            {isLogin ? (
              <>Don't have an account? <span className="text-indigo-600 hover:text-indigo-800 transition-colors">Register</span></>
            ) : (
              <>Already have an account? <span className="text-indigo-600 hover:text-indigo-800 transition-colors">Log In</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;

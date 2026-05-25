import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, Server } from 'lucide-react';
import { loginUser, registerUser, setApiUrl, getApiUrl } from '../services/api';
import iconImg from '../../assets/icon.png';

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('n');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrlState] = useState(() => {
    let url = getApiUrl();
    if (url.endsWith('/api')) url = url.slice(0, -4);
    return url;
  });
  const [serverStatus, setServerStatus] = useState('checking');

  const checkConnection = async () => {
    setServerStatus((current) => (current === 'online' ? current : 'checking'));
    try {
      const res = await fetch(`${getApiUrl()}/demand`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      setServerStatus(res.ok || res.status === 202 ? 'online' : 'offline');
    } catch {
      setServerStatus('offline');
    }
  };

  useEffect(() => {
    setApiUrl(serverUrl);
    localStorage.setItem('bitespeed_server_url', serverUrl);
    const timer = setTimeout(() => {
      checkConnection();
    }, 500);
    return () => clearTimeout(timer);
  }, [serverUrl]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (serverStatus === 'offline') {
      setError('Backend is offline. Check the server URL.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const data = await loginUser(username.trim(), password);
        const role = data.type || 'n';
        onLogin(data.user || username.trim(), role);
      } else {
        const data = await registerUser(username.trim(), password, type);
        setSuccess(data.message || 'Registration sent. Please wait for admin approval.');
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.error || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const hour = new Date().getHours();
  const isLive = hour >= 8 && hour < 18;

  return (
    <div className="app-bg flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-2xl flex-col gap-5 mx-auto">
        <section className="glass-card overflow-hidden flex flex-col p-7 sm:p-9">
          <div className="brand-lockup mb-6">
            <div className="flex items-center justify-center bg-white rounded-full p-2 shadow-sm w-20 h-20">
              <img src={iconImg} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="brand-title">BiteSpeed Co.</h1>
              <p className="brand-subtitle">Culinary Nexus mobile canteen</p>
            </div>
          </div>

          <div className="bg-white/40 p-5 sm:p-7 rounded-[28px] border border-white/60 mb-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <div className="mb-6 flex flex-col gap-2">
              <h2 className="section-title">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="section-copy">{isLogin ? 'Continue to the canteen.' : 'Registration needs admin approval.'}</p>
            </div>

            {(error || success) && (
              <div className={`mb-4 rounded-3xl p-4 text-sm font-bold ${error ? 'bg-[var(--error-container)] text-[var(--error)]' : 'bg-[rgba(108,248,187,0.22)] text-[var(--secondary)]'}`}>
                {error || success}
              </div>
            )}

            <div className="mb-5 rounded-3xl border border-white/70 bg-white/52 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="form-label m-0 flex items-center gap-2" htmlFor="server-url">
                  <Server size={15} />
                  Server URL
                </label>
                <span className={`cn-chip ${serverStatus === 'online' ? 'cn-chip-success' : serverStatus === 'offline' ? 'cn-chip-danger' : 'cn-chip-warm'}`}>
                  {serverStatus === 'checking' ? <RefreshCw className="animate-spin" size={13} /> : <span className="pulse-dot" />}
                  {serverStatus === 'online' ? 'Online' : serverStatus === 'checking' ? 'Checking' : 'Offline'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id="server-url"
                  className="form-input"
                  type="text"
                  value={serverUrl}
                  onChange={(event) => setServerUrlState(event.target.value)}
                  placeholder="https://your-server.ngrok.app"
                />
                <button className="cn-button cn-button-secondary" onClick={checkConnection} type="button">Ping</button>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="form-label" htmlFor="username">Username</label>
                <input
                  id="username"
                  className="form-input"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder="Enter password"
                />
              </div>
              {!isLogin && (
                <div>
                  <label className="form-label" htmlFor="account-type">Account Type</label>
                  <select id="account-type" className="form-input" value={type} onChange={(event) => setType(event.target.value)}>
                    <option value="n">Normal User</option>
                    <option value="m">Management</option>
                    <option value="a">Admin</option>
                  </select>
                </div>
              )}
              <button className="cn-button cn-button-primary w-full" disabled={loading || serverStatus !== 'online'} type="submit">
                <Check size={18} />
                {loading ? 'Processing...' : isLogin ? 'Log In' : 'Register'}
              </button>
            </form>

            <button
              className="cn-button cn-button-secondary mt-5 w-full"
              onClick={() => {
                setIsLogin((current) => !current);
                setError('');
                setSuccess('');
              }}
              type="button"
            >
              {isLogin ? 'Need an account? Register' : 'Already approved? Log in'}
            </button>
          </div>

          <p className="eyebrow mb-3">Sophisticated bistro service</p>
          <h2 className="m-0 max-w-xl text-2xl font-bold leading-tight text-[var(--on-surface)] sm:text-3xl">
            Prebook lunch with the polish of a boutique cafe.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-6 text-[var(--on-surface-variant)]">
            Choose canteen favorites, reserve a time, and keep the queue moving without losing fresh food quality.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={`cn-chip ${isLive ? 'cn-chip-success' : 'cn-chip-danger'}`}>
              {isLive ? <span className="pulse-dot" /> : null}
              {isLive ? 'Live' : 'Offline'}
            </span>
            <span className="cn-chip cn-chip-warm">5% prebook saving</span>
          </div>
          
          <div className="relative h-[230px] w-full mt-10 rounded-3xl overflow-hidden">
            <img className="h-full w-full object-cover" src="/images/pulao.jpg" alt="Fresh pulao" />
            <div className="absolute bottom-4 left-4 right-4 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-lg backdrop-blur-xl">
              <p className="m-0 text-sm font-bold text-[var(--on-surface)]">Currently cooking</p>
              <p className="m-0 mt-1 text-xs font-semibold text-[var(--on-surface-variant)]">
                Pulao, dosa, and filter coffee are moving fastest.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Auth;

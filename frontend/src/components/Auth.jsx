import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/api';

const Auth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState('n'); // 'n' for normal, 'm' for management
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
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
      <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md border border-gray-100">
        <h1 className="text-4xl font-extrabold text-center tracking-tight mb-8 text-black">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm font-semibold border border-red-200">
            {error}
          </div>
        )}

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
            disabled={loading}
            className="w-full bg-black text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-gray-800 transition-colors disabled:opacity-50 mt-4"
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

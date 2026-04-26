import React, { useState, useEffect } from 'react';
import { getAdminSettings, updateAdminSettings } from '../services/api';

const EnvironmentSettings = () => {
  const [settings, setSettings] = useState({
    is_holiday: 0,
    is_bridge_day: 0,
    season: 'winter',
    temperature_celsius: 25.0,
    weather: 'sunny',
    is_exam_week: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getAdminSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : 
              type === 'number' ? parseFloat(value) : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await updateAdminSettings(settings);
      setMessage('Settings saved successfully! New orders will now use these values.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-gray-500">Loading settings...</div>;

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6">
      <h2 className="text-xl font-bold mb-4 border-b border-gray-100 pb-3 flex items-center justify-between">
        Environment Settings
        <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">ML Model Input</span>
      </h2>
      
      <p className="text-sm text-gray-500 mb-6">
        Configure today's environmental context. These parameters are directly appended to new user orders and feed the XGBoost demand forecasting model.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Toggle Switches */}
        <div className="space-y-4">
          <label className="flex items-center justify-between bg-gray-50 p-3 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
            <span className="font-semibold text-gray-700">Is Holiday?</span>
            <input 
              type="checkbox" 
              name="is_holiday"
              checked={settings.is_holiday === 1}
              onChange={handleChange}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>
          
          <label className="flex items-center justify-between bg-gray-50 p-3 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
            <span className="font-semibold text-gray-700">Is Bridge Day?</span>
            <input 
              type="checkbox" 
              name="is_bridge_day"
              checked={settings.is_bridge_day === 1}
              onChange={handleChange}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>
          
          <label className="flex items-center justify-between bg-gray-50 p-3 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
            <span className="font-semibold text-gray-700">Is Exam Week?</span>
            <input 
              type="checkbox" 
              name="is_exam_week"
              checked={settings.is_exam_week === 1}
              onChange={handleChange}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>
        </div>

        {/* Inputs & Selects */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Temperature (°C)</label>
            <input 
              type="number" 
              name="temperature_celsius"
              step="0.1"
              value={settings.temperature_celsius}
              onChange={handleChange}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Season</label>
            <select 
              name="season" 
              value={settings.season} 
              onChange={handleChange}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="autumn">Autumn</option>
              <option value="winter">Winter</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Weather</label>
            <select 
              name="weather" 
              value={settings.weather} 
              onChange={handleChange}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="sunny">Sunny</option>
              <option value="cloudy">Cloudy</option>
              <option value="rainy">Rainy</option>
              <option value="snowy">Snowy</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-between">
        <span className={`text-sm font-medium ${message.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
          {message}
        </span>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Context'}
        </button>
      </div>
    </div>
  );
};

export default EnvironmentSettings;

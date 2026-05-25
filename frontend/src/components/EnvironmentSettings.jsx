import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, Save } from 'lucide-react';
import { getAdminSettings, updateAdminSettings } from '../services/api';

const EnvironmentSettings = () => {
  const [settings, setSettings] = useState({
    is_holiday: 0,
    is_bridge_day: 0,
    season: 'winter',
    temperature_celsius: 25.0,
    weather: 'sunny',
    is_exam_week: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await getAdminSettings();
        setSettings((current) => ({ ...current, ...data }));
      } catch {
        setMessage('Could not load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (event) => {
    const { name, value, type } = event.target;
    setSettings((prev) => ({
      ...prev,
      [name]: ['is_holiday', 'is_bridge_day', 'is_exam_week'].includes(name)
        ? Number.parseInt(value, 10)
        : type === 'number'
          ? Number.parseFloat(value)
          : value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await updateAdminSettings(settings);
      setMessage('Settings saved. New orders will use this context.');
      window.setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card flex min-h-48 items-center justify-center p-8">
        <RefreshCw className="mr-3 animate-spin text-[var(--primary)]" size={22} />
        <span className="text-sm font-bold text-[var(--on-surface-variant)]">Loading settings...</span>
      </div>
    );
  }

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="section-title">Environment Settings</h2>
          <p className="section-copy">These values are appended to new orders for demand forecasting.</p>
        </div>
        <span className="cn-chip cn-chip-warm">ML model input</span>
      </div>

      <div className="responsive-grid">
        <div className="space-y-4">
          <SelectField label="Is Holiday?" name="is_holiday" value={settings.is_holiday} onChange={handleChange} options={yesNoOptions} />
          <SelectField label="Is Bridge Day?" name="is_bridge_day" value={settings.is_bridge_day} onChange={handleChange} options={yesNoOptions} />
          <SelectField label="Is Exam Week?" name="is_exam_week" value={settings.is_exam_week} onChange={handleChange} options={yesNoOptions} />
        </div>
        <div className="space-y-4">
          <div>
            <label className="form-label" htmlFor="temperature_celsius">Temperature (C)</label>
            <input
              id="temperature_celsius"
              className="form-input"
              type="number"
              name="temperature_celsius"
              step="0.1"
              value={settings.temperature_celsius}
              onChange={handleChange}
            />
          </div>
          <SelectField label="Season" name="season" value={settings.season} onChange={handleChange} options={[
            ['spring', 'Spring'],
            ['summer', 'Summer'],
            ['autumn', 'Autumn'],
            ['winter', 'Winter'],
          ]} />
          <SelectField label="Weather" name="weather" value={settings.weather} onChange={handleChange} options={[
            ['sunny', 'Sunny'],
            ['cloudy', 'Cloudy'],
            ['rainy', 'Rainy'],
            ['snowy', 'Snowy'],
          ]} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className={`text-sm font-bold ${message.includes('Error') || message.includes('Could') ? 'text-[var(--error)]' : 'text-[var(--secondary)]'}`}>
          {message}
        </span>
        <button className="cn-button cn-button-primary" onClick={handleSave} disabled={saving} type="button">
          {saving ? <RefreshCw className="animate-spin" size={17} /> : <Save size={17} />}
          {saving ? 'Saving...' : 'Save Context'}
        </button>
      </div>
    </section>
  );
};

const SelectField = ({ label, name, value, onChange, options }) => (
  <div>
    <label className="form-label" htmlFor={name}>{label}</label>
    <select id={name} className="form-input" name={name} value={value} onChange={onChange}>
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
  </div>
);

const yesNoOptions = [
  [1, 'Yes'],
  [0, 'No'],
];

export default EnvironmentSettings;

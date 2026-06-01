with open('src/components/AdminDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

optuna_handler = '''
  const handleOptuna = async () => {
    try {
      await triggerOptunaTuning();
      setModelStatus('training');
    } catch (err) {
      console.error(err);
    }
  };
'''
if 'const handleOptuna' not in content:
    idx = content.find('const handleRetrain = ')
    if idx != -1:
        content = content[:idx] + optuna_handler + '\n  ' + content[idx:]

old_buttons = '''            <button className="cn-button cn-button-secondary" onClick={handleRetrain} disabled={modelStatus === 'training'} type="button">
              <RefreshCw size={16} className={modelStatus === 'training' ? "animate-spin" : ""} />
              Retrain Model
            </button>'''

new_buttons = '''            <button className="cn-button cn-button-secondary" onClick={handleOptuna} disabled={modelStatus === 'training'} type="button">
              <Activity size={16} className={modelStatus === 'training' ? "animate-pulse" : ""} />
              Run Optuna Tuning
            </button>
            <button className="cn-button cn-button-secondary" onClick={handleRetrain} disabled={modelStatus === 'training'} type="button">
              <RefreshCw size={16} className={modelStatus === 'training' ? "animate-spin" : ""} />
              Retrain Model
            </button>'''
if 'Run Optuna Tuning' not in content:
    content = content.replace(old_buttons, new_buttons)

if 'triggerOptunaTuning' not in content:
    content = content.replace('getModelStatus', 'getModelStatus,\n  triggerOptunaTuning')

if 'Activity' not in content:
    content = content.replace('BarChart3,', 'Activity,\n  BarChart3,')

with open('src/components/AdminDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('AdminDashboard patched.')

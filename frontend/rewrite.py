import re

with open('src/App.jsx', 'r') as f:
    content = f.read()

# We'll completely replace the BookingInterface, MenuRow, etc.
# We'll keep the imports, App, AppHeader (not used but keep it just in case), Toast, HistoryModal

new_booking_interface = """
const BookingInterface = ({ onLogout, username }) => {
  const [quantities, setQuantities] = useState({});
  const [currentMode, setCurrentMode] = useState('dine');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  
  // Slide to pay
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [payStatus, setPayStatus] = useState('idle'); // idle, processing, confirmed
  const startX = React.useRef(0);
  const containerRef = React.useRef(null);
  
  const hourOfDay = new Date().getHours();
  const isLive = hourOfDay >= 8 && hourOfDay < 18;
  const now = new Date();

  const selectedItems = useMemo(
    () => Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ item: MENU_ITEMS.find((entry) => entry.id === id), qty }))
      .filter(({ item }) => Boolean(item)),
    [quantities],
  );

  const totalItems = selectedItems.reduce((sum, { qty }) => sum + qty, 0);
  const subtotal = selectedItems.reduce((sum, { item, qty }) => sum + priceValue(item.price) * qty, 0);
  const discount = currentMode === 'book' ? Math.round(subtotal * 0.05) : 0;
  const finalTotal = subtotal - discount;
  
  const groupedMenu = categories.map((category) => ({
    category,
    items: MENU_ITEMS.filter((item) => item.category === category),
  }));

  const showToast = (message) => {
    setToast({ show: true, message });
    window.setTimeout(() => setToast({ show: false, message: '' }), 2600);
  };

  const fetchHistory = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingHistory(true);
      const data = await getHistory(username);
      setHistoryData(Array.isArray(data) ? data : []);
      if (!silent) setShowHistory(true);
    } catch {
      if (!silent) showToast('Could not load order history.');
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }, [username]);

  useEffect(() => {
    if (!showHistory) return undefined;
    const interval = window.setInterval(() => fetchHistory(true), 5000);
    return () => window.clearInterval(interval);
  }, [fetchHistory, showHistory]);

  const handleQuantity = (id, delta) => {
    setQuantities((prev) => {
      const next = Math.max(0, Math.min(10, (prev[id] || 0) + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const handleSubmit = async () => {
    if (totalItems === 0) return;
    setLoading(true);
    const timestamp = Math.floor(new Date().getTime() / 1000);
    
    // For book mode, we set to tomorrow 13:00 for simplicity as per old behavior
    const prebookDate = currentMode === 'book' ? new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0] : '';
    const time = '13:00';
    const dayOfWeek = currentMode === 'book' ? new Date(prebookDate).getDay() : new Date().getDay();

    const ordersArray = selectedItems.map(({ item, qty }) => ({
      username,
      item: item.id,
      time_slot: currentMode === 'book' ? 13 : new Date().getHours(),
      quantity: qty,
      is_prebooking: currentMode === 'book' ? 1 : 0,
      takeaway: 0,
      day_of_week: dayOfWeek,
      prebooking_date: prebookDate,
      prebooking_time: currentMode === 'book' ? time : '',
      notes: '',
      status: 'pending',
      timestamp,
    }));

    try {
      await submitOrder(ordersArray);
      setQuantities({});
      setPayStatus('confirmed');
      if (window.navigator.vibrate) window.navigator.vibrate(100);
      window.setTimeout(() => {
         setPayStatus('idle');
         setSlideX(0);
         showToast('Order booked successfully.');
      }, 2000);
    } catch {
      setPayStatus('idle');
      setSlideX(0);
      showToast('Order failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Slider Logic
  const handleTouchStart = (e) => {
    if (payStatus !== 'idle') return;
    setIsDragging(true);
    startX.current = (e.touches ? e.touches[0].clientX : e.clientX) - slideX;
  };
  
  const handleTouchMove = (e) => {
    if (!isDragging || payStatus !== 'idle') return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const containerWidth = containerRef.current ? containerRef.current.offsetWidth : 200;
    const maxSlide = containerWidth - 44 - 12; // handle width and padding
    const newX = Math.max(0, Math.min(x - startX.current, maxSlide));
    setSlideX(newX);
  };
  
  const handleTouchEnd = () => {
    if (!isDragging || payStatus !== 'idle') return;
    setIsDragging(false);
    const containerWidth = containerRef.current ? containerRef.current.offsetWidth : 200;
    const maxSlide = containerWidth - 44 - 12;
    
    if (slideX >= maxSlide * 0.85) {
      setSlideX(maxSlide);
      setPayStatus('processing');
      handleSubmit();
    } else {
      setSlideX(0);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => handleTouchEnd();
    const handleMouseMove = (e) => handleTouchMove(e);
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
    }
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [isDragging, slideX]);

  const toggleMethod = (mode) => {
    if (mode === currentMode) return;
    setCurrentMode(mode);
    if (mode === 'book') {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#855300', '#4edea3', '#f59e0b', '#6cf8bb', '#e91e63'],
          zIndex: 9999,
        });
    }
  };

  return (
    <div className="app-bg font-body-lg text-on-surface overflow-hidden min-h-dvh relative touch-none">
      <Toast toast={toast} />
      
      {/* Animated Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
           className={\g-orb transition-all duration-700 \\}
           id="orb-primary" 
           style={{ transform: currentMode === 'book' ? 'translate(-60px, -60px) scale(0.8)' : 'translate(0, 0) scale(1.25)' }}>
        </div>
        <div 
           className="bg-orb bg-accent-sage/40 transition-all duration-700" 
           id="orb-secondary" 
           style={{ transform: currentMode === 'book' ? 'translate(-100px, -100px) scale(1.8)' : 'translate(160px, 160px) scale(0.5)' }}>
        </div>
      </div>

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b border-surface-container-high h-16 flex justify-between items-center px-margin-mobile">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center shadow-sm">
                <Utensils className="text-on-primary-container" size={20} />
            </div>
            <h1 className="font-display-lg text-sm tracking-[0.05em] text-on-surface uppercase truncate max-w-[120px] sm:max-w-none">BiteSpeed Co.</h1>
        </div>
        <div className="flex items-center gap-2">
            <button className="bg-surface-container-low px-4 py-2 rounded-full font-label-bold text-[13px] text-primary border border-outline-variant/30 flex items-center gap-2 active:scale-95 transition-transform order-indicator-pulse">
                <span className={\w-1.5 h-1.5 rounded-full \\}></span>
                {money(finalTotal)}
            </button>
        </div>
      </header>

      {/* Persistent Controls */}
      <div className="persistent-controls px-margin-mobile pt-4">
        <div className="glass-card p-4 shadow-sm border-white/50">
            <h2 className="text-[10px] font-label-bold uppercase tracking-widest text-on-surface-variant/60 mb-3">Select Experience</h2>
            <div className="method-toggle" onClick={() => toggleMethod(currentMode === 'dine' ? 'book' : 'dine')}>
                <div 
                   className={\method-slider \\} 
                   style={{ left: currentMode === 'book' ? 'calc(50% + 2px)' : '4px' }}>
                </div>
                <button className={\elative z-10 flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 active:scale-95 \\}>
                    <Utensils size={16} />
                    Dine-In
                </button>
                <button className={\elative z-10 flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 active:scale-95 \\}>
                    <Calendar size={16} />
                    Prebook
                </button>
            </div>
        </div>
      </div>

      <main className="relative h-screen w-full overflow-hidden" id="swipe-container">
          
        {/* Unified Menu View (Dine-In) */}
        <section className={\ultra-pro-slide pt-[190px] pb-44 overflow-y-auto no-scrollbar \\}>
            <div className="px-margin-mobile space-y-6">
                
                <div className="stagger-item revealed" style={{transitionDelay: '100ms'}}>
                    <div className="flex justify-between items-end mb-4">
                        <h3 className="font-display-lg text-2xl text-on-surface">Menu</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-on-surface-variant/70 uppercase">12 Items Total</span>
                    </div>
                    
                    <div className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-surface-container-high chip-nav no-scrollbar -mx-margin-mobile mb-4">
                        {categories.map((category) => (
                           <a key={category} className="flex-shrink-0 px-4 py-3 text-[12px] font-bold uppercase tracking-wider active:scale-95 transition-all relative group" 
                              style={{ color: \ar(--color-\)\ }}
                              href={\#cat-\\}
                           >
                               {category}
                               <div className={\bsolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-80 ultra-pro-header gradient-\\}></div>
                           </a>
                        ))}
                    </div>
                </div>

                {groupedMenu.map(({ category, items }) => (
                    <React.Fragment key={category}>
                        <div className="category-line" id={\cat-\\}>
                            <span className={\ultra-pro-header gradient-\ font-black uppercase tracking-[0.15em] text-white px-5 rounded-full text-sm py-2\}>
                                {category}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {items.map((item) => (
                                <MenuRow 
                                  key={item.id} 
                                  item={item} 
                                  quantity={quantities[item.id] || 0} 
                                  onQuantity={handleQuantity} 
                                />
                            ))}
                        </div>
                    </React.Fragment>
                ))}
                
            </div>
        </section>

        {/* Pre-book View Overlay */}
        <section className={\ultra-pro-slide pt-[190px] pb-24 overflow-y-auto no-scrollbar pointer-events-none \\}>
            <div className="px-margin-mobile h-full flex flex-col justify-center items-center text-center space-y-4">
                <div className={\w-24 h-24 rounded-full bg-accent-sage/20 flex items-center justify-center mb-4 transition-transform duration-400 delay-150 transform \\}>
                    <Calendar className="text-accent-sage" size={48} />
                </div>
                <h3 className={\ont-display-lg text-2xl text-on-surface transition-all duration-300 \\}>
                    Schedule Meal
                </h3>
                <p className={\	ext-sm text-on-surface-variant max-w-[240px] transition-all duration-300 \\} style={{transitionDelay: '50ms'}}>
                    Pre-book your meal for tomorrow and enjoy a flat 5% discount!
                </p>
                <button 
                   className={\mt-4 px-8 py-3 bg-accent-sage text-on-secondary rounded-full font-bold shadow-lg shadow-accent-sage/20 pointer-events-auto active:scale-95 transition-all duration-300 \\} 
                   style={{transitionDelay: '100ms'}}
                   onClick={() => toggleMethod('dine')}
                >
                    Add Items First
                </button>
            </div>
        </section>
      </main>

      {/* Bottom Action Layer (Slide to Pay) */}
      <div className={\ixed bottom-24 left-margin-mobile right-margin-mobile z-[60] transition-all duration-400 transform \\}>
          <div ref={containerRef} className="relative w-full h-14 bg-white/90 backdrop-blur rounded-full border border-outline-variant/20 flex items-center p-1.5 overflow-hidden shadow-2xl">
              <div 
                  className="absolute inset-y-1.5 left-1.5 right-1.5 rounded-full bg-accent-sage/10 pointer-events-none" 
                  style={{ opacity: 0.1 + (slideX / (containerRef.current?.offsetWidth || 200)) * 0.4 }}
              ></div>
              <div 
                  className={\elative z-20 w-11 h-11 rounded-full flex items-center justify-center text-on-secondary \\}
                  style={{ transform: \	ranslate3d(\px, 0, 0)\, transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)' }}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={handleTouchStart}
              >
                  {payStatus === 'confirmed' ? <Check size={24} /> : <span className="material-symbols-outlined">chevron_right</span>}
              </div>
              <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-100"
                  style={{ opacity: payStatus === 'idle' ? 1 - (slideX / (containerRef.current?.offsetWidth || 200)) : 1 }}
              >
                  {payStatus === 'idle' && (
                     <span className="text-[11px] font-label-bold text-on-surface-variant uppercase tracking-[0.15em]">Slide to Pay • {money(finalTotal)}</span>
                  )}
                  {payStatus === 'processing' && (
                     <span className="text-accent-sage font-bold tracking-normal animate-pulse text-sm">Processing...</span>
                  )}
                  {payStatus === 'confirmed' && (
                     <span className="text-accent-sage font-bold tracking-normal text-sm">Order Confirmed!</span>
                  )}
              </div>
          </div>
      </div>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-t border-surface-container-high h-20 flex justify-around items-center px-margin-mobile">
        <a className="flex flex-col items-center justify-center text-primary rounded-xl p-2 active:scale-90 transition-transform" href="#" onClick={(e) => {e.preventDefault(); toggleMethod('dine');}}>
            <Utensils size={24} />
            <span className="text-[10px] font-bold mt-1">Menu</span>
        </a>
        <a className="flex flex-col items-center justify-center text-on-surface-variant/40 p-2 active:scale-90 transition-transform" href="#" onClick={(e) => {e.preventDefault(); fetchHistory();}}>
            <Receipt size={24} />
            <span className="text-[10px] font-bold mt-1">Orders</span>
        </a>
        <a className="flex flex-col items-center justify-center text-on-surface-variant/40 p-2 active:scale-90 transition-transform" href="#" onClick={(e) => {e.preventDefault(); onLogout();}}>
            <LogOut size={24} />
            <span className="text-[10px] font-bold mt-1">Logout</span>
        </a>
      </nav>

      {showHistory && (
        <HistoryModal historyData={historyData} loadingHistory={loadingHistory} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
};

const MenuRow = ({ item, quantity, onQuantity }) => {
  const [pop, setPop] = useState(false);
  
  const handleInc = () => {
     onQuantity(item.id, 1);
     setPop(false);
     setTimeout(() => setPop(true), 10);
  };
  const handleDec = () => {
     onQuantity(item.id, -1);
     setPop(false);
     setTimeout(() => setPop(true), 10);
  };

  return (
    <div className="glass-card p-3 flex items-center gap-4 group active:scale-[0.98] stagger-item revealed">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-container-high shadow-inner shrink-0">
            <img alt={item.name} className="w-full h-full object-cover" src={item.img} />
        </div>
        <div className="flex-grow min-w-0">
            <h4 className="font-title-md text-sm truncate">{item.name}</h4>
            <p className="text-primary font-bold text-sm">{item.price}</p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/20 shrink-0">
            <button className="w-7 h-7 flex items-center justify-center rounded-md text-on-surface-variant active:scale-75 transition-all" onClick={handleDec} type="button">
                <Minus size={16} />
            </button>
            <span className={\w-6 text-center text-xs font-bold count-display \\}>{quantity}</span>
            <button className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-sage text-on-secondary shadow-sm active:scale-75 transition-all" onClick={handleInc} type="button">
                <Plus size={16} />
            </button>
        </div>
    </div>
  );
};
"""

# Extract first part
match = re.search(r'const BookingInterface = .*', content)
if match:
    # also remove AppHeader, SummaryLine, InstructionCard
    start_idx = match.start()
    
    # Let's just find the export default App; and keep it
    new_content = content[:start_idx] + new_booking_interface + "\n\n"
    
    # Append HistoryModal which was at the end
    history_match = re.search(r'const HistoryModal = .*?^\);$', content, re.MULTILINE | re.DOTALL)
    if history_match:
        new_content += history_match.group(0) + "\n\nexport default App;\n"
    else:
        print("Could not find HistoryModal")
        
    with open('src/App.jsx', 'w') as f:
        f.write(new_content)
    print("Successfully rewrote App.jsx")
else:
    print("Could not find BookingInterface")


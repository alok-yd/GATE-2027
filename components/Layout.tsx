import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { focusSessionController } from './focus/controllers/FocusSessionController';

const iitBombayLogo = new URL('../iit-bombay-logo-circle.png', import.meta.url).href;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const [daysTo2027, setDaysTo2027] = useState<number>(0);
  const [focusState, setFocusState] = useState(() => focusSessionController.getState());

  useEffect(() => {
    return focusSessionController.subscribe(setFocusState);
  }, []);

  const formatFocusDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    const calculateDays = () => {
      const now = new Date();
      // GATE 2027: Estimated Feb 7, 2027 (First weekend)
      const gate2027 = new Date('2027-02-07T00:00:00');
      const diff2027 = gate2027.getTime() - now.getTime();

      setDaysTo2027(Math.max(0, Math.ceil(diff2027 / (1000 * 60 * 60 * 24))));
    };

    calculateDays();
    const timer = setInterval(calculateDays, 86400000); // Update daily
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
    )},
    { name: 'Roadmap', path: '/roadmap', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7"></path></svg>
    )},
    { name: 'Lecture Tracker', path: '/tracker', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
    )},
    { name: 'PYQ Execution Tracker', path: '/pyq-tracker', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17h6M9 13h6m-6-4h6M5 5h14v14H5V5z"></path></svg>
    )},
    { name: 'AI Focus', path: '/focus', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
    )},
    { name: 'Health Tracker', path: '/health', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z"></path></svg>
    )},
    { name: 'Speaking Coach', path: '/speaking', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a4 4 0 004-4V7a4 4 0 10-8 0v7a4 4 0 004 4z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 11v3a7 7 0 0014 0v-3M12 21v-3"></path></svg>
    )},
    { name: 'Test Performance', path: '/tests', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19V5m5 14V9m5 10v-7m5 7V7M3 19h18"></path></svg>
    )},
    { name: 'Revision', path: '/revision', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l3 3L22 4M5 5h9M5 12h4M5 19h14"></path></svg>
    )},
    { name: 'AI Mentor', path: '/mentor', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z"></path></svg>
    )},
    { name: 'AI Analytics', path: '/analytics', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19V5m-5 14v-8m10 8v-5m5 5H3"></path></svg>
    )},
    { name: 'AI Native', path: '/ai-native', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
    )},
    { name: 'Strategy & Tips', path: '/strategy', icon: (
      <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
    )},
  ];

  const getTitle = () => {
    const item = navItems.find(i => i.path === location.pathname);
    return item ? item.name : 'GATE 2027';
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-100 border-r border-slate-800">
        <div className="p-6 flex items-center justify-center border-b border-slate-800">
          <div className="bg-amber-500 text-slate-900 p-2 rounded-lg mr-3">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
          </div>
          <span className="text-xl font-bold tracking-tight">GATE <span className="text-amber-500">2027</span></span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-amber-500 text-slate-900 font-semibold shadow-md'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.icon}
              <span className="truncate">{item.name}</span>
              {item.path === '/focus' && focusState.isActive && (
                <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1.5 shadow-xs ${
                  focusState.gate.isOpen
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : focusState.gate.pauseReason === 'DEVICE_IN_USE'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : focusState.gate.pauseReason === 'STUDENT_AWAY'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    focusState.gate.isOpen
                      ? 'bg-emerald-400 animate-pulse'
                      : focusState.gate.pauseReason === 'DEVICE_IN_USE'
                      ? 'bg-rose-400'
                      : focusState.gate.pauseReason === 'STUDENT_AWAY'
                      ? 'bg-amber-400'
                      : 'bg-zinc-400'
                  }`} />
                  <span>{formatFocusDuration(focusState.timer.verifiedFocusMs)}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        
        {/* Target Institute & Countdown Section */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/50 space-y-3.5">
          {/* IIT Bombay Circular Emblem */}
          <div className="flex justify-center">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-amber-500/30 bg-black shadow-xl shadow-black/60 p-1 flex items-center justify-center group transition-all duration-300 hover:border-amber-500/70 hover:scale-105 hover:shadow-amber-500/20">
              <img
                src={iitBombayLogo}
                alt="IIT Bombay"
                className="w-full h-full object-cover rounded-full transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">GATE 2027 (Goal)</span>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded">{daysTo2027} Days</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '15%' }}></div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800">
          <div className="bg-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Target</p>
            <div className="flex items-center text-amber-500 font-bold text-lg">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              AIR 1
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-slate-900 text-white shadow-md z-10">
          <div className="flex items-center font-bold text-lg">
             <span className="text-amber-500 mr-2">GATE</span> 2027
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-slate-300 hover:text-white focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="absolute top-16 left-0 w-full bg-slate-800 z-50 shadow-xl md:hidden">
            <nav className="flex flex-col p-4 space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 rounded-lg ${
                      isActive
                        ? 'bg-amber-500 text-slate-900 font-bold'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`
                  }
                >
                  {item.icon}
                  <span className="truncate">{item.name}</span>
                  {item.path === '/focus' && focusState.isActive && (
                    <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1.5 shadow-xs ${
                      focusState.gate.isOpen
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : focusState.gate.pauseReason === 'DEVICE_IN_USE'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : focusState.gate.pauseReason === 'STUDENT_AWAY'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        focusState.gate.isOpen
                          ? 'bg-emerald-400 animate-pulse'
                          : focusState.gate.pauseReason === 'DEVICE_IN_USE'
                          ? 'bg-rose-400'
                          : focusState.gate.pauseReason === 'STUDENT_AWAY'
                          ? 'bg-amber-400'
                          : 'bg-zinc-400'
                      }`} />
                      <span>{formatFocusDuration(focusState.timer.verifiedFocusMs)}</span>
                    </span>
                  )}
                </NavLink>
              ))}
              <div className="px-4 py-3 border-t border-slate-700 mt-2 space-y-3">
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-amber-500/30 bg-black p-1 flex items-center justify-center shadow-lg">
                    <img
                      src={iitBombayLogo}
                      alt="IIT Bombay"
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-sm text-slate-200">
                  <span>GATE 2027</span>
                  <span className="font-bold text-indigo-400">{daysTo2027} Days</span>
                </div>
              </div>
            </nav>
          </div>
        )}

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800">{getTitle()}</h1>
                    <p className="text-slate-500 mt-1 text-sm md:text-base">Track your journey to success.</p>
                </div>
                {children}
            </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;

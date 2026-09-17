import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import VoiceAssistant from './VoiceAssistant';
import AIInsightWidget from './AIInsightWidget';
import PredictedAIRWidget from './PredictedAIRWidget';
import { getCurrentPhaseSummary, getStoredSubjects } from '../services/DataExtractor';

const mahaMrityunjayImage = new URL('../MAHA MRITYUNJAY MANTRA.jpg', import.meta.url).href;
const mahadevShivShaktiImage = new URL('../Mahadev-shiv shakti.jpg', import.meta.url).href;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const subjects = getStoredSubjects();
  const totalLecturesPhase2 = subjects.reduce((acc, curr) => acc + curr.totalLectures, 0);

  const completedLecturesPhase2 = subjects.reduce((acc, curr) => acc + curr.completedLectures, 0);
  const completionRate = Math.round((completedLecturesPhase2 / totalLecturesPhase2) * 100) || 0;
  const currentPhase = getCurrentPhaseSummary();

  const chartData = [
    { name: 'Completed', value: completedLecturesPhase2 },
    { name: 'Remaining', value: totalLecturesPhase2 - completedLecturesPhase2 },
  ];
  const COLORS = ['#10b981', '#e2e8f0'];

  // Streak Logic
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const loadStreak = () => {
      const stored = localStorage.getItem('gate_streak_data');
      if (stored) {
        const data = JSON.parse(stored);
        const lastLog = new Date(data.lastLogDate);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Normalize time
        lastLog.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        yesterday.setHours(0,0,0,0);

        // If last log was today or yesterday, streak is alive.
        if (lastLog.getTime() === today.getTime() || lastLog.getTime() === yesterday.getTime()) {
           setStreak(data.currentStreak);
        } else {
           // Streak broken visually (though data persists until next write update)
           setStreak(0);
        }
      }
    };
    
    loadStreak();
    // Listen to custom storage event for immediate updates within same session/tab
    window.addEventListener('storage', loadStreak);
    return () => window.removeEventListener('storage', loadStreak);
  }, []);

  return (
    <div className="space-y-6 relative">
      {/* Voice Assistant */}
      <VoiceAssistant />
      <img
        src={mahadevShivShaktiImage}
        alt="Mahadev Shiv Shakti"
        className="absolute -top-24 right-0 z-20 h-12 w-12 rounded-lg object-cover shadow-md md:h-14 md:w-14"
      />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
        <img
          src={mahaMrityunjayImage}
          alt="Maha Mrityunjay Mantra"
          className="absolute bottom-4 right-4 z-20 h-14 w-14 rounded-full border-4 border-white bg-white object-cover shadow-lg md:h-16 md:w-16"
        />
        <div className="relative z-10">
          <div className="flex justify-between items-start">
             <div>
                <h2 className="text-3xl font-bold mb-4">Hello, Mr. ALOK 👋</h2>
                <p className="text-blue-100 max-w-xl text-lg mb-8">
                  You are targeting <span className="font-bold text-amber-300">AIR 1</span> in GATE 2027.
                  Syllabus is complete. Now the mission is PYQs, revision cycles, mock analysis, and error-log repair.
                </p>
             </div>
             {/* Streak Badge (Hero) */}
             <div className="hidden md:flex flex-col items-center bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
                <span className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-1">Current Streak</span>
                <div className="flex items-center gap-2">
                   <span className="text-4xl">🔥</span>
                   <span className="text-4xl font-bold text-white">{streak}</span>
                </div>
                <span className="text-xs text-blue-200 mt-1">Days</span>
             </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <NavLink to="/tracker" className="bg-white text-indigo-600 px-6 py-2 rounded-lg font-semibold hover:bg-blue-50 transition shadow-lg">
              Log Progress
            </NavLink>
            <NavLink to="/roadmap" className="bg-indigo-500 bg-opacity-40 border border-indigo-400 text-white px-6 py-2 rounded-lg font-semibold hover:bg-opacity-50 transition">
              View Roadmap
            </NavLink>
          </div>
        </div>
        {/* Decorative Circles */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-amber-400 opacity-20 rounded-full blur-2xl"></div>
      </div>

      <AIInsightWidget />

      <PredictedAIRWidget onOpen={() => navigate('/analytics')} />

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Phase 2 Progress Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <h3 className="text-slate-500 text-sm font-medium uppercase tracking-wide">Syllabus Completion</h3>
            <div className="flex items-end mt-2">
              <span className="text-4xl font-bold text-slate-800">{completionRate}%</span>
              <span className="text-slate-400 text-sm mb-1 ml-2">syllabus locked</span>
            </div>
            {completionRate >= 100 && (
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-1">
                ✓ Lectures Complete • Mastery Phase
              </p>
            )}
          </div>
          <div className="h-32 mt-4 relative">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={55}
                    paddingAngle={0}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
             </ResponsiveContainer>
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-sm font-bold text-slate-400">AIR</span>
             </div>
          </div>
        </div>

        {/* Current Phase Indicator */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div>
                 <h3 className="text-slate-500 text-sm font-medium uppercase tracking-wide">Current Phase</h3>
                 <h2 className="text-2xl font-bold text-slate-800 mt-2">{currentPhase.title}</h2>
                 <p className="text-slate-500 text-sm mt-1">{currentPhase.period}</p>
            </div>
            <div className="mt-6 space-y-3">
                {currentPhase.checkpoints.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{label}</span>
                      <span className="text-green-600 font-bold">{value}</span>
                  </div>
                ))}
            </div>
        </div>

        {/* Daily Motivation/Goal */}
        <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-100 flex flex-col justify-between">
             <div>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-amber-800 text-sm font-bold uppercase tracking-wide flex items-center">
                        <span className="mr-2">🏆</span> Daily Goal
                    </h3>
                    {/* Mobile Streak Badge (Visible only on small screens) */}
                    <div className="md:hidden flex items-center bg-white/60 px-2 py-1 rounded text-xs font-bold text-amber-600 border border-amber-200">
                        <span className="mr-1">🔥</span> {streak} Day Streak
                    </div>
                </div>
                <p className="text-slate-700 italic">"You are not preparing for GATE now. You are preparing to win GATE."</p>
             </div>
             
             {/* Consistency Check */}
             <div className="mt-4 pt-4 border-t border-amber-200/50">
                 <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-bold text-amber-800 uppercase">Consistency Meter</span>
                     <span className="text-xs font-bold text-amber-600">{streak} Days</span>
                 </div>
                 <div className="w-full bg-amber-200 rounded-full h-2">
                     {/* Cap width visual at 100% (e.g., 30 days) */}
                     <div 
                        className="bg-amber-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, (streak / 30) * 100)}%` }}
                     ></div>
                 </div>
                 <p className="text-[10px] text-amber-700 mt-1 text-right">Target: 30 Day Streak</p>
             </div>
        </div>

      </div>

      {/* Upcoming Tasks Preview */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Upcoming Milestones</h3>
              <NavLink to="/roadmap" className="text-indigo-600 text-sm hover:underline">View Full Timeline</NavLink>
          </div>
          <div className="p-0">
             <div className="grid grid-cols-1 divide-y divide-slate-100">
                 <div className="p-4 flex items-center hover:bg-slate-50 transition">
                     <div className="w-16 text-center text-xs font-bold text-slate-400">MAY '26</div>
                     <div className="flex-1 ml-4">
                         <h4 className="font-semibold text-slate-800">Deep Revision Sprint</h4>
                         <p className="text-xs text-slate-500">Full revision cycle, PYQs 2015-2020, and weekly sectional tests.</p>
                     </div>
                     <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Current</span>
                 </div>
                 <div className="p-4 flex items-center hover:bg-slate-50 transition">
                     <div className="w-16 text-center text-xs font-bold text-slate-400">AUG '26</div>
                     <div className="flex-1 ml-4">
                         <h4 className="font-semibold text-slate-800">PYQ Mastery + Full Mocks</h4>
                         <p className="text-xs text-slate-500">All PYQs 2010-2024, two full mocks per week, equal-time analysis.</p>
                     </div>
                     <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Mastery</span>
                 </div>
                 <div className="p-4 flex items-center hover:bg-slate-50 transition">
                     <div className="w-16 text-center text-xs font-bold text-slate-400">NOV '26</div>
                     <div className="flex-1 ml-4">
                         <h4 className="font-semibold text-slate-800">Full Mock Blitz</h4>
                         <p className="text-xs text-slate-500">Three full mocks per week, 70+/100 target by January.</p>
                     </div>
                     <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Goal</span>
                 </div>
             </div>
          </div>
      </div>
    </div>
  );
};

export default Dashboard;

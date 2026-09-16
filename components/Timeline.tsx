import React, { useState } from 'react';
import { ROADMAP_PHASE_1, ROADMAP_PHASE_2_WEEKLY, ROADMAP_PHASE_3_MASTERY } from '../data';
import { WeeklyPlanItem } from '../types';

const Timeline: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'phase1' | 'phase2' | 'phase3'>('phase2');

  const getActiveData = (): WeeklyPlanItem[] => {
    switch (activeTab) {
      case 'phase1': return ROADMAP_PHASE_1;
      case 'phase2': return ROADMAP_PHASE_2_WEEKLY;
      case 'phase3': return ROADMAP_PHASE_3_MASTERY;
      default: return ROADMAP_PHASE_2_WEEKLY;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('phase1')}
          className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap transition-colors ${
            activeTab === 'phase1' 
              ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Setup: AIR-1 Baseline
        </button>
        <button
          onClick={() => setActiveTab('phase2')}
          className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap transition-colors ${
            activeTab === 'phase2' 
              ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Phase 1-2: Revision + PYQ Mastery
        </button>
        <button
          onClick={() => setActiveTab('phase3')}
          className={`flex-1 py-4 px-6 text-sm font-medium whitespace-nowrap transition-colors ${
            activeTab === 'phase3' 
              ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Phase 3: Mock Blitz + Final Sharpening
        </button>
      </div>

      {/* Timeline Content */}
      <div className="p-6 md:p-10">
        <div className="relative border-l-2 border-indigo-100 space-y-12">
          {getActiveData().map((item, index) => (
            <div key={item.id} className="relative pl-8 md:pl-12">
              {/* Timeline Dot */}
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-sm"></div>
              
              <div className="flex flex-col md:flex-row md:justify-between md:items-start group">
                <div className="flex-1">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 mb-2">
                    {item.period}
                  </span>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h3>
                  <p className="text-slate-600 mb-4 font-medium italic border-l-4 border-amber-400 pl-3">
                    Goal: {item.goal}
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Primary Focus</h4>
                        <div className="flex flex-wrap gap-2">
                            {item.focus.map((f, i) => (
                                <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-700 font-medium shadow-sm">
                                    {f}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Action Items</h4>
                        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                            {item.tasks.map((task, i) => (
                                <li key={i}>{task}</li>
                            ))}
                        </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Timeline;

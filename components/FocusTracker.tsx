import React, { useState } from 'react';
import { FocusDashboard } from './focus/components/FocusDashboard';
import { FocusAnalyticsView } from './focus/components/FocusAnalyticsView';
import { FocusAICoachView } from './focus/components/FocusAICoachView';
import { FocusSettingsView } from './focus/components/FocusSettingsView';
import { FocusErrorBoundary } from './focus/components/FocusErrorBoundary';

type Tab = 'dashboard' | 'analytics' | 'coach' | 'settings';

const FocusTracker: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <FocusErrorBoundary>
      <div className="space-y-6">
        {/* Navigation Tabs Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <span>AI Focus Timer</span>
              <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Real-Time Verified
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Local computer vision tracking verified study time, paper solving, and smartphone discipline.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'dashboard'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Focus
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'analytics'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Focus Analytics
            </button>
            <button
              onClick={() => setActiveTab('coach')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'coach'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              AI Coach
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg transition ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Tab Content Rendering */}
        <div>
          {activeTab === 'dashboard' && <FocusDashboard />}
          {activeTab === 'analytics' && <FocusAnalyticsView />}
          {activeTab === 'coach' && <FocusAICoachView />}
          {activeTab === 'settings' && <FocusSettingsView />}
        </div>
      </div>
    </FocusErrorBoundary>
  );
};

export default FocusTracker;

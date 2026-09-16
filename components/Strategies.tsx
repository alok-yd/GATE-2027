import React from 'react';
import { STRATEGIES } from '../data';

const Strategies: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
         <h2 className="text-3xl font-bold text-slate-800 mb-4">Success Formula for AIR 1</h2>
         <p className="text-slate-600">
             Strategic insights derived from your AIR-1 master planner.
             Review these weekly to stay aligned with PYQs, revision, mocks, and error repair.
         </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {STRATEGIES.map((strategy, index) => (
            <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-300">
                    {strategy.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{strategy.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                    {strategy.description}
                </p>
            </div>
        ))}
      </div>

      {/* Detailed Advice Section */}
      <div className="bg-slate-900 rounded-2xl p-8 text-slate-100 mt-12 shadow-2xl">
          <div className="flex items-center mb-6">
             <div className="p-3 bg-amber-500 rounded-lg text-slate-900 mr-4">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
             </div>
             <h3 className="text-2xl font-bold">Key Habits for Mastery Phase (2026-2027)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                  <div className="flex">
                      <span className="text-amber-500 font-bold mr-3 mt-1">1.</span>
                      <p><strong>Error Notebook:</strong> Revise every 2 weeks. Every mistake in a mock is a learning opportunity.</p>
                  </div>
                  <div className="flex">
                      <span className="text-amber-500 font-bold mr-3 mt-1">2.</span>
                      <p><strong>Mock Analysis:</strong> Spend 2-3 hours analyzing each mock test. Identify if it was a conceptual gap or a silly mistake.</p>
                  </div>
              </div>
              <div className="space-y-4">
                  <div className="flex">
                      <span className="text-amber-500 font-bold mr-3 mt-1">3.</span>
                      <p><strong>Time Management:</strong> Practice finishing 65 questions in 2.5 hours to have buffer time in the real exam.</p>
                  </div>
                  <div className="flex">
                      <span className="text-amber-500 font-bold mr-3 mt-1">4.</span>
                      <p><strong>Balance:</strong> If mock scores dip, don't panic. Revise the weak area immediately.</p>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Strategies;

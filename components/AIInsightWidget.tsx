import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { aiHub } from '../services/AIServiceHub';
import { applyAlertToToday, getStudentProfile } from '../services/DataExtractor';
import { AIRPrediction, Alert, StudentProfile } from '../types';

const severityClass: Record<Alert['severity'], string> = {
  CRITICAL: 'border-red-500 bg-red-50 text-red-800',
  HIGH: 'border-orange-500 bg-orange-50 text-orange-800',
  MEDIUM: 'border-amber-500 bg-amber-50 text-amber-800',
  LOW: 'border-blue-500 bg-blue-50 text-blue-800',
};

const AIInsightWidget: React.FC = () => {
  const [profile, setProfile] = useState<StudentProfile>(() => getStudentProfile());
  const [prediction, setPrediction] = useState<AIRPrediction | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedAlert, setAppliedAlert] = useState<string | null>(null);

  const loadInsights = async () => {
    const nextProfile = getStudentProfile();
    setProfile(nextProfile);
    setLoading(true);

    const [nextPrediction, nextAlerts] = await Promise.all([
      aiHub.predictAIR(nextProfile),
      aiHub.generateAlert(nextProfile),
    ]);

    setPrediction(nextPrediction);
    setAlerts(nextAlerts.slice(0, 3));
    setLoading(false);
  };

  useEffect(() => {
    loadInsights();
    const onStorage = () => loadInsights();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleApplyAlert = (alert: Alert, index: number) => {
    const subject = profile.subjects.find((item) => alert.message.includes(item.name))?.name || '';
    applyAlertToToday(subject, alert.actionRequired);
    setAppliedAlert(`${alert.type}_${index}`);
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-bold text-slate-800">AI Mentor Snapshot</h3>
          <p className="text-sm text-slate-500">
            AI Gateway routed, with local intelligence fallback when the provider is unavailable
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadInsights}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Refresh
          </button>
          <NavLink
            to="/analytics"
            className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
          >
            Open Analytics
          </NavLink>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:divide-x divide-slate-100">
        <div className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Predicted AIR</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-indigo-600">
              {loading || !prediction ? '...' : prediction.mostLikely.range}
            </span>
            <span className="text-sm text-slate-500 mb-1">
              {prediction ? `${prediction.mostLikely.confidence}% confidence` : ''}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-3">
            {prediction?.keyFactors[0] || 'Reading your current progress pattern.'}
          </p>
        </div>

        <div className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Smart Alerts</p>
            <NavLink to="/mentor" className="text-xs font-semibold text-indigo-600 hover:underline">
              Ask mentor
            </NavLink>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="h-20 rounded-lg bg-slate-100 animate-pulse" />
            ) : (
              alerts.map((alert, index) => {
                const appliedKey = `${alert.type}_${index}`;
                return (
                  <div
                    key={appliedKey}
                    className={`border-l-4 rounded-lg p-3 ${severityClass[alert.severity]}`}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-sm">{alert.message}</p>
                        <p className="text-xs mt-1 opacity-90">{alert.actionRequired}</p>
                      </div>
                      <button
                        onClick={() => handleApplyAlert(alert, index)}
                        className="shrink-0 px-3 py-1.5 rounded-md bg-white/80 text-xs font-bold text-slate-700 hover:bg-white transition"
                      >
                        {appliedAlert === appliedKey ? 'Applied' : 'Use Today'}
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold mt-2 opacity-80">{alert.estimatedImpact}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AIInsightWidget;

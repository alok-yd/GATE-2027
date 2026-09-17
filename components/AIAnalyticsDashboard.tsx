import React, { useEffect, useMemo, useState } from 'react';
import { aiHub } from '../services/AIServiceHub';
import {
  applyAlertToToday,
  deleteMockResult,
  getStudentProfile,
  saveMockResult,
} from '../services/DataExtractor';
import { AIRPrediction, Alert, MockResult, StudentProfile, StudyPlan, WeakArea } from '../types';
import { AIRReadinessCenter } from './air/AIRReadinessCenter';
import {
  analyzePreparationState,
  predictAIR as calculateAIRPrediction,
} from '../services/airPrediction';

const todayKey = () => new Date().toISOString().split('T')[0];

const severityClass: Record<Alert['severity'], string> = {
  CRITICAL: 'border-red-500 bg-red-50 text-red-900',
  HIGH: 'border-orange-500 bg-orange-50 text-orange-900',
  MEDIUM: 'border-amber-500 bg-amber-50 text-amber-900',
  LOW: 'border-blue-500 bg-blue-50 text-blue-900',
};

const strengthClass = (accuracy: number) => {
  if (accuracy >= 80) return 'bg-emerald-500';
  if (accuracy >= 65) return 'bg-amber-500';
  return 'bg-red-500';
};

const formatMockAverage = (mocks: MockResult[]) => {
  if (mocks.length === 0) return 'No mocks';
  const average =
    mocks.reduce((sum, mock) => sum + (mock.score / Math.max(mock.totalMarks, 1)) * 100, 0) /
    mocks.length;
  return `${Math.round(average)}%`;
};

const AIAnalyticsDashboard: React.FC = () => {
  const [profile, setProfile] = useState<StudentProfile>(() => getStudentProfile());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [weakAreas, setWeakAreas] = useState<WeakArea[]>([]);
  const [prediction, setPrediction] = useState<AIRPrediction | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'alerts' | 'weakness' | 'mocks'>('alerts');
  const [mockForm, setMockForm] = useState({
    date: todayKey(),
    score: '',
    totalMarks: '100',
    notes: '',
  });

  const readiness = useMemo(() => {
    const subjectAverage =
      profile.subjects.reduce((sum, subject) => sum + subject.accuracy, 0) /
      Math.max(profile.subjects.length, 1);
    const mockAverage =
      profile.mocks.length === 0
        ? subjectAverage - 6
        : profile.mocks.reduce(
            (sum, mock) => sum + (mock.score / Math.max(mock.totalMarks, 1)) * 100,
            0
          ) / profile.mocks.length;

    const allLecturesComplete = profile.subjects.length > 0 && profile.subjects.every((s) => s.completionRate >= 100);
    const weeklyTargetScore = allLecturesComplete ? 100 : profile.studyMetrics.weeklyTargetCompletion;

    return Math.round(
      subjectAverage * 0.4 +
        mockAverage * 0.35 +
        profile.studyMetrics.consistencyScore * 0.15 +
        weeklyTargetScore * 0.1
    );
  }, [profile]);

  const loadAnalytics = async () => {
    const nextProfile = getStudentProfile();
    setProfile(nextProfile);
    setLoading(true);

    const [nextAlerts, nextWeakAreas, nextPrediction, nextPlan] = await Promise.all([
      aiHub.generateAlert(nextProfile),
      aiHub.identifyWeakAreas(nextProfile),
      aiHub.predictAIR(nextProfile),
      aiHub.createPersonalizedPlan(nextProfile),
    ]);

    setAlerts(nextAlerts);
    setWeakAreas(nextWeakAreas);
    setPrediction(nextPrediction);
    setPlan(nextPlan);
    setLoading(false);
  };

  useEffect(() => {
    loadAnalytics();
    const onStorage = () => loadAnalytics();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleMockSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const score = Number(mockForm.score);
    const totalMarks = Number(mockForm.totalMarks) || 100;
    if (!Number.isFinite(score) || score < 0 || score > totalMarks) return;

    saveMockResult({
      date: mockForm.date,
      score,
      totalMarks,
      notes: mockForm.notes.trim(),
    });

    setMockForm({
      date: todayKey(),
      score: '',
      totalMarks: '100',
      notes: '',
    });
    loadAnalytics();
  };

  const applyAlert = (alert: Alert) => {
    const matchedSubject = profile.subjects.find((subject) => alert.message.includes(subject.name));
    applyAlertToToday(matchedSubject?.name || '', alert.actionRequired);
  };

  const firstPlanWeek = plan?.weeks?.[0];
  const displayedReadiness = prediction?.readinessScore ?? readiness;

  const preparationAnalysis = useMemo(() => {
    return analyzePreparationState(profile);
  }, [profile]);

  const airPrediction = useMemo(() => {
    return calculateAIRPrediction(preparationAnalysis);
  }, [preparationAnalysis]);

  return (
    <div className="space-y-6 pb-10">
      <AIRReadinessCenter
        analysis={preparationAnalysis}
        prediction={airPrediction}
        onRefresh={loadAnalytics}
      />

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-200">
          {[
            ['alerts', `Smart Alerts (${alerts.length})`],
            ['weakness', 'Weakness ROI'],
            ['mocks', 'Mock Scores'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as 'alerts' | 'weakness' | 'mocks')}
              className={`px-5 py-4 text-sm font-bold whitespace-nowrap border-b-2 transition ${
                activeTab === id
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 md:p-6">
          {loading ? (
            <div className="h-48 rounded-xl bg-slate-100 animate-pulse" />
          ) : (
            <>
              {activeTab === 'alerts' && (
                <div className="space-y-4">
                  {alerts.map((alert, index) => (
                    <article
                      key={`${alert.type}_${index}`}
                      className={`border-l-4 rounded-xl p-4 ${severityClass[alert.severity]}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-1 rounded bg-white/70">
                              {alert.severity}
                            </span>
                            <h3 className="font-bold">{alert.message}</h3>
                          </div>
                          <p className="text-sm mt-2">{alert.actionRequired}</p>
                          <p className="text-xs font-semibold mt-2 opacity-80">
                            Impact: {alert.estimatedImpact}
                          </p>
                        </div>
                        <button
                          onClick={() => applyAlert(alert)}
                          className="px-3 py-2 rounded-lg bg-white/80 text-slate-800 text-sm font-bold hover:bg-white transition"
                        >
                          Set As Today Goal
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {activeTab === 'weakness' && (
                <div className="space-y-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-3 pr-4">Priority</th>
                          <th className="py-3 pr-4">Subject</th>
                          <th className="py-3 pr-4">Focus Topic</th>
                          <th className="py-3 pr-4">Current</th>
                          <th className="py-3 pr-4">ROI</th>
                          <th className="py-3 pr-4">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weakAreas.map((area) => (
                          <tr key={`${area.subject}_${area.topic}`} className="border-b border-slate-100">
                            <td className="py-4 pr-4">
                              <span
                                className={`px-2 py-1 rounded text-xs font-bold ${
                                  area.priority === 'HIGH'
                                    ? 'bg-red-100 text-red-700'
                                    : area.priority === 'MEDIUM'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {area.priority}
                              </span>
                            </td>
                            <td className="py-4 pr-4 font-semibold text-slate-800">{area.subject}</td>
                            <td className="py-4 pr-4 text-slate-600">{area.topic}</td>
                            <td className="py-4 pr-4">{area.currentScore}%</td>
                            <td className="py-4 pr-4 font-bold text-indigo-600">{area.roi}</td>
                            <td className="py-4 pr-4">{area.timeRequired}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {firstPlanWeek && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400">Adaptive week plan</p>
                          <h3 className="font-bold text-slate-800 mt-1">{firstPlanWeek.milestone}</h3>
                        </div>
                        <span className="text-sm text-slate-500">
                          Focus: {firstPlanWeek.focus.join(', ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                        {firstPlanWeek.daily.slice(0, 4).map((day) => (
                          <div key={day.day} className="bg-white rounded-lg border border-slate-200 p-3">
                            <p className="font-bold text-slate-800">{day.day}</p>
                            <p className="text-xs text-slate-500 mt-1">{day.target}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'mocks' && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  <form onSubmit={handleMockSubmit} className="lg:col-span-2 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={mockForm.date}
                        onChange={(event) => setMockForm({ ...mockForm, date: event.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Score</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={mockForm.score}
                          onChange={(event) => setMockForm({ ...mockForm, score: event.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Total</label>
                        <input
                          type="number"
                          min="1"
                          value={mockForm.totalMarks}
                          onChange={(event) =>
                            setMockForm({ ...mockForm, totalMarks: event.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Notes</label>
                      <textarea
                        value={mockForm.notes}
                        onChange={(event) => setMockForm({ ...mockForm, notes: event.target.value })}
                        rows={4}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        placeholder="Weak sections, silly mistakes, time pressure..."
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-3 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition"
                    >
                      Save Mock Score
                    </button>
                  </form>

                  <div className="lg:col-span-3 space-y-3">
                    {profile.mocks.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
                        Log your first mock score to tighten AIR prediction confidence.
                      </div>
                    ) : (
                      profile.mocks
                        .slice()
                        .reverse()
                        .map((mock) => (
                          <div
                            key={mock.id}
                            className="rounded-xl border border-slate-200 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div>
                              <p className="font-bold text-slate-800">
                                {mock.score}/{mock.totalMarks}
                                <span className="text-sm font-medium text-slate-500 ml-2">
                                  {Math.round((mock.score / mock.totalMarks) * 100)}%
                                </span>
                              </p>
                              <p className="text-sm text-slate-500">{mock.date}</p>
                              {mock.notes && <p className="text-sm text-slate-600 mt-1">{mock.notes}</p>}
                            </div>
                            <button
                              onClick={() => {
                                deleteMockResult(mock.id);
                                loadAnalytics();
                              }}
                              className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800">Subject Intelligence</h3>
          <span className="text-xs font-bold uppercase text-slate-400">{profile.currentPhase}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.subjects.map((subject) => (
            <div key={subject.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800">{subject.name}</p>
                  <p className="text-xs text-slate-500">
                    {subject.topicsCompleted}/{subject.topicsTotal} lectures
                  </p>
                </div>
                <span className="font-bold text-slate-800">{subject.accuracy}%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${strengthClass(subject.accuracy)}`}
                  style={{ width: `${subject.accuracy}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Weak: {subject.weakTopics.length ? subject.weakTopics.join(', ') : 'None flagged'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AIAnalyticsDashboard;

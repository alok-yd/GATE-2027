import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  deleteMockResult,
  getMockResults,
  saveMockResult,
  getTestSeriesList,
  saveTestSeries,
  deleteTestSeries,
  DEFAULT_TEST_SERIES,
} from '../services/DataExtractor';
import { MockResult, TestSeriesItem } from '../types';
import {
  ExternalLink,
  Copy,
  Check,
  Award,
  Plus,
  TrendingUp,
  Target,
  CheckCircle2,
  Calendar,
  Clock,
  Sparkles,
  Layers,
  BookOpen,
  Trash2,
  BarChart3,
} from 'lucide-react';

type Filter = 'ALL' | 'ACE_OTS' | 'FULL' | 'SECTIONAL' | 'TOPIC';

const todayKey = () => new Date().toISOString().split('T')[0];

const percent = (score: number, total: number) => Math.round((score / Math.max(total, 1)) * 1000) / 10;

const getScore = (mock: MockResult) => percent(mock.score, mock.totalMarks);

const ACE_OTS_URL = 'https://ots.aceenggacademy.com/#/user-app/userSubscriptions/userSubView/8021f68f-c9c1-4a19-b235-84b144bf78da/userSubscriptions';

const TestPerformance: React.FC = () => {
  const [tests, setTests] = useState<MockResult[]>(() => getMockResults());
  const [testSeries, setTestSeries] = useState<TestSeriesItem[]>(() => getTestSeriesList());
  const [filter, setFilter] = useState<Filter>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAddSeriesOpen, setIsAddSeriesOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Form State for Logging New Mock
  const [form, setForm] = useState({
    date: todayKey(),
    testType: 'FULL' as MockResult['testType'],
    seriesId: 'ace-ots-gate-2027',
    seriesName: 'ACE Online Test Series (OTS)',
    sheet: 'ACE OTS - ',
    score: '',
    totalMarks: '100',
    rightQuestions: '',
    wrongQuestions: '',
    durationMinutes: '180',
    notes: '',
  });

  // Form State for Adding Custom Test Series
  const [newSeries, setNewSeries] = useState({
    name: '',
    provider: '',
    url: '',
    description: '',
    targetExam: 'GATE 2027',
  });

  const refresh = () => {
    setTests(getMockResults());
    setTestSeries(getTestSeriesList());
  };

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const isAceTest = (test: MockResult) =>
    test.seriesId === 'ace-ots-gate-2027' ||
    test.seriesName?.toLowerCase().includes('ace') ||
    test.sheet?.toLowerCase().includes('ace');

  const filteredTests = useMemo(() => {
    if (filter === 'ALL') return tests;
    if (filter === 'ACE_OTS') return tests.filter(isAceTest);
    return tests.filter((test) => test.testType === filter);
  }, [filter, tests]);

  // Overall metrics
  const latest = tests[tests.length - 1];
  const peak = tests.length ? Math.max(...tests.map((test) => getScore(test))) : 0;
  const averageGrowth =
    tests.length >= 2 ? getScore(tests[tests.length - 1]) - getScore(tests[0]) : tests.length ? getScore(tests[0]) : 0;

  // ACE OTS specific metrics
  const aceTests = useMemo(() => tests.filter(isAceTest), [tests]);
  const aceTestsCount = aceTests.length;
  const acePeakScore = aceTestsCount ? Math.max(...aceTests.map((t) => getScore(t))) : 0;
  const aceAvgScore = aceTestsCount
    ? Math.round((aceTests.reduce((acc, t) => acc + getScore(t), 0) / aceTestsCount) * 10) / 10
    : 0;

  const chartData = filteredTests.map((test, index) => ({
    index: index + 1,
    date: test.date,
    marks: Number(getScore(test).toFixed(2)),
    accuracy:
      test.rightQuestions && test.wrongQuestions !== undefined
        ? Math.round((test.rightQuestions / Math.max(test.rightQuestions + test.wrongQuestions, 1)) * 100)
        : Math.round(getScore(test)),
    label: test.sheet || test.testType || 'Test',
    isAce: isAceTest(test),
  }));

  const handleTypeChange = (testType: MockResult['testType']) => {
    setForm((prev) => ({
      ...prev,
      testType,
      totalMarks: testType === 'FULL' ? '100' : testType === 'SECTIONAL' ? '30' : '20',
      durationMinutes: testType === 'FULL' ? '180' : testType === 'SECTIONAL' ? '60' : '40',
    }));
  };

  const handleSeriesSelect = (selectedId: string) => {
    const selected = testSeries.find((s) => s.id === selectedId);
    if (selected) {
      setForm((prev) => ({
        ...prev,
        seriesId: selected.id,
        seriesName: selected.name,
        sheet: prev.sheet.startsWith('ACE OTS') && selected.id !== 'ace-ots-gate-2027' ? '' : prev.sheet,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        seriesId: undefined,
        seriesName: 'Self Practice / Other',
      }));
    }
  };

  const handleAddSeriesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeries.name.trim() || !newSeries.url.trim()) return;

    saveTestSeries({
      id: `series_${Date.now()}`,
      name: newSeries.name.trim(),
      provider: newSeries.provider.trim() || 'Custom Provider',
      url: newSeries.url.trim(),
      description: newSeries.description.trim() || 'Custom test series portal',
      targetExam: newSeries.targetExam.trim() || 'GATE 2027',
      status: 'active',
      badge: 'Added by Student',
      enrolledDate: todayKey(),
    });

    setNewSeries({
      name: '',
      provider: '',
      url: '',
      description: '',
      targetExam: 'GATE 2027',
    });
    setIsAddSeriesOpen(false);
    refresh();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const score = Number(form.score);
    const totalMarks = Number(form.totalMarks);
    if (!Number.isFinite(score) || !Number.isFinite(totalMarks) || totalMarks <= 0 || score < 0 || score > totalMarks) {
      return;
    }

    saveMockResult({
      date: form.date,
      testType: form.testType,
      sheet: form.sheet.trim() || `${form.testType} Test`,
      seriesId: form.seriesId,
      seriesName: form.seriesName,
      testLink: form.seriesId === 'ace-ots-gate-2027' ? ACE_OTS_URL : undefined,
      score,
      totalMarks,
      rightQuestions: form.rightQuestions ? Number(form.rightQuestions) : undefined,
      wrongQuestions: form.wrongQuestions ? Number(form.wrongQuestions) : undefined,
      durationMinutes: Number(form.durationMinutes) || undefined,
      notes: form.notes.trim(),
    });

    setForm({
      date: todayKey(),
      testType: 'FULL',
      seriesId: 'ace-ots-gate-2027',
      seriesName: 'ACE Online Test Series (OTS)',
      sheet: 'ACE OTS - ',
      score: '',
      totalMarks: '100',
      rightQuestions: '',
      wrongQuestions: '',
      durationMinutes: '180',
      notes: '',
    });
    setIsFormOpen(false);
    refresh();
  };

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* Header Section */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              Test Series & Analytics
            </span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Test Mastery</h2>
          <p className="text-slate-500 mt-1">
            Tracking quantitative test series growth towards <span className="font-bold text-indigo-600">AIR 1</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={ACE_OTS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm"
          >
            <span>Launch ACE OTS</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => setIsFormOpen((value) => !value)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold tracking-wide hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isFormOpen ? 'Hide Manual Entry Form' : '+ Manually Log New Test'}</span>
          </button>
        </div>
      </section>

      {/* Manual Test Entry Form */}
      {isFormOpen && (
        <section className="bg-white rounded-2xl border-2 border-indigo-500/40 shadow-xl p-6 space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Manual Test Entry — Record Your Test Performance</span>
              </h3>
              <p className="text-xs text-slate-500">
                Manually record test results from ACE OTS, full mocks, subject tests, or previous year papers
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Test Series / Platform Selector */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Platform / Test Source</label>
              <select
                value={form.seriesId || 'other'}
                onChange={(e) => handleSeriesSelect(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium bg-white"
              >
                {testSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="self-practice">Self Practice Mock</option>
                <option value="pyq-paper">Previous Year GATE Paper (PYQ)</option>
                <option value="made-easy">Made Easy Test Series</option>
                <option value="other">Other / Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Test Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Test Category</label>
              <select
                value={form.testType}
                onChange={(event) => handleTypeChange(event.target.value as MockResult['testType'])}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium bg-white"
              >
                <option value="FULL">Full Mock Exam (100 Marks • 180 min)</option>
                <option value="SECTIONAL">Sectional / Subject Test (30 Marks • 60 min)</option>
                <option value="TOPIC">Topic / Chapter Test (20 Marks • 40 min)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Sheet / Subject / Test Title *</label>
              <input
                value={form.sheet}
                onChange={(event) => setForm({ ...form, sheet: event.target.value })}
                placeholder="e.g. Algorithms Topic 1, Full Mock 2024..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
                required
              />
            </div>

            {/* Quick Prefill Chips */}
            <div className="md:col-span-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 text-[11px] font-semibold">Quick Suggestions:</span>
              {['ACE OTS - Full Mock 1', 'ACE OTS - Algorithms', 'ACE OTS - Operating Systems', 'ACE OTS - TOC', 'ACE OTS - DBMS', 'Engineering Math', 'Discrete Math', 'Digital Logic'].map((chip) => (
                <button
                  type="button"
                  key={chip}
                  onClick={() => setForm((prev) => ({ ...prev, sheet: chip }))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 text-[11px] font-medium transition cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Obtained Score *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.score}
                  onChange={(event) => setForm({ ...form, score: event.target.value })}
                  placeholder="e.g. 68.5"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Total Marks</label>
                <input
                  type="number"
                  min="1"
                  value={form.totalMarks}
                  onChange={(event) => setForm({ ...form, totalMarks: event.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Correct Qs</label>
                <input
                  type="number"
                  min="0"
                  value={form.rightQuestions}
                  onChange={(event) => setForm({ ...form, rightQuestions: event.target.value })}
                  placeholder="35"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Wrong Qs</label>
                <input
                  type="number"
                  min="0"
                  value={form.wrongQuestions}
                  onChange={(event) => setForm({ ...form, wrongQuestions: event.target.value })}
                  placeholder="8"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Time (mins)</label>
                <input
                  type="number"
                  min="1"
                  value={form.durationMinutes}
                  onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Performance & Error Analysis Notes</label>
              <input
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Identified conceptual gaps in Dijkstra, silly calculation mistake in Q14..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
              />
            </div>

            <div className="md:col-span-4 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
              >
                Save Manual Test Record
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Enrolled Test Series Portals Showcase */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">My Enrolled Test Series</h3>
          </div>
          <button
            onClick={() => setIsAddSeriesOpen((v) => !v)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddSeriesOpen ? 'Cancel' : 'Add Another Test Series'}</span>
          </button>
        </div>

        {/* Form to Add New Test Series */}
        {isAddSeriesOpen && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-800">Add Test Series Portal</h4>
            <form onSubmit={handleAddSeriesSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Test Series Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Made Easy All India Mock"
                  value={newSeries.name}
                  onChange={(e) => setNewSeries({ ...newSeries, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Institute / Provider</label>
                <input
                  type="text"
                  placeholder="e.g. Made Easy, GateForum"
                  value={newSeries.provider}
                  onChange={(e) => setNewSeries({ ...newSeries, provider: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Portal URL / Link *</label>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={newSeries.url}
                  onChange={(e) => setNewSeries({ ...newSeries, url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSeriesOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm"
                >
                  Save Test Series
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Primary ACE Test Series Card */}
        {testSeries.map((series) => {
          const isAce = series.id === 'ace-ots-gate-2027';
          return (
            <div
              key={series.id}
              className={`rounded-2xl border p-6 transition-all relative overflow-hidden shadow-lg ${
                isAce
                  ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-white border-indigo-500/30'
                  : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              {isAce && (
                <>
                  <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                </>
              )}

              <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-2.5 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide ${
                        isAce
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      ACTIVE SUBSCRIPTION
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                        isAce
                          ? 'bg-indigo-500/20 border border-indigo-400/30 text-indigo-300'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {series.targetExam}
                    </span>
                    {series.badge && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isAce ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {series.badge}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                        isAce
                          ? 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-white'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <h4
                        className={`text-xl sm:text-2xl font-black tracking-tight ${
                          isAce ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {series.name}
                      </h4>
                      <p className={`text-xs font-semibold ${isAce ? 'text-indigo-300' : 'text-indigo-600'}`}>
                        {series.provider}
                      </p>
                    </div>
                  </div>

                  <p
                    className={`text-xs sm:text-sm leading-relaxed ${
                      isAce ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {series.description}
                  </p>

                  {/* Quick stats for this series */}
                  {isAce && (
                    <div className="flex flex-wrap items-center gap-5 text-xs pt-1 font-mono">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Tests Logged: <strong className="text-white text-sm">{aceTestsCount}</strong>
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Target className="w-4 h-4 text-indigo-400" />
                        Avg ACE Score: <strong className="text-white text-sm">{aceAvgScore.toFixed(1)}%</strong>
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        Peak ACE Score: <strong className="text-white text-sm">{acePeakScore.toFixed(1)}%</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Direct Launch & Action Controls */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 w-full sm:w-auto shrink-0">
                  <a
                    href={series.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-center"
                  >
                    <span>Open Test Series Portal</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          seriesId: series.id,
                          seriesName: series.name,
                          sheet: isAce ? 'ACE OTS - ' : `${series.name} - `,
                        }));
                        setIsFormOpen(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        isAce
                          ? 'bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Log Score</span>
                    </button>

                    <button
                      onClick={() => handleCopy(series.url, series.id)}
                      className={`inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                        isAce
                          ? 'bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                      }`}
                      title="Copy subscription URL"
                    >
                      {copiedLink === series.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{copiedLink === series.id ? 'Copied' : 'Copy'}</span>
                    </button>

                    {!isAce && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${series.name}?`)) {
                            deleteTestSeries(series.id);
                            refresh();
                          }
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                        title="Delete series"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Primary Metric Cards */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Latest Score"
          value={latest ? `${getScore(latest).toFixed(1)}%` : '0.0%'}
          detail={latest ? `${latest.score.toFixed(1)} / ${latest.totalMarks} marks` : 'No tests yet'}
          badge="Latest"
        />
        <MetricCard
          title="Peak Score"
          value={`${peak.toFixed(1)}%`}
          detail="All-time highest mock"
          badge="High Score"
        />
        <MetricCard
          title="Avg Growth"
          value={`${averageGrowth >= 0 ? '+' : ''}${averageGrowth.toFixed(1)}%`}
          detail="First to latest test"
          badge="Trajectory"
        />
        <MetricCard
          title="ACE OTS Mocks"
          value={`${aceTestsCount}`}
          detail={`Avg: ${aceAvgScore.toFixed(1)}% • Best: ${acePeakScore.toFixed(1)}%`}
          badge="ACE Portal"
        />
      </section>

      {/* Growth Trajectory Chart */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-wide text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <span>Growth Trajectory</span>
            </h3>
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                { key: 'ALL', label: 'All Tests' },
                { key: 'ACE_OTS', label: `ACE OTS Only (${aceTestsCount})` },
                { key: 'FULL', label: 'Full Mocks (100M)' },
                { key: 'SECTIONAL', label: 'Sectional' },
                { key: 'TOPIC', label: 'Topic Tests' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key as Filter)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    filter === item.key
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold border border-indigo-100">
              GATE AIR 1 Benchmark (90%+)
            </span>
          </div>
        </div>

        <div className="h-[340px] mt-4">
          {chartData.length === 0 ? (
            <div className="h-full rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
              <BarChart3 className="w-8 h-8 text-slate-300" />
              <span>No tests found in this filter category.</span>
              <button
                onClick={() => setIsFormOpen(true)}
                className="mt-1 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                + Log your first test now
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="marksFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value: any) => [`${value}%`, 'Score']}
                  labelFormatter={(label: any) => `Date: ${label}`}
                />
                <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'AIR 1 Cutoff', fill: '#f59e0b', fontSize: 11 }} />
                <Area type="monotone" dataKey="marks" stroke="#4f46e5" strokeWidth={3.5} fill="url(#marksFill)" dot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Comprehensive Test Log Table */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Recorded Test Log</h3>
            <p className="text-xs text-slate-400">Detailed question accuracy and error tracking</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
            {filteredTests.length} Tests Displayed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-slate-50 text-slate-400 uppercase text-xs tracking-wider">
              <tr>
                <th className="text-left px-5 py-3.5">#</th>
                <th className="text-left px-5 py-3.5">Date</th>
                <th className="text-left px-5 py-3.5">Test Platform / Sheet</th>
                <th className="text-left px-5 py-3.5">Obtained Score</th>
                <th className="text-left px-5 py-3.5">Total Marks</th>
                <th className="text-left px-5 py-3.5">Right / Wrong</th>
                <th className="text-left px-5 py-3.5">Time Taken</th>
                <th className="text-left px-5 py-3.5">Notes</th>
                <th className="text-right px-5 py-3.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTests.map((test, index) => {
                const isAce = isAceTest(test);
                const scorePct = getScore(test);
                return (
                  <tr key={test.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4 font-bold text-slate-400 text-xs">{index + 1}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700 text-xs whitespace-nowrap">{test.date}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {isAce && (
                          <a
                            href={ACE_OTS_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px] font-extrabold hover:bg-amber-500/20 transition shrink-0"
                            title="Open ACE OTS Portal"
                          >
                            <span>ACE OTS</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        <span className="font-semibold text-slate-900 text-xs">
                          {test.sheet || test.testType}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {test.testType === 'FULL' ? 'Full Mock' : test.testType === 'SECTIONAL' ? 'Sectional' : 'Topic Test'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-slate-900 text-sm">{test.score.toFixed(2)}</span>
                      <span className="text-xs text-slate-400 ml-1">/ {test.totalMarks}</span>
                      <div
                        className={`text-[11px] font-bold mt-0.5 ${
                          scorePct >= 70 ? 'text-emerald-600' : scorePct >= 50 ? 'text-indigo-600' : 'text-amber-600'
                        }`}
                      >
                        {scorePct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-600 text-xs">{test.totalMarks}</td>
                    <td className="px-5 py-4 text-xs font-mono">
                      <span className="font-bold text-emerald-600">{test.rightQuestions ?? '-'}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="font-bold text-rose-500">{test.wrongQuestions ?? '-'}</span>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-600 text-xs">
                      {test.durationMinutes ? `${test.durationMinutes}m` : '-'}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 max-w-xs truncate" title={test.notes}>
                      {test.notes || '-'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => {
                          if (confirm('Delete this test record?')) {
                            deleteMockResult(test.id);
                            refresh();
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 transition cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredTests.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400 text-sm">
                    No tests recorded in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const MetricCard: React.FC<{ title: string; value: string; detail: string; badge?: string }> = ({
  title,
  value,
  detail,
  badge,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 relative overflow-hidden">
    <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
      <Target className="w-6 h-6" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">{title}</p>
        {badge && (
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
      <p className="text-xs text-slate-500 truncate mt-0.5">{detail}</p>
    </div>
  </div>
);

export default TestPerformance;

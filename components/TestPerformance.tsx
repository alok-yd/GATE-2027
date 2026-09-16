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
import { deleteMockResult, getMockResults, saveMockResult } from '../services/DataExtractor';
import { MockResult } from '../types';

type Filter = 'ALL' | 'FULL' | 'SECTIONAL' | 'TOPIC';

const todayKey = () => new Date().toISOString().split('T')[0];

const percent = (score: number, total: number) => Math.round((score / Math.max(total, 1)) * 1000) / 10;

const getScore = (mock: MockResult) => percent(mock.score, mock.totalMarks);

const TestPerformance: React.FC = () => {
  const [tests, setTests] = useState<MockResult[]>(() => getMockResults());
  const [filter, setFilter] = useState<Filter>('ALL');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayKey(),
    testType: 'FULL' as MockResult['testType'],
    sheet: '',
    score: '',
    totalMarks: '100',
    rightQuestions: '',
    wrongQuestions: '',
    durationMinutes: '180',
    notes: '',
  });

  const refresh = () => setTests(getMockResults());

  const filteredTests = useMemo(() => {
    if (filter === 'ALL') return tests;
    return tests.filter((test) => test.testType === filter);
  }, [filter, tests]);

  const latest = tests[tests.length - 1];
  const peak = tests.length ? Math.max(...tests.map((test) => getScore(test))) : 0;
  const averageGrowth =
    tests.length >= 2 ? getScore(tests[tests.length - 1]) - getScore(tests[0]) : tests.length ? getScore(tests[0]) : 0;

  const chartData = filteredTests.map((test, index) => ({
    index: index + 1,
    date: test.date,
    marks: Number(getScore(test).toFixed(2)),
    accuracy:
      test.rightQuestions && test.wrongQuestions !== undefined
        ? Math.round((test.rightQuestions / Math.max(test.rightQuestions + test.wrongQuestions, 1)) * 100)
        : Math.round(getScore(test)),
    label: test.sheet || test.testType || 'Test',
  }));

  const handleTypeChange = (testType: MockResult['testType']) => {
    setForm({
      ...form,
      testType,
      totalMarks: testType === 'FULL' ? '100' : testType === 'SECTIONAL' ? '30' : '20',
      durationMinutes: testType === 'FULL' ? '180' : testType === 'SECTIONAL' ? '60' : '40',
    });
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
      sheet: '',
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
    <div className="space-y-6 pb-10">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Test Mastery</h2>
          <p className="text-slate-500 mt-1">
            Tracking quantitative growth towards <span className="font-bold text-indigo-600">AIR 1</span>
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen((value) => !value)}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold tracking-wide hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
        >
          <span className="text-xl leading-none">+</span>
          Log New Test
        </button>
      </section>

      {isFormOpen && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Type</label>
              <select
                value={form.testType}
                onChange={(event) => handleTypeChange(event.target.value as MockResult['testType'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="FULL">Full Test</option>
                <option value="SECTIONAL">Sectional</option>
                <option value="TOPIC">Topic Test</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Sheet</label>
              <input
                value={form.sheet}
                onChange={(event) => setForm({ ...form, sheet: event.target.value })}
                placeholder="FULL 2024, TOC, OS..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Score</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.score}
                  onChange={(event) => setForm({ ...form, score: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Total</label>
                <input
                  type="number"
                  min="1"
                  value={form.totalMarks}
                  onChange={(event) => setForm({ ...form, totalMarks: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:col-span-2">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Right QN</label>
                <input
                  type="number"
                  min="0"
                  value={form.rightQuestions}
                  onChange={(event) => setForm({ ...form, rightQuestions: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Wrong QN</label>
                <input
                  type="number"
                  min="0"
                  value={form.wrongQuestions}
                  onChange={(event) => setForm({ ...form, wrongQuestions: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Time</label>
                <input
                  type="number"
                  min="1"
                  value={form.durationMinutes}
                  onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Analysis Notes</label>
              <input
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Concept gap, silly mistakes, time pressure..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <button type="submit" className="px-5 py-2 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800">
                Save Test
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Latest Score" value={latest ? getScore(latest).toFixed(2) : '0.00'} detail="Target: 90+ / 100" />
        <MetricCard title="Peak Score" value={peak.toFixed(2)} detail="Best recorded test" />
        <MetricCard title="Average Growth" value={averageGrowth.toFixed(2)} detail="From first to latest test" />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-bold tracking-[0.18em] text-slate-900">Growth Trajectory</h3>
            <div className="flex gap-2 mt-4">
              {(['ALL', 'FULL', 'SECTIONAL', 'TOPIC'] as Filter[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition ${
                    filter === item
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {item === 'ALL' ? 'All' : item === 'FULL' ? 'Full Tests' : item === 'SECTIONAL' ? 'Sectional' : 'Topic Tests'}
                </button>
              ))}
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">Marks vs Time</span>
        </div>

        <div className="h-[360px] mt-6">
          {chartData.length === 0 ? (
            <div className="h-full rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
              Log your first test to generate the trajectory.
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
                <Tooltip />
                <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="marks" stroke="#4f46e5" strokeWidth={4} fill="url(#marksFill)" dot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Test Log</h3>
          <span className="text-xs font-bold text-slate-400 uppercase">{filteredTests.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-slate-50 text-slate-400 uppercase text-xs tracking-widest">
              <tr>
                <th className="text-left px-5 py-4">S.No</th>
                <th className="text-left px-5 py-4">Date</th>
                <th className="text-left px-5 py-4">Type / Sheet</th>
                <th className="text-left px-5 py-4">Obtain Marks</th>
                <th className="text-left px-5 py-4">Total Marks</th>
                <th className="text-left px-5 py-4">Right QN</th>
                <th className="text-left px-5 py-4">Wrong QN</th>
                <th className="text-left px-5 py-4">Time</th>
                <th className="text-left px-5 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((test, index) => (
                <tr key={test.id} className="border-t border-slate-100">
                  <td className="px-5 py-5 font-bold text-slate-400">{index + 1}</td>
                  <td className="px-5 py-5 font-bold text-slate-800">{test.date}</td>
                  <td className="px-5 py-5">
                    <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">
                      {test.sheet || test.testType}
                    </span>
                  </td>
                  <td className="px-5 py-5 font-bold text-slate-900">
                    {test.score.toFixed(2)} / {test.totalMarks.toFixed(2)}
                    <div className="text-xs text-slate-500 mt-1">{getScore(test).toFixed(1)}%</div>
                  </td>
                  <td className="px-5 py-5 font-bold text-slate-800">{test.totalMarks.toFixed(2)}</td>
                  <td className="px-5 py-5 font-bold text-emerald-600">{test.rightQuestions ?? '-'}</td>
                  <td className="px-5 py-5 font-bold text-rose-500">{test.wrongQuestions ?? '-'}</td>
                  <td className="px-5 py-5 font-bold text-slate-800">{test.durationMinutes || '-'}m</td>
                  <td className="px-5 py-5">
                    <button
                      onClick={() => {
                        deleteMockResult(test.id);
                        refresh();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTests.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400">
                    No tests in this filter yet.
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

const MetricCard: React.FC<{ title: string; value: string; detail: string }> = ({ title, value, detail }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-center gap-5">
    <div className="w-14 h-14 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l6-6 4 4 6-8M14 6h6v6" />
      </svg>
    </div>
    <div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
    </div>
  </div>
);

export default TestPerformance;

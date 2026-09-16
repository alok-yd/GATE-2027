import React, { useMemo, useState } from 'react';
import { INITIAL_SUBJECTS } from '../data';
import { PYQPracticeEntry } from '../types';

const STORAGE_KEY = 'gate_pyq_entries';
const DAY_MS = 24 * 60 * 60 * 1000;

const subjectNames = Array.from(
  new Set([
    ...INITIAL_SUBJECTS.map((subject) =>
      subject.name === 'Engineering Math'
        ? 'Engineering Mathematics'
        : subject.name === 'Computer Org & Arch'
          ? 'COA'
          : subject.name
    ),
    'Discrete Mathematics',
  ])
).sort((a, b) => a.localeCompare(b));

const todayKey = () => new Date().toISOString().split('T')[0];

const safeParseEntries = (): PYQPracticeEntry[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as PYQPracticeEntry[];
    return saved
      .filter((entry) => entry.subject && Number(entry.count) > 0 && entry.date)
      .map((entry) => ({
        ...entry,
        count: Number(entry.count),
        attempted: Number(entry.attempted || 0) > 0 ? Number(entry.attempted) : undefined,
        correct: Number(entry.correct || 0) > 0 ? Number(entry.correct) : undefined,
        createdAt: entry.createdAt || `${entry.date}T00:00:00.000Z`,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
};

const isSameMonth = (date: string, monthKey: string) => date.startsWith(monthKey);

const isWithinLastDays = (date: string, days: number) => {
  const start = new Date(todayKey());
  start.setDate(start.getDate() - (days - 1));
  return date >= start.toISOString().split('T')[0] && date <= todayKey();
};

const isLocked = (entry: PYQPracticeEntry) => {
  const reference = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(reference)) return true;
  return Date.now() - reference > DAY_MS;
};

const getZone = (todayTotal: number) => {
  if (todayTotal >= 60) return { label: 'AIR-1 Zone', badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40' };
  if (todayTotal >= 40) return { label: 'Ranker Zone', badge: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/40' };
  if (todayTotal >= 20) return { label: 'Steady Practice', badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40' };
  if (todayTotal > 0) return { label: 'Warm-Up Zone', badge: 'bg-orange-500/15 text-orange-200 border-orange-400/40' };
  return { label: 'Below Ranker Zone', badge: 'bg-rose-500/15 text-rose-200 border-rose-400/40' };
};

const PYQExecutionTracker: React.FC = () => {
  const [entries, setEntries] = useState<PYQPracticeEntry[]>(() => safeParseEntries());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState({
    subject: subjectNames[0] || '',
    count: '',
    attempted: '',
    correct: '',
    date: todayKey(),
  });

  const persistEntries = (nextEntries: PYQPracticeEntry[]) => {
    const sorted = [...nextEntries].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
    setEntries(sorted);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    window.dispatchEvent(new Event('storage'));
  };

  const stats = useMemo(() => {
    const today = todayKey();
    const month = today.slice(0, 7);
    const todayTotal = entries
      .filter((entry) => entry.date === today)
      .reduce((sum, entry) => sum + entry.count, 0);
    const last7Total = entries
      .filter((entry) => isWithinLastDays(entry.date, 7))
      .reduce((sum, entry) => sum + entry.count, 0);
    const monthTotal = entries
      .filter((entry) => isSameMonth(entry.date, month))
      .reduce((sum, entry) => sum + entry.count, 0);

    return {
      todayTotal,
      last7Total,
      last7Average: Math.round((last7Total / 7) * 10) / 10,
      monthTotal,
      zone: getZone(todayTotal),
    };
  }, [entries]);

  const subjectSummary = useMemo(() => {
    const today = todayKey();
    return subjectNames.map((subject) => {
      const subjectEntries = entries.filter((entry) => entry.subject === subject);
      const todayTotal = subjectEntries
        .filter((entry) => entry.date === today)
        .reduce((sum, entry) => sum + entry.count, 0);
      const last7Total = subjectEntries
        .filter((entry) => isWithinLastDays(entry.date, 7))
        .reduce((sum, entry) => sum + entry.count, 0);
      const total = subjectEntries.reduce((sum, entry) => sum + entry.count, 0);
      const attempted = subjectEntries.reduce((sum, entry) => sum + Number(entry.attempted || 0), 0);
      const correct = subjectEntries.reduce((sum, entry) => sum + Number(entry.correct || 0), 0);
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null;

      return {
        subject,
        todayTotal,
        last7Average: Math.round((last7Total / 7) * 10) / 10,
        total,
        accuracy,
      };
    });
  }, [entries]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const count = Number(form.count);
    const attempted = Number(form.attempted);
    const correct = Number(form.correct);
    if (!form.subject || !Number.isFinite(count) || count <= 0) return;
    if (form.attempted && (!Number.isFinite(attempted) || attempted <= 0)) return;
    if (form.correct && (!Number.isFinite(correct) || correct < 0)) return;
    if (form.attempted && form.correct && correct > attempted) return;

    const nextEntry: PYQPracticeEntry = {
      id: `pyq_${Date.now()}`,
      subject: form.subject,
      count,
      attempted: Number.isFinite(attempted) && attempted > 0 ? attempted : undefined,
      correct: Number.isFinite(correct) && correct >= 0 && form.correct ? correct : undefined,
      date: form.date,
      createdAt: new Date().toISOString(),
    };

    persistEntries([nextEntry, ...entries]);
    setForm({ subject: form.subject, count: '', attempted: '', correct: '', date: todayKey() });
    setIsFormOpen(false);
  };

  const handleDelete = (id: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry || isLocked(entry)) return;
    persistEntries(entries.filter((item) => item.id !== id));
  };

  const countClass = (count: number) => {
    if (count >= 30) return 'text-amber-300';
    if (count >= 20) return 'text-rose-300';
    return 'text-white';
  };

  return (
    <div className="pb-10">
      <section className="rounded-[28px] bg-slate-950 text-white shadow-2xl shadow-slate-300/70 border border-slate-800 p-5 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black tracking-wide">PYQ EXECUTION TRACKER</h2>
            <p className="text-sm text-blue-200 mt-2">
              Output-first logging by subject. Entries older than 24 hours are locked.
            </p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-xs font-black tracking-widest text-white hover:bg-indigo-400 transition shadow-lg shadow-indigo-950/40"
          >
            <span className="text-lg leading-none">+</span>
            ADD PYQ ENTRY
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
          <MetricCard title="Today" value={stats.todayTotal} detail="PYQs solved" />
          <MetricCard title="Last 7 Days" value={stats.last7Total} detail={`${stats.last7Average} avg/day`} />
          <MetricCard title="This Month" value={stats.monthTotal} detail="Monthly solved PYQs" />
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-300">Daily Zone</p>
            <p className="text-lg font-black mt-4">{stats.zone.label}</p>
            <span className={`inline-flex mt-3 rounded-full border px-3 py-1 text-[11px] font-black ${stats.zone.badge}`}>
              {stats.todayTotal} PYQS
            </span>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="grid grid-cols-4 bg-slate-900/70 text-[11px] font-black uppercase tracking-widest text-blue-300">
            <div className="px-4 py-4">Subject</div>
            <div className="px-4 py-4">PYQs Solved</div>
            <div className="px-4 py-4">Date</div>
            <div className="px-4 py-4">Action</div>
          </div>
          {entries.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400">No PYQ entries logged yet.</div>
          ) : (
            entries.map((entry) => {
              const locked = isLocked(entry);
              return (
                <div key={entry.id} className="grid grid-cols-4 border-t border-slate-800 text-sm">
                  <div className="px-4 py-4 font-bold">{entry.subject}</div>
                  <div className={`px-4 py-4 font-black ${countClass(entry.count)}`}>{entry.count}</div>
                  <div className="px-4 py-4">{formatDate(entry.date)}</div>
                  <div className="px-4 py-4">
                    {locked ? (
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Locked</span>
                    ) : (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="text-[11px] font-black uppercase tracking-widest text-rose-300 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h3 className="text-sm font-black uppercase tracking-widest">Subject-Wise Summary</h3>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] font-black uppercase tracking-widest text-blue-300">
                  <th className="py-3 px-3">Subject</th>
                  <th className="py-3 px-3">Today's PYQs</th>
                  <th className="py-3 px-3">Last 7-Day Avg</th>
                  <th className="py-3 px-3">Total PYQs</th>
                  <th className="py-3 px-3">PYQ Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {subjectSummary.map((item) => (
                  <tr key={item.subject} className="border-b border-slate-800/80 last:border-0">
                    <td className="py-3 px-3 font-bold">{item.subject}</td>
                    <td className="py-3 px-3">{item.todayTotal}</td>
                    <td className="py-3 px-3">{item.last7Average}</td>
                    <td className="py-3 px-3">{item.total}</td>
                    <td className="py-3 px-3">{item.accuracy == null ? 'Not logged' : `${item.accuracy}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <h3 className="text-lg font-black">Add PYQ Entry</h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-900"
              >
                X
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-blue-300 mb-2">Subject</label>
                <select
                  value={form.subject}
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
                >
                  {subjectNames.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-blue-300 mb-2">PYQs Solved</label>
                <input
                  type="number"
                  min="1"
                  value={form.count}
                  onChange={(event) => setForm({ ...form, count: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-blue-300 mb-2">Attempted</label>
                  <input
                    type="number"
                    min="1"
                    value={form.attempted}
                    onChange={(event) => setForm({ ...form, attempted: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-blue-300 mb-2">Correct</label>
                  <input
                    type="number"
                    min="0"
                    value={form.correct}
                    onChange={(event) => setForm({ ...form, correct: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-blue-300 mb-2">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-black text-white hover:bg-indigo-400"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ title: string; value: number; detail: string }> = ({ title, value, detail }) => (
  <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
    <p className="text-[11px] font-black uppercase tracking-widest text-blue-300">{title}</p>
    <p className="text-3xl font-black mt-3">{value}</p>
    <p className="text-xs text-blue-200 mt-1">{detail}</p>
  </div>
);

export default PYQExecutionTracker;

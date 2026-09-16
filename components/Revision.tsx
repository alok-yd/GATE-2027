import React, { useEffect, useMemo, useState } from 'react';
import { INITIAL_SUBJECTS } from '../data';

interface RevisionTask {
  id: string;
  label: string;
  detail: string;
  target: string;
}

const REVISION_TASKS: RevisionTask[] = [
  { id: 'cycle-1', label: 'Cycle 1: Full Revision', detail: 'All GATE CS subjects from short notes.', target: 'Finish by 31 July 2026' },
  { id: 'pyq-2015-2020', label: 'PYQs 2015-2020', detail: 'Solve with each subject in the Deep Revision Sprint.', target: 'One subject per week' },
  { id: 'error-log', label: 'Error Log Setup', detail: 'Every wrong answer gets reason, concept gap, and revisit date.', target: 'Daily' },
  { id: 'cycle-2', label: 'Cycle 2: Weak Chapters', detail: 'Only error log and weak chapters. Skip strong topics.', target: 'Aug-Oct 2026' },
  { id: 'pyq-2010-2024', label: 'All PYQs 2010-2024', detail: 'Tier 1 first, then Tier 2, then depth practice.', target: '90%+ accuracy' },
  { id: 'cycle-3', label: 'Cycle 3: Formula Sheets', detail: 'Concise notes, formulas, traps, and wrong PYQs only.', target: 'Nov-Jan 2027' },
];

const subjectOrder = [
  ['General Aptitude', '15 marks', 'P1 - Maximum', '30 min daily, quant + verbal'],
  ['Engineering Mathematics', '13 marks', 'P1 - Maximum', 'Linear Algebra, Calculus, Probability, Graph Theory'],
  ['Algorithms + Data Structures', '12 marks', 'P1 - Maximum', 'Sorting, DP, Graphs, Trees, Hashing'],
  ['Operating Systems', '8 marks', 'P2 - High', 'Process, Memory, File systems, Synchronization'],
  ['Computer Networks', '8 marks', 'P2 - High', 'OSI, TCP/IP, Routing, DNS, HTTP'],
  ['Theory of Computation', '7 marks', 'P2 - High', 'DFA, NFA, CFG, Turing Machines, Decidability'],
  ['DBMS', '6 marks', 'P2 - High', 'Normalization, SQL, Transactions, Indexing, ER'],
  ['Computer Organization', '6 marks', 'P3 - Medium', 'Pipelining, Cache, Memory hierarchy, ALU'],
  ['Compiler Design', '4 marks', 'P3 - Medium', 'Lexing, Parsing, SDT, Code generation'],
  ['Digital Logic', '4 marks', 'P3 - Medium', 'Boolean algebra, circuits, K-maps'],
  ['C Programming', '4-5 marks', 'P4 - Medium', 'Pointers, arrays, strings, storage classes'],
];

const pyqTiers = [
  ['Tier 1', '2024-2021', 'Highest priority. Solve first and revisit twice.'],
  ['Tier 2', '2020-2017', 'Solve once. Revisit wrong answers after 2 weeks.'],
  ['Tier 3', '2016 and earlier', 'Depth practice for rare patterns if time permits.'],
];

const weeklyTemplate = [
  ['Monday', 'Algo + DS Revision', 'Engineering Math PYQs'],
  ['Tuesday', 'OS + CN Revision', 'Aptitude Practice'],
  ['Wednesday', 'TOC + CD Revision', 'DBMS PYQs'],
  ['Thursday', 'Error Log Review', 'Weak Topic Fix'],
  ['Friday', 'COA + DL Revision', 'Aptitude PYQs'],
  ['Saturday', 'Full Mock or Sectional', 'Mock Analysis'],
  ['Sunday', 'Full Mock or Light Review', 'Protected Rest'],
];

const readDone = () => {
  try {
    return JSON.parse(localStorage.getItem('gate_revision_done') || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

const Revision: React.FC = () => {
  const [done, setDone] = useState<Record<string, boolean>>(() => readDone());

  useEffect(() => {
    localStorage.setItem('gate_revision_done', JSON.stringify(done));
  }, [done]);

  const completed = useMemo(() => Object.values(done).filter(Boolean).length, [done]);
  const progress = Math.round((completed / REVISION_TASKS.length) * 100);
  const allSubjectsComplete = INITIAL_SUBJECTS.every((subject) => subject.completedLectures >= subject.totalLectures);

  return (
    <div className="space-y-6 pb-10">
      <section className="bg-slate-900 rounded-xl p-6 text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">AIR-1 Revision Control</p>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mt-3">
          <div>
            <h2 className="text-3xl font-bold">Revision, PYQs, Error Log</h2>
            <p className="text-slate-300 mt-2 max-w-2xl">
              Syllabus is complete. This section turns the PDF plan into execution: full revision, PYQ mastery,
              wrong-question repair, and final formula-sheet sharpening.
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-4 min-w-[220px]">
            <p className="text-xs font-bold uppercase text-slate-300">Revision Progress</p>
            <p className="text-3xl font-bold mt-1">{progress}%</p>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-3">
              <div className="h-full bg-amber-400" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard title="Syllabus Status" value={allSubjectsComplete ? 'Complete' : 'Review'} detail="All subjects are in revision mode" />
        <StatusCard title="AIR Target" value="AIR 1" detail="Target score: 90+ peak readiness" />
        <StatusCard title="Mock System" value="108" detail="2/week in Phase 2, 3/week in Phase 3" />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-slate-900">Revision Execution Checklist</h3>
          <span className="text-xs font-bold uppercase text-slate-400">{completed}/{REVISION_TASKS.length} complete</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {REVISION_TASKS.map((task) => (
            <button
              key={task.id}
              onClick={() => setDone((prev) => ({ ...prev, [task.id]: !prev[task.id] }))}
              className={`text-left rounded-xl border p-4 transition ${
                done[task.id]
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 w-5 h-5 rounded border flex items-center justify-center text-xs font-bold ${
                    done[task.id] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent'
                  }`}
                >
                  OK
                </span>
                <div>
                  <p className="font-bold text-slate-900">{task.label}</p>
                  <p className="text-sm text-slate-500 mt-1">{task.detail}</p>
                  <p className="text-xs font-bold text-indigo-600 mt-2">{task.target}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">Subject Priority Order</h3>
            <p className="text-sm text-slate-500 mt-1">Follow this order in Phase 1. Block 1 goes to the highest-priority weak subject.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-slate-400 uppercase text-xs">
                <tr>
                  <th className="text-left px-4 py-3">Subject</th>
                  <th className="text-left px-4 py-3">Marks</th>
                  <th className="text-left px-4 py-3">Priority</th>
                  <th className="text-left px-4 py-3">Focus</th>
                </tr>
              </thead>
              <tbody>
                {subjectOrder.map(([subject, marks, priority, focus]) => (
                  <tr key={subject} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-900">{subject}</td>
                    <td className="px-4 py-3 text-slate-600">{marks}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">{priority}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-900">PYQ Priority Tiers</h3>
            <div className="space-y-3 mt-4">
              {pyqTiers.map(([tier, years, rule]) => (
                <div key={tier} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-900">{tier}</p>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 rounded-full px-3 py-1">{years}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">{rule}</p>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-slate-700 mt-4">
              Golden rule: never mark a PYQ done until you can solve it without looking at the solution.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-900">3-Step Mock Cycle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {[
                ['Give', '3-hour strict exam conditions. No phone, no breaks.'],
                ['Analyze', 'Bucket every wrong answer into concept, silly, time, or not studied.'],
                ['Fix', 'Repair Type-A errors before the next mock. Re-solve wrong PYQs.'],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="font-bold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-500 mt-2">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="font-bold text-slate-900">Weekly Schedule Template</h3>
        <p className="text-sm text-slate-500 mt-1">
          Use this from Phase 2 onward. In Phase 1, replace weekend full mocks with sectional tests.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mt-5">
          {weeklyTemplate.map(([day, first, second]) => (
            <div key={day} className="rounded-xl border border-slate-200 p-4 bg-slate-50">
              <p className="font-bold text-slate-900">{day}</p>
              <p className="text-sm text-slate-700 mt-3">{first}</p>
              <p className="text-xs text-slate-500 mt-2">{second}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const StatusCard: React.FC<{ title: string; value: string; detail: string }> = ({ title, value, detail }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
    <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
    <p className="text-sm text-slate-500 mt-2">{detail}</p>
  </div>
);

export default Revision;

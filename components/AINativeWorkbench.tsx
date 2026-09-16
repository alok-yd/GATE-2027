import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AIMemoryRecord,
  DocumentPurpose,
  EvaluationResult,
  PlannerImportPreview,
  RoadmapImportPreview,
  StoredDocument,
  applyPlannerImport,
  applyRoadmapImport,
  classifyAndSaveMistake,
  createMemory,
  deleteMemory,
  generateGroundedAnswer,
  getAIObservabilitySnapshot,
  getMistakePatterns,
  listDocuments,
  listEvaluations,
  listMemories,
  listMistakes,
  listPlannerImports,
  listRoadmapImports,
  listTestAnalyses,
  processTextDocument,
  processUploadedDocument,
  runEvaluationSuite,
  searchKnowledge,
  updateMemory,
} from '../services/AINativeServices';

type Tab = 'imports' | 'knowledge' | 'mistakes' | 'memory' | 'evals';

const purposeOptions: { id: DocumentPurpose; label: string }[] = [
  { id: 'planner', label: 'Planner' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'test', label: 'Test' },
  { id: 'mistake', label: 'Mistake' },
  { id: 'pyq', label: 'PYQ' },
  { id: 'study_material', label: 'Study Material' },
  { id: 'mentor', label: 'Mentor Context' },
];

const memoryCategories = [
  'user_goal',
  'preference',
  'recurring_mistake',
  'successful_strategy',
  'ineffective_strategy',
  'learning_pattern',
  'study_pattern',
  'roadmap_decision',
] as const;

const tabLabels: { id: Tab; label: string }[] = [
  { id: 'imports', label: 'Imports' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'mistakes', label: 'Mistakes' },
  { id: 'memory', label: 'Memory' },
  { id: 'evals', label: 'Evals' },
];

const Stat: React.FC<{ label: string; value: string | number; detail?: string }> = ({ label, value, detail }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
    {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
    {text}
  </div>
);

const AINativeWorkbench: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('imports');
  const [purpose, setPurpose] = useState<DocumentPurpose>('planner');
  const [file, setFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const [documents, setDocuments] = useState<StoredDocument[]>(() => listDocuments());
  const [plannerImports, setPlannerImports] = useState<PlannerImportPreview[]>(() => listPlannerImports());
  const [roadmapImports, setRoadmapImports] = useState<RoadmapImportPreview[]>(() => listRoadmapImports());
  const [mistakes, setMistakes] = useState(() => listMistakes());
  const [memories, setMemories] = useState<AIMemoryRecord[]>(() => listMemories());
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>(() => listEvaluations());
  const [observability, setObservability] = useState<Record<string, unknown> | null>(null);

  const [ragQuery, setRagQuery] = useState('');
  const [groundedAnswer, setGroundedAnswer] = useState('');
  const ragResults = useMemo(() => (ragQuery.trim() ? searchKnowledge(ragQuery) : []), [ragQuery, documents, memories, mistakes]);

  const [mistakeForm, setMistakeForm] = useState({
    subject: '',
    topic: '',
    question: '',
    studentAnswer: '',
    correctAnswer: '',
  });

  const [memoryForm, setMemoryForm] = useState({
    id: '',
    category: 'study_pattern' as AIMemoryRecord['category'],
    title: '',
    content: '',
  });

  const patterns = useMemo(() => getMistakePatterns(), [mistakes]);
  const testAnalyses = useMemo(() => listTestAnalyses(), [documents]);

  const refresh = async () => {
    setDocuments(listDocuments());
    setPlannerImports(listPlannerImports());
    setRoadmapImports(listRoadmapImports());
    setMistakes(listMistakes());
    setMemories(listMemories());
    setEvaluations(listEvaluations());
    setObservability(await getAIObservabilitySnapshot());
  };

  useEffect(() => {
    void refresh();
    const onStorage = () => void refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const processImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!file && !manualText.trim()) {
      setMessage('Choose a file or paste text first.');
      return;
    }

    setWorking(true);
    setMessage('');
    try {
      const document = file
        ? await processUploadedDocument(file, purpose)
        : await processTextDocument(`manual-${purpose}-${new Date().toISOString()}.txt`, manualText, purpose);
      setMessage(`Imported ${document.name} as ${document.purpose}. Review previews before applying changes.`);
      setFile(null);
      setManualText('');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  const applyPlanner = async (id: string) => {
    applyPlannerImport(id);
    setMessage('Planner import applied to daily target storage after confirmation.');
    await refresh();
  };

  const applyRoadmap = async (id: string) => {
    applyRoadmapImport(id);
    setMessage('Roadmap import accepted and saved as an inspectable roadmap decision memory.');
    await refresh();
  };

  const askRag = async () => {
    if (!ragQuery.trim()) return;
    setWorking(true);
    setGroundedAnswer('');
    try {
      const response = await generateGroundedAnswer(ragQuery.trim());
      setGroundedAnswer(`${response.answer}\n\nSources: ${response.citations.join(', ') || 'none'}`);
    } finally {
      setWorking(false);
    }
  };

  const saveMistake = async (event: FormEvent) => {
    event.preventDefault();
    if (!mistakeForm.question.trim()) {
      setMessage('Add the mistake question or description first.');
      return;
    }
    classifyAndSaveMistake(mistakeForm);
    setMistakeForm({
      subject: '',
      topic: '',
      question: '',
      studentAnswer: '',
      correctAnswer: '',
    });
    setMessage('Mistake saved and pattern detector updated.');
    await refresh();
  };

  const saveMemory = async (event: FormEvent) => {
    event.preventDefault();
    if (!memoryForm.title.trim() || !memoryForm.content.trim()) {
      setMessage('Memory title and content are required.');
      return;
    }

    if (memoryForm.id) {
      updateMemory({
        id: memoryForm.id,
        category: memoryForm.category,
        title: memoryForm.title,
        content: memoryForm.content,
        createdAt: memories.find((item) => item.id === memoryForm.id)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setMessage('Memory updated.');
    } else {
      createMemory({
        category: memoryForm.category,
        title: memoryForm.title,
        content: memoryForm.content,
      });
      setMessage('Memory saved.');
    }

    setMemoryForm({ id: '', category: 'study_pattern', title: '', content: '' });
    await refresh();
  };

  const runEvals = async () => {
    setWorking(true);
    try {
      await runEvaluationSuite();
      await refresh();
      setMessage('Evaluation suite completed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Achiever 2.0</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">AI-Native Control Room</h2>
            <p className="mt-2 max-w-4xl text-sm text-slate-300 md:text-base">
              Import planner, roadmap, test, mistake, PYQ, and study-material files. Review AI actions before applying
              them, search local knowledge with citations, and manage user-controlled memory.
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-black text-slate-900 hover:bg-amber-400"
          >
            Refresh State
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Documents" value={documents.length} detail={`${listTestAnalyses().length} test analyses`} />
        <Stat label="Planner Imports" value={plannerImports.length} detail="confirmation required" />
        <Stat label="Mistakes" value={mistakes.length} detail={`${patterns.length} pattern groups`} />
        <Stat
          label="Gateway"
          value={observability && (observability.gateway as any)?.configured ? 'Configured' : 'Fallback'}
          detail={(observability && (observability.gateway as any)?.primaryModel) || 'status pending'}
        />
      </section>

      {message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabLabels.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'imports' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">Import Document</h3>
            <form onSubmit={processImport} className="mt-4 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Purpose
                <select
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value as DocumentPurpose)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {purposeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                PDF, image, or text file
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.json,text/plain,application/pdf,image/*"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Or paste extracted text
                <textarea
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  rows={8}
                  placeholder="Paste planner, roadmap, test, mistake, PYQ, or notes text here..."
                  className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
              <button
                type="submit"
                disabled={working}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
              >
                {working ? 'Processing...' : 'Analyze with AI Gateway'}
              </button>
            </form>
          </div>

          <div className="space-y-5 lg:col-span-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Planner Import Previews</h3>
              <div className="mt-4 space-y-3">
                {plannerImports.length === 0 && <Empty text="No planner imports yet." />}
                {plannerImports.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{item.tasks.length} task(s)</p>
                        <p className="text-xs font-semibold uppercase text-slate-400">{item.status}</p>
                      </div>
                      {item.status === 'preview' && (
                        <button
                          onClick={() => void applyPlanner(item.id)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                        >
                          Apply Planner
                        </button>
                      )}
                    </div>
                    {item.conflicts.length > 0 && (
                      <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                        {item.conflicts.join(' ')}
                      </div>
                    )}
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      {item.tasks.slice(0, 4).map((task) => (
                        <li key={task.id}>
                          {task.date} - {task.subject}: {task.title} ({task.durationMinutes} min)
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Roadmap Import Previews</h3>
              <div className="mt-4 space-y-3">
                {roadmapImports.length === 0 && <Empty text="No roadmap imports yet." />}
                {roadmapImports.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{item.recommendations.length} recommendation(s)</p>
                        <p className="text-xs font-semibold uppercase text-slate-400">{item.status}</p>
                      </div>
                      {item.status === 'preview' && (
                        <button
                          onClick={() => void applyRoadmap(item.id)}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                        >
                          Accept Roadmap
                        </button>
                      )}
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      {item.recommendations.slice(0, 4).map((rec) => (
                        <li key={rec.id}>
                          {rec.phase} - {rec.subject}: {rec.milestone}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'knowledge' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">Grounded Search</h3>
            <div className="mt-4 space-y-3">
              <input
                value={ragQuery}
                onChange={(event) => setRagQuery(event.target.value)}
                placeholder="Search uploaded notes, mistakes, memory, and student state"
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => void askRag()}
                disabled={working || !ragQuery.trim()}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
              >
                Ask With Citations
              </button>
            </div>
            {groundedAnswer && (
              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                {groundedAnswer}
              </pre>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-bold text-slate-900">Search Results</h3>
            <div className="mt-4 space-y-3">
              {ragResults.length === 0 && <Empty text="No matching local knowledge yet." />}
              {ragResults.map((result) => (
                <div key={result.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{result.sourceName}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                      {result.sourceType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{result.snippet}</p>
                  <p className="mt-2 text-xs font-semibold text-indigo-600">{result.citation}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'mistakes' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <form onSubmit={saveMistake} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">Manual Mistake Entry</h3>
            {(['subject', 'topic', 'question', 'studentAnswer', 'correctAnswer'] as const).map((key) => (
              <label key={key} className="mt-4 block text-sm font-semibold text-slate-700">
                {key.replace(/([A-Z])/g, ' $1')}
                <textarea
                  value={mistakeForm[key]}
                  onChange={(event) => setMistakeForm({ ...mistakeForm, [key]: event.target.value })}
                  rows={key === 'question' ? 4 : 2}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            ))}
            <button className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">
              Save Mistake
            </button>
          </form>

          <div className="space-y-5 lg:col-span-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Repeated Patterns</h3>
              <div className="mt-4 space-y-3">
                {patterns.length === 0 && <Empty text="No repeated mistake patterns yet." />}
                {patterns.slice(0, 8).map((pattern) => (
                  <div key={pattern.key} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-bold text-slate-900">
                      {pattern.subject} - {pattern.topic}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {pattern.category}, repeated {pattern.count} time(s), priority increase: {pattern.priorityIncrease}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Recent Mistakes</h3>
              <div className="mt-4 space-y-3">
                {mistakes.length === 0 && <Empty text="No mistakes saved yet." />}
                {mistakes.slice(0, 6).map((mistake) => (
                  <div key={mistake.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-bold text-slate-900">
                      {mistake.subject} - {mistake.topic}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{mistake.category}: {mistake.preventionStrategy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'memory' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <form onSubmit={saveMemory} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">{memoryForm.id ? 'Edit Memory' : 'Add Memory'}</h3>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Category
              <select
                value={memoryForm.category}
                onChange={(event) =>
                  setMemoryForm({ ...memoryForm, category: event.target.value as AIMemoryRecord['category'] })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {memoryCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Title
              <input
                value={memoryForm.title}
                onChange={(event) => setMemoryForm({ ...memoryForm, title: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Content
              <textarea
                value={memoryForm.content}
                onChange={(event) => setMemoryForm({ ...memoryForm, content: event.target.value })}
                rows={6}
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <button className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700">
              {memoryForm.id ? 'Update Memory' : 'Save Memory'}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-bold text-slate-900">Inspectable Memory</h3>
            <div className="mt-4 space-y-3">
              {memories.length === 0 && <Empty text="No user-controlled AI memory yet." />}
              {memories.map((memory) => (
                <div key={memory.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{memory.title}</p>
                      <p className="text-xs font-semibold uppercase text-indigo-600">{memory.category}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setMemoryForm({
                            id: memory.id,
                            category: memory.category,
                            title: memory.title,
                            content: memory.content,
                          })
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          deleteMemory(memory.id);
                          await refresh();
                        }}
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{memory.content}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'evals' && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">AI Evaluation</h3>
            <p className="mt-2 text-sm text-slate-600">
              Runs deterministic regression checks for planner parsing, roadmap preview, mistake grouping, RAG indexing,
              gateway reachability, and student-state availability.
            </p>
            <button
              onClick={() => void runEvals()}
              disabled={working}
              className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
            >
              {working ? 'Running...' : 'Run Evaluation Suite'}
            </button>
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-bold text-slate-900">Observability snapshot</p>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(observability, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <h3 className="text-lg font-bold text-slate-900">Recent Evaluation Results</h3>
            <div className="mt-4 space-y-3">
              {evaluations.length === 0 && <Empty text="No evaluations have been run yet." />}
              {evaluations.slice(0, 12).map((evaluation) => (
                <div key={evaluation.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-900">{evaluation.name}</p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${
                        evaluation.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {evaluation.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase text-slate-400">{evaluation.area}</p>
                  <p className="mt-2 text-sm text-slate-600">{evaluation.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'imports' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Recent Documents</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {documents.length === 0 && <Empty text="No documents imported yet." />}
            {documents.slice(0, 9).map((document) => (
              <div key={document.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-slate-900">{document.name}</p>
                <p className="mt-1 text-xs font-semibold uppercase text-indigo-600">
                  {document.kind} / {document.purpose}
                </p>
                <p className="mt-2 text-sm text-slate-600">{document.summary}</p>
                {document.warnings.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-amber-700">{document.warnings.join(' ')}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'imports' && testAnalyses.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Test Analyses</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {testAnalyses.slice(0, 6).map((analysis) => (
              <div key={analysis.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-slate-900">
                  Score: {analysis.score ?? 'unknown'} / {analysis.totalMarks ?? 'unknown'}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Weak: {analysis.weakSubjects.join(', ')}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Next: {analysis.correctiveActions[0]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default AINativeWorkbench;

import React, { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiHub } from '../services/AIServiceHub';

const examples = [
  'What should I study today?',
  'Find my repeated weak topics',
  'Analyze my latest mock',
  'Import this roadmap',
  'Find my repeated mistakes',
  'Should I revise OS or TOC today?',
];

const AICommandBar: React.FC = () => {
  const [command, setCommand] = useState('');
  const navigate = useNavigate();

  const preview = useMemo(() => {
    const value = command.trim();
    if (!value) return null;
    return aiHub.buildOrchestratedPrompt(value);
  }, [command]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    navigate(`/mentor?ask=${encodeURIComponent(value)}`);
    setCommand('');
  };

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <form onSubmit={submit} className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <label htmlFor="ai-command" className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Ask Achiever
          </label>
          <input
            id="ai-command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Ask for a plan, roadmap review, mock analysis, or weak-topic diagnosis"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={!command.trim()}
          className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
        >
          Route to Mentor
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCommand(item)}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
          >
            {item}
          </button>
        ))}
      </div>

      {preview && (
        <p className="mt-3 text-xs text-slate-500">
          Routed as <span className="font-bold text-slate-700">{preview.intent}</span> using{' '}
          <span className="font-bold text-slate-700">{preview.promptId}</span> with tools:{' '}
          {preview.tools.join(', ')}
        </p>
      )}
    </section>
  );
};

export default AICommandBar;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_GEMINI_API_KEY,
  getGeminiApiKey,
  getMaskedGeminiKey,
  setGeminiApiKey,
  testGeminiKeyConnection,
} from '../services/AIGatewayClient';
import { AI_MODEL_CONFIG } from '../services/ai/modelConfig';
import { aiHub } from '../services/AIServiceHub';
import { getStudentProfile } from '../services/DataExtractor';
import { StudentProfile } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type MentorMode = 'chat' | 'concept' | 'problem' | 'strategy';

const formatPlan = (plan: Awaited<ReturnType<typeof aiHub.createPersonalizedPlan>>) => {
  const week = plan.weeks?.[0];
  if (!week) return 'No plan could be generated yet. Add study logs or mock scores and try again.';

  const days = week.daily
    .slice(0, 7)
    .map((day) => `${day.day}: ${day.target}`)
    .join('\n');

  return `This week's target: ${week.milestone}

Focus: ${week.focus.join(', ')}

${days}

${plan.notes || ''}`;
};

const formatWeakAreas = (areas: Awaited<ReturnType<typeof aiHub.identifyWeakAreas>>) => {
  if (areas.length === 0) return 'No weak area is currently above the alert threshold.';

  return areas
    .slice(0, 5)
    .map(
      (area, index) =>
        `${index + 1}. ${area.subject} - ${area.topic}
Priority: ${area.priority} | ROI: ${area.roi} | Time: ${area.timeRequired}
Action: ${area.milestones[0] || 'Solve PYQs and update error notes.'}`
    )
    .join('\n\n');
};

const formatPrediction = (prediction: Awaited<ReturnType<typeof aiHub.predictAIR>>) => {
  const readiness = prediction.rankReadiness;
  const hardGateSummary = readiness
    ? `
Rank readiness: ${readiness.score}/100
Under-50 eligible: ${readiness.under50Eligible ? 'Yes' : 'No'}

Hard gates:
${readiness.hardConditions.map((condition) => `- ${condition.passed ? 'PASS' : 'MISS'} ${condition.label}: ${condition.detail}`).join('\n')}
`
    : '';

  return `Most likely AIR: ${prediction.mostLikely.range} (${prediction.mostLikely.confidence}% confidence)
Optimistic: ${prediction.optimistic.range}
Pessimistic: ${prediction.pessimistic.range}
${hardGateSummary}

Key factors:
${prediction.keyFactors.map((factor) => `- ${factor}`).join('\n')}

Required improvements:
${prediction.requiredImprovements
  .map((item) => `- ${item.area}: ${item.from}% -> ${item.to}% (${item.impact})`)
  .join('\n')}`;
};

const AIMentor: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialAsk = searchParams.get('ask') || '';
  const [profile, setProfile] = useState<StudentProfile>(() => getStudentProfile());
  const [activeModel, setActiveModel] = useState<string>(AI_MODEL_CONFIG.primaryModel);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        `Hello! I'm your GATE 2027 AI Mentor, powered by Google Gemini (${AI_MODEL_CONFIG.primaryModel}).\n\nAsk me any concept explanation, paste a GATE problem for step-by-step solution, or ask for your personalized study plan!`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState(initialAsk);
  const [mode, setMode] = useState<MentorMode>('chat');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Gemini API Key & Connection state
  const [geminiKey, setGeminiKey] = useState<string>(() => getGeminiApiKey());
  const [keyStatus, setKeyStatus] = useState<'verifying' | 'connected' | 'error'>('verifying');
  const [geminiLatency, setGeminiLatency] = useState<number | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [keyTestFeedback, setKeyTestFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Automatically ensure default key is initialized in localStorage if not set
    const activeKey = getGeminiApiKey();
    if (typeof window !== 'undefined' && !localStorage.getItem('gate_gemini_api_key')) {
      setGeminiApiKey(activeKey);
    }
    setGeminiKey(activeKey);

    // Verify Gemini connection
    testGeminiKeyConnection(activeKey).then((res) => {
      if (res.ok) {
        setKeyStatus('connected');
        setGeminiLatency(res.latencyMs);
        if (res.model) setActiveModel(res.model);
      } else {
        setKeyStatus('error');
      }
    });
  }, []);

  const handleTestConnection = async () => {
    setTestingKey(true);
    setKeyTestFeedback(null);
    const res = await testGeminiKeyConnection(geminiKey);
    setTestingKey(false);
    if (res.ok) {
      setKeyStatus('connected');
      setGeminiLatency(res.latencyMs);
      const modelUsed = res.model || activeModel;
      if (res.model) setActiveModel(res.model);
      setKeyTestFeedback(`Connected to Google Gemini (${modelUsed} - ${res.latencyMs} ms)`);
    } else {
      setKeyStatus('error');
      setKeyTestFeedback(res.message);
    }
  };

  const handleSaveCustomKey = (keyToSave: string) => {
    const trimmed = keyToSave.trim();
    if (!trimmed) return;
    setGeminiApiKey(trimmed);
    setGeminiKey(trimmed);
    setShowKeyModal(false);
    setKeyStatus('verifying');
    setKeyTestFeedback(null);
    testGeminiKeyConnection(trimmed).then((res) => {
      if (res.ok) {
        setKeyStatus('connected');
        setGeminiLatency(res.latencyMs);
        const modelUsed = res.model || activeModel;
        if (res.model) setActiveModel(res.model);
        addMessage('assistant', `Gemini API key updated and verified successfully! Google Gemini (${modelUsed}) is active.`);
      } else {
        setKeyStatus('error');
        addMessage('assistant', `Key updated, but connection test failed: ${res.message}`);
      }
    });
  };

  const quickStats = useMemo(() => {
    const weak = profile.subjects.filter((subject) => subject.accuracy < 70).length;
    const avgAccuracy = Math.round(
      profile.subjects.reduce((sum, subject) => sum + subject.accuracy, 0) /
        Math.max(profile.subjects.length, 1)
    );

    return {
      weak,
      avgAccuracy,
      mocks: profile.mocks.length,
    };
  }, [profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const onStorage = () => setProfile(getStudentProfile());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addMessage = (role: Message['role'], content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp: new Date(),
      },
    ]);
  };

  const runMentorAction = async (label: string, action: () => Promise<string>) => {
    addMessage('user', label);
    setLoading(true);

    try {
      const response = await action();
      addMessage('assistant', response);
    } catch (error) {
      console.error(error);
      addMessage('assistant', 'I hit an error while generating that response. Try again with a narrower prompt.');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setInput('');
    const currentMode = mode;

    await runMentorAction(prompt, async () => {
      if (currentMode === 'concept') return aiHub.explainConcept(prompt, profile.studyMetrics.learningStyle);
      if (currentMode === 'problem') return aiHub.solveProblem(prompt, true);
      if (currentMode === 'strategy') {
        const plan = await aiHub.createPersonalizedPlan(profile);
        return `${formatPlan(plan)}

Extra context from your question:
${prompt}`;
      }

      const orchestrated = await aiHub.askAchiever(prompt);
      if (orchestrated) return orchestrated;

      const lower = prompt.toLowerCase();
      if (lower.includes('air') || lower.includes('rank')) {
        return formatPrediction(await aiHub.predictAIR(profile));
      }
      if (lower.includes('weak') || lower.includes('priority')) {
        return formatWeakAreas(await aiHub.identifyWeakAreas(profile));
      }
      if (lower.includes('plan') || lower.includes('today') || lower.includes('week')) {
        return formatPlan(await aiHub.createPersonalizedPlan(profile));
      }
      if (lower.includes('solve') || lower.includes('?')) {
        return aiHub.solveProblem(prompt, true);
      }
      return aiHub.explainConcept(prompt, profile.studyMetrics.learningStyle);
    });
  };

  const quickActions = [
    {
      label: 'What should I study today?',
      action: () => aiHub.createPersonalizedPlan(profile).then(formatPlan),
    },
    {
      label: 'Find my top weak areas',
      action: () => aiHub.identifyWeakAreas(profile).then(formatWeakAreas),
    },
    {
      label: 'Predict my AIR',
      action: () => aiHub.predictAIR(profile).then(formatPrediction),
    },
    {
      label: 'Explain DBMS normalization',
      action: () => aiHub.explainConcept('DBMS normalization for GATE CS', profile.studyMetrics.learningStyle),
    },
    {
      label: 'Give me a motivation reset',
      action: () => aiHub.generateMotivationalMessage(profile),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[720px]">
      <aside className="lg:col-span-1 space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mentor status</p>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                keyStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : keyStatus === 'verifying'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  keyStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : keyStatus === 'verifying'
                    ? 'bg-amber-500 animate-spin'
                    : 'bg-rose-500'
                }`}
              />
              {keyStatus === 'connected' ? 'Connected' : keyStatus === 'verifying' ? 'Verifying...' : 'Offline / Error'}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-800 mt-2">
            Google Gemini ({activeModel})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Active LLM for GATE 2027 CSE Preparation
          </p>

          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Gemini Key:</span>
              <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {getMaskedGeminiKey(geminiKey)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Response Latency:</span>
              <span className="text-emerald-700 font-semibold font-mono">
                {geminiLatency ? `${geminiLatency} ms` : 'Ready'}
              </span>
            </div>

            {keyTestFeedback && (
              <p
                className={`text-[11px] p-1.5 rounded ${
                  keyStatus === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {keyTestFeedback}
              </p>
            )}

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={handleTestConnection}
                disabled={testingKey}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50 flex items-center gap-1"
              >
                {testingKey ? 'Pinging...' : '⚡ Test Connection'}
              </button>
              <button
                onClick={() => {
                  setCustomKeyInput(geminiKey);
                  setShowKeyModal(true);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition"
              >
                ⚙️ Key Settings
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
            <div className="bg-slate-50 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.avgAccuracy}%</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">Accuracy</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.weak}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">Weak</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.mocks}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">Mocks</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <div className="grid grid-cols-2 gap-2">
            {(['chat', 'concept', 'problem', 'strategy'] as MentorMode[]).map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`px-3 py-2 rounded-lg text-sm font-bold capitalize transition ${
                  mode === item
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Quick actions
          </p>
          <div className="space-y-2">
            {quickActions.map((item) => (
              <button
                key={item.label}
                onClick={() => runMentorAction(item.label, item.action)}
                disabled={loading}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-indigo-50 text-sm font-semibold text-slate-700 hover:text-indigo-700 transition disabled:opacity-60"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">AI Mentor</h2>
            <p className="text-sm text-slate-500 capitalize">{mode} mode</p>
          </div>
          <button
            onClick={() => {
              setProfile(getStudentProfile());
              addMessage('assistant', 'Progress data refreshed. Ask for a fresh plan or AIR forecast.');
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Sync Data
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[820px] rounded-xl px-4 py-3 shadow-sm ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-800 border border-slate-200'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                <p
                  className={`text-[11px] mt-2 ${
                    message.role === 'user' ? 'text-indigo-100' : 'text-slate-400'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:120ms]" />
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:240ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="p-4 border-t border-slate-200 bg-white">
          <div className="flex flex-col gap-3 md:flex-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Ask about OS scheduling, paste a problem, or request today's plan..."
              className="flex-1 resize-none px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-6 py-3 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 transition disabled:bg-slate-400"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Gemini Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="font-bold text-lg">Google Gemini API Key</h3>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                The AI Mentor is powered by <strong>Google Gemini ({activeModel})</strong> for real-time concept explanations, step-by-step problem solving, and adaptive GATE preparation guidance.
              </p>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  placeholder="Enter Gemini API key..."
                  className="w-full font-mono text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Active Environment Key: <code className="text-slate-600 font-mono">{getMaskedGeminiKey()}</code>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setCustomKeyInput('')}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
                >
                  Use Environment Key
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveCustomKey(customKeyInput)}
                  className="px-5 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  Save & Verify Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIMentor;

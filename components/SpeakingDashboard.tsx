import React, { useEffect, useRef, useState } from 'react';
import {
  AICoach,
  AIFeedback,
  MilestoneManager,
  MilestoneStatus,
  SessionManager,
  SessionScores,
  SpeakingSession,
  SpeakingSessionType,
  SPEAKING_TOPICS,
  TONGUE_TWISTERS,
} from '../services/SpeakingServiceHub';

type Tab = 'coach' | 'record' | 'tracker' | 'milestones' | 'progress';
type SpeakingLevel = 'beginner' | 'intermediate' | 'advanced';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'coach', label: 'AI Coach' },
  { id: 'record', label: 'Practice' },
  { id: 'tracker', label: 'Log' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'progress', label: 'Progress' },
];

const sessionTypes: SpeakingSessionType[] = [
  'free',
  'shadow',
  'record',
  'conversation',
  'tongue_twister',
  'presentation',
];

const sessionLabels: Record<SpeakingSessionType, string> = {
  free: 'Free Speaking',
  shadow: 'Shadowing',
  record: 'Recording',
  conversation: 'Conversation',
  tongue_twister: 'Tongue Twister',
  presentation: 'Presentation',
};

const scoreClass = (score: number) => {
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-amber-600';
  if (score >= 4) return 'text-orange-600';
  return 'text-rose-600';
};

const scoreBarClass = (score: number) => {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 6) return 'bg-amber-500';
  if (score >= 4) return 'bg-orange-500';
  return 'bg-rose-500';
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

const getSpeechRecognition = () => {
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition;
};

const SpeakingDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('coach');
  const [progress, setProgress] = useState(() => SessionManager.getProgress());
  const todayMinutes = SessionManager.getToday().reduce((sum, session) => sum + session.durationMinutes, 0);
  const dayNumber = Math.max(
    1,
    Math.ceil(
      (Date.now() - new Date(`${progress.dayStarted || new Date().toISOString().split('T')[0]}T00:00:00`).getTime()) /
        86400000
    )
  );

  useEffect(() => {
    const refresh = () => setProgress(SessionManager.getProgress());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-300">Communication Skills</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">Speaking Coach</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
              A separate 90-day English speaking practice track for clear explanations, interviews, and confidence.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <HeaderStat label="Day" value={`${dayNumber}/90`} />
            <HeaderStat label="Today" value={`${todayMinutes}m`} />
            <HeaderStat label="Streak" value={`${progress.currentStreak || 0}d`} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-3 text-sm font-bold transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'coach' && <CoachTab onSaved={() => setProgress(SessionManager.getProgress())} />}
      {activeTab === 'record' && <PracticeTab />}
      {activeTab === 'tracker' && <LogTab onSaved={() => setProgress(SessionManager.getProgress())} />}
      {activeTab === 'milestones' && <MilestonesTab />}
      {activeTab === 'progress' && <ProgressTab />}
    </div>
  );
};

const HeaderStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-[88px] rounded-lg bg-white/10 px-4 py-3">
    <p className="text-xl font-black text-white">{value}</p>
    <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-300">{label}</p>
  </div>
);

const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>
);

const ScoreInput: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <span className={`text-sm font-black ${value > 0 ? scoreClass(value) : 'text-slate-400'}`}>
        {value > 0 ? `${value}/10` : 'Not scored'}
      </span>
    </div>
    <input
      type="range"
      min="0"
      max="10"
      step="1"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-indigo-600"
    />
  </label>
);

const CoachTab: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [transcript, setTranscript] = useState('');
  const [sessionType, setSessionType] = useState<SpeakingSessionType>('free');
  const [duration, setDuration] = useState(5);
  const [scores, setScores] = useState<Partial<SessionScores>>({
    clarity: 0,
    confidence: 0,
    fluency: 0,
    pronunciation: 0,
    pace: 0,
  });
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [exercise, setExercise] = useState<{ title: string; instructions: string[]; duration: string; focus: string } | null>(
    null
  );
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [loadingExercise, setLoadingExercise] = useState(false);
  const progress = SessionManager.getProgress();
  const weekNumber = Math.max(
    1,
    Math.ceil((Date.now() - new Date(`${progress.dayStarted}T00:00:00`).getTime()) / (7 * 86400000))
  );
  const fillerWords = transcript.trim() ? AICoach.detectFillerWords(transcript) : [];

  const setScore = (key: keyof Omit<SessionScores, 'overall'>, value: number) => {
    setScores((current) => ({ ...current, [key]: value }));
  };

  const analyze = async () => {
    if (!transcript.trim()) return;
    setLoadingFeedback(true);
    const nextFeedback = await AICoach.analyzeTranscript(transcript, sessionType, duration, scores);
    const overall = SessionManager.calculateOverall(scores);
    const session = SessionManager.createSession(sessionType);
    session.durationMinutes = Math.max(1, duration);
    session.transcript = transcript.trim();
    session.aiAnalysis = nextFeedback;
    session.scores = {
      clarity: Number(scores.clarity || 0),
      confidence: Number(scores.confidence || 0),
      fluency: Number(scores.fluency || 0),
      pronunciation: Number(scores.pronunciation || 0),
      pace: Number(scores.pace || 0),
      overall: overall || Math.round((nextFeedback.overallScore / 10) * 10) / 10,
    };
    SessionManager.save(session);
    setFeedback(nextFeedback);
    setLoadingFeedback(false);
    onSaved();
  };

  const loadExercise = async () => {
    setLoadingExercise(true);
    setExercise(await AICoach.getDailyExercise(weekNumber, progress.averageScores || {}));
    setLoadingExercise(false);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Week {weekNumber}</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">AI-Generated Practice</h3>
              <p className="mt-1 text-sm text-slate-500">Generate a focused speaking drill based on recent scores.</p>
            </div>
            <button
              onClick={loadExercise}
              disabled={loadingExercise}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
            >
              {loadingExercise ? 'Generating...' : 'Get Exercise'}
            </button>
          </div>

          {exercise ? (
            <div className="mt-5 rounded-xl bg-indigo-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-900">{exercise.title}</p>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-indigo-700">{exercise.duration}</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{exercise.focus}</span>
              </div>
              <ol className="mt-4 space-y-2 text-sm text-slate-700">
                {exercise.instructions.map((step, index) => (
                  <li key={`${step}_${index}`} className="flex gap-2">
                    <span className="font-bold text-indigo-600">{index + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No exercise generated yet. You can still paste a transcript below for feedback.
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Transcript Analysis</h3>
              <p className="mt-1 text-sm text-slate-500">
                Paste a transcript from the Practice tab, then score yourself and request feedback.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {AICoach.getRuntimeLabel()}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">
              Session Type
              <select
                value={sessionType}
                onChange={(event) => setSessionType(event.target.value as SpeakingSessionType)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {sessionTypes.map((type) => (
                  <option key={type} value={type}>
                    {sessionLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">
              Duration
              <input
                type="number"
                min="1"
                max="120"
                value={duration}
                onChange={(event) => setDuration(Math.max(1, Number(event.target.value) || 1))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Detected Fillers</p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {fillerWords.reduce((sum, item) => sum + item.count, 0)}
              </p>
            </div>
          </div>

          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={8}
            placeholder="Paste your speech transcript here..."
            className="mt-4 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {fillerWords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fillerWords.map((item) => (
                <span key={item.word} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                  {item.word}: {item.count}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <ScoreInput label="Clarity" value={Number(scores.clarity || 0)} onChange={(value) => setScore('clarity', value)} />
            <ScoreInput
              label="Confidence"
              value={Number(scores.confidence || 0)}
              onChange={(value) => setScore('confidence', value)}
            />
            <ScoreInput label="Fluency" value={Number(scores.fluency || 0)} onChange={(value) => setScore('fluency', value)} />
            <ScoreInput
              label="Pronunciation"
              value={Number(scores.pronunciation || 0)}
              onChange={(value) => setScore('pronunciation', value)}
            />
            <ScoreInput label="Pace" value={Number(scores.pace || 0)} onChange={(value) => setScore('pace', value)} />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={analyze}
              disabled={loadingFeedback || !transcript.trim()}
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              {loadingFeedback ? 'Analyzing...' : 'Analyze and Save Session'}
            </button>
          </div>
        </Card>
      </div>

      <aside className="space-y-6 lg:col-span-2">
        <Card>
          <h3 className="font-bold text-slate-900">Feedback</h3>
          {!feedback ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              Feedback appears here after transcript analysis. The AI Gateway is used when available.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Overall</p>
                  <p className={`mt-1 text-3xl font-black ${scoreClass(feedback.overallScore / 10)}`}>
                    {feedback.overallScore}/100
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-700">Grade {feedback.grade}</span>
              </div>
              <p className="text-sm text-slate-600">{feedback.summary}</p>
              <FeedbackList title="Strengths" items={feedback.strengths} tone="green" />
              <FeedbackList title="Improvements" items={feedback.improvements} tone="amber" />
              <FeedbackList title="Pronunciation Tips" items={feedback.pronunciationTips} tone="indigo" />
              <div className="rounded-xl bg-indigo-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Next Focus</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{feedback.nextSessionFocus}</p>
              </div>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
};

const FeedbackList: React.FC<{ title: string; items: string[]; tone: 'green' | 'amber' | 'indigo' }> = ({
  title,
  items,
  tone,
}) => {
  const toneClass =
    tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'amber' ? 'text-amber-700 bg-amber-50' : 'text-indigo-700 bg-indigo-50';
  return (
    <div>
      <p className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide ${toneClass}`}>{title}</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="font-bold text-slate-400">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const PracticeTab: React.FC = () => {
  const [level, setLevel] = useState<SpeakingLevel>('beginner');
  const [topic, setTopic] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognition()));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  const randomTopic = () => {
    const topics = SPEAKING_TOPICS[level];
    setTopic(topics[Math.floor(Math.random() * topics.length)]);
  };

  const startRecording = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    setTranscript('');
    setSeconds(0);
    const recognition = new SpeechRecognition() as SpeechRecognitionLike;
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = true;
    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalTranscript += `${event.results[i][0].transcript} `;
        else interim = event.results[i][0].transcript;
      }
      setTranscript(`${finalTranscript}${interim}`.trim());
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card>
          <h3 className="text-xl font-bold text-slate-900">Choose A Speaking Prompt</h3>
          <p className="mt-1 text-sm text-slate-500">Pick a level, choose a prompt, and speak for 2-5 minutes.</p>

          <div className="mt-5 flex flex-wrap gap-2">
            {(['beginner', 'intermediate', 'advanced'] as SpeakingLevel[]).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setLevel(item);
                  setTopic('');
                }}
                className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${
                  level === item ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {SPEAKING_TOPICS[level].map((item) => (
              <button
                key={item}
                onClick={() => setTopic(item)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                  topic === item
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <button
            onClick={randomTopic}
            className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Random Prompt
          </button>

          {topic && (
            <div className="mt-5 rounded-xl bg-indigo-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Selected Prompt</p>
              <p className="mt-1 font-bold text-slate-900">{topic}</p>
              <p className="mt-1 text-sm text-slate-500">Think for 30 seconds, then speak without stopping.</p>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Live Transcription</h3>
              <p className="mt-1 text-sm text-slate-500">Uses the browser Web Speech API with Indian English.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${supported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {supported ? 'Speech API ready' : 'Unsupported browser'}
            </span>
          </div>

          {!supported ? (
            <div className="mt-5 rounded-xl bg-amber-50 p-5 text-sm text-amber-800">
              This browser does not expose speech recognition. Use Chrome or Edge, or type your transcript directly in
              the AI Coach tab.
            </div>
          ) : (
            <>
              <div className="mt-8 flex flex-col items-center">
                <div
                  className={`flex h-28 w-28 items-center justify-center rounded-full border-4 ${
                    isRecording ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-indigo-500 bg-indigo-50 text-indigo-600'
                  }`}
                >
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a4 4 0 004-4V7a4 4 0 10-8 0v7a4 4 0 004 4z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 11v3a7 7 0 0014 0v-3M12 21v-3" />
                  </svg>
                </div>
                <p className={`mt-4 font-mono text-4xl font-black ${isRecording ? 'text-rose-600' : 'text-slate-500'}`}>
                  {formatTime(seconds)}
                </p>
                <p className="mt-1 text-sm text-slate-500">{isRecording ? 'Recording. Speak clearly.' : 'Ready to start.'}</p>
              </div>

              <div className="mt-6 flex justify-center gap-3">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="rounded-full border border-rose-200 px-6 py-3 text-sm font-bold text-rose-600 hover:bg-rose-50"
                  >
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="rounded-full bg-rose-600 px-6 py-3 text-sm font-bold text-white hover:bg-rose-700"
                  >
                    Start Recording
                  </button>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      <aside className="space-y-6 lg:col-span-2">
        <Card>
          <h3 className="font-bold text-slate-900">Transcript</h3>
          {transcript ? (
            <>
              <div className="mt-4 max-h-[360px] overflow-y-auto rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {transcript}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(transcript)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Copy
                </button>
                <button
                  onClick={() => setTranscript('')}
                  className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"
                >
                  Clear
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">Paste this into AI Coach for analysis.</p>
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
              Your transcript appears here while recording.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="font-bold text-slate-900">Tongue Twisters</h3>
          <div className="mt-4 space-y-3">
            {TONGUE_TWISTERS.map((item) => (
              <div key={item.text} className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-slate-800">{item.text}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{item.focus}</p>
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
};

const LogTab: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [sessions, setSessions] = useState<SpeakingSession[]>(() => SessionManager.getAll().slice().reverse());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'free' as SpeakingSessionType,
    duration: 15,
    topic: '',
    notes: '',
    clarity: 5,
    confidence: 5,
    fluency: 5,
    pronunciation: 5,
    pace: 5,
  });
  const todayMinutes = SessionManager.getToday().reduce((sum, session) => sum + session.durationMinutes, 0);

  const save = () => {
    const scoreInput = {
      clarity: form.clarity,
      confidence: form.confidence,
      fluency: form.fluency,
      pronunciation: form.pronunciation,
      pace: form.pace,
    };
    const session = SessionManager.createSession(form.type, form.topic.trim() || undefined);
    session.durationMinutes = Math.max(1, Math.round(form.duration));
    session.notes = form.notes.trim() || undefined;
    session.scores = {
      ...scoreInput,
      overall: SessionManager.calculateOverall(scoreInput),
    };
    SessionManager.save(session);
    setSessions(SessionManager.getAll().slice().reverse());
    setShowForm(false);
    onSaved();
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Today's Practice</p>
            <p className={`mt-1 text-4xl font-black ${todayMinutes >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {todayMinutes}m
            </p>
            <p className="text-sm text-slate-500">
              Goal: 30 minutes {todayMinutes >= 30 ? 'complete' : `${30 - todayMinutes} minutes left`}
            </p>
          </div>
          <button
            onClick={() => setShowForm((value) => !value)}
            className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
          >
            {showForm ? 'Close Form' : 'Log Session'}
          </button>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (todayMinutes / 30) * 100)}%` }} />
        </div>
      </Card>

      {showForm && (
        <Card>
          <h3 className="font-bold text-slate-900">New Speaking Session</h3>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">
              Type
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as SpeakingSessionType })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {sessionTypes.map((type) => (
                  <option key={type} value={type}>
                    {sessionLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">
              Duration
              <input
                type="number"
                min="1"
                max="120"
                value={form.duration}
                onChange={(event) => setForm({ ...form, duration: Number(event.target.value) || 1 })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-sm font-bold text-slate-700">
              Topic
              <input
                value={form.topic}
                onChange={(event) => setForm({ ...form, topic: event.target.value })}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            {(['clarity', 'confidence', 'fluency', 'pronunciation', 'pace'] as const).map((key) => (
              <ScoreInput
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={form[key]}
                onChange={(value) => setForm({ ...form, [key]: value })}
              />
            ))}
          </div>

          <input
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Notes: what went well, what to fix..."
            className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="mt-5 flex justify-end">
            <button onClick={save} className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
              Save Session
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Session History</h3>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{sessions.length} entries</span>
        </div>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No speaking sessions yet.
            </div>
          ) : (
            sessions.slice(0, 15).map((session) => (
              <div key={session.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{sessionLabels[session.type]}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">
                        {session.durationMinutes} min
                      </span>
                      {session.topic && (
                        <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-600">
                          {session.topic}
                        </span>
                      )}
                    </div>
                    {session.notes && <p className="mt-2 text-sm text-slate-500">{session.notes}</p>}
                  </div>
                  <div className="text-left md:text-right">
                    {session.scores.overall > 0 && (
                      <p className={`text-2xl font-black ${scoreClass(session.scores.overall)}`}>
                        {session.scores.overall.toFixed(1)}
                      </p>
                    )}
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{formatDate(session.date)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

const MilestonesTab: React.FC = () => {
  const [milestones, setMilestones] = useState<MilestoneStatus[]>(() => MilestoneManager.getAll());
  const completionRate = MilestoneManager.getCompletionRate();

  const toggle = (id: string) => {
    MilestoneManager.toggle(id);
    setMilestones(MilestoneManager.getAll());
  };

  const weeks = Array.from({ length: 12 }, (_, index) => ({
    week: index + 1,
    milestones: milestones.filter((milestone) => milestone.week === index + 1),
  })).filter((week) => week.milestones.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Milestone Tracker</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">12-Week Speaking Roadmap</h3>
            <p className="mt-1 text-sm text-slate-500">Toggle milestones as your communication practice matures.</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-4xl font-black text-indigo-600">{Math.round(completionRate)}%</p>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {milestones.filter((milestone) => milestone.completed).length}/{milestones.length} complete
            </p>
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${completionRate}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {weeks.map((week) => (
          <Card key={week.week}>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Week {week.week}</p>
            <div className="mt-4 space-y-3">
              {week.milestones.map((milestone) => (
                <button
                  key={milestone.id}
                  onClick={() => toggle(milestone.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    milestone.completed
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-black ${
                        milestone.completed
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 text-transparent'
                      }`}
                    >
                      OK
                    </span>
                    <span>
                      <span className="block font-bold text-slate-900">{milestone.title}</span>
                      <span className="mt-1 block text-sm text-slate-500">{milestone.description}</span>
                      <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-slate-400">
                        Target {milestone.targetDate}
                        {milestone.completedDate ? ` - done ${milestone.completedDate}` : ''}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const ProgressTab: React.FC = () => {
  const progress = SessionManager.getProgress();
  const sessions = SessionManager.getAll();
  const logs = SessionManager.getDailyLogs();
  const start = new Date(`${progress.dayStarted}T00:00:00`);
  const dayNumber = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
  const dayProgress = Math.min(100, (dayNumber / 90) * 100);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last30 = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (29 - index));
    const key = date.toISOString().split('T')[0];
    const log = logs.find((item) => item.date === key);
    return {
      date: key,
      day: date.getDate(),
      completed: Boolean(log?.completed),
      minutes: log?.totalMinutes || 0,
    };
  });
  const maxWeekMinutes = Math.max(...progress.weeklyMinutes, 1);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ProgressCard label="Current Streak" value={`${progress.currentStreak}d`} />
        <ProgressCard label="Total Practice" value={`${progress.totalMinutes}m`} />
        <ProgressCard label="Sessions" value={`${progress.totalSessions}`} />
        <ProgressCard label="Best Streak" value={`${progress.longestStreak}d`} />
        <ProgressCard label="Day Of Program" value={`${dayNumber}/90`} />
        <ProgressCard label="Avg Score" value={`${(progress.averageScores.overall || 0).toFixed(1)}/10`} />
      </section>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">90-Day Journey</h3>
            <p className="mt-1 text-sm text-slate-500">Started {progress.dayStarted}. Target completion {progress.day90Target}.</p>
          </div>
          <p className="text-2xl font-black text-indigo-600">{Math.round(dayProgress)}%</p>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600" style={{ width: `${dayProgress}%` }} />
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-bold text-slate-900">Last 30 Days</h3>
          <div className="mt-5 grid grid-cols-10 gap-2">
            {last30.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.minutes} minutes`}
                className={`flex aspect-square items-center justify-center rounded text-xs font-bold ${
                  day.completed
                    ? 'bg-emerald-500 text-white'
                    : day.minutes > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {day.day}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-slate-900">Weekly Minutes</h3>
          <div className="mt-5 flex h-52 items-end gap-3">
            {progress.weeklyMinutes.map((minutes, index) => (
              <div key={`week_${index}`} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-40 w-full items-end rounded bg-slate-50">
                  <div
                    className="w-full rounded bg-indigo-500"
                    style={{ height: `${Math.max(4, (minutes / maxWeekMinutes) * 100)}%` }}
                  />
                </div>
                <p className="text-xs font-bold text-slate-500">{minutes}m</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card>
        <h3 className="font-bold text-slate-900">Average Scores</h3>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
          {(['clarity', 'confidence', 'fluency', 'pronunciation', 'pace'] as const).map((key) => {
            const value = progress.averageScores[key] || 0;
            return (
              <div key={key} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{key}</p>
                  <p className={`font-black ${value > 0 ? scoreClass(value) : 'text-slate-400'}`}>{value.toFixed(1)}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className={`h-full rounded-full ${value > 0 ? scoreBarClass(value) : 'bg-slate-200'}`} style={{ width: `${value * 10}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-slate-900">Recent Sessions</h3>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No sessions logged yet.</p>
          ) : (
            sessions
              .slice()
              .reverse()
              .slice(0, 6)
              .map((session) => (
                <div key={session.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                  <div>
                    <p className="font-bold text-slate-900">{sessionLabels[session.type]}</p>
                    <p className="text-sm text-slate-500">
                      {formatDate(session.date)} - {session.durationMinutes} min
                    </p>
                  </div>
                  <p className={`font-black ${session.scores.overall > 0 ? scoreClass(session.scores.overall) : 'text-slate-400'}`}>
                    {session.scores.overall > 0 ? session.scores.overall.toFixed(1) : '-'}
                  </p>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  );
};

const ProgressCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
  </div>
);

export default SpeakingDashboard;

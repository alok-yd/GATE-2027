import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bookmark,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  ImagePlus,
  Lightbulb,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  getGeminiApiKey,
  getMaskedGeminiKey,
  setGeminiApiKey,
  testGeminiKeyConnection,
  describeAIGatewayError,
  generateGatewayImage,
  generateGatewayVision,
  generateGatewayJson,
  searchGatewayWeb,
} from '../services/AIGatewayClient';
import { AI_MODEL_CONFIG } from '../services/ai/modelConfig';
import { getStudentProfile } from '../services/DataExtractor';
import {
  createMemory,
  deleteDocument,
  deleteMemory,
  listDocuments,
  listMemories,
  processUploadedDocument,
  searchKnowledge,
  updateMemory,
} from '../services/AINativeServices';
import type { AIMemoryRecord, StoredDocument } from '../services/AINativeServices';
import {
  createMentorConversation,
  getActiveMentorConversationId,
  loadMentorConversations,
  saveMentorConversations,
  removeMentorConversation,
  renameMentorConversation,
  setActiveMentorConversationId,
} from '../services/mentor/MentorStorage';
import type {
  MentorConversation,
  MentorStoredAttachment,
  MentorStoredMessage,
  MentorQuizPayload,
  MentorQuizQuestion,
  MentorQuizQuestionType,
} from '../services/mentor/MentorStorage';
import { base64ToBlob, blobToBase64, deleteMentorAttachments, readMentorAttachment, saveMentorAttachment } from '../services/mentor/MentorAttachmentStorage';
import { summarizeMentorConversation } from '../services/mentor/MentorAgent';
import type { MentorMode } from '../services/mentor/MentorAgent';
import { orchestrateJarvisMessage } from '../services/assistant/JarvisOrchestrator';
import type { JarvisProgressStage } from '../services/assistant/JarvisOrchestrator';
import { MentorMarkdown } from './mentor/MentorMarkdown';
import type { StudentProfile } from '../types';

const StoredMentorImage: React.FC<{ attachment: MentorStoredAttachment }> = ({ attachment }) => {
  const [source, setSource] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    if (!attachment.id) return;
    readMentorAttachment(attachment.id)
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((error) => console.warn('[AIMentor] Could not load saved image:', error));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (!source) {
    return <div className="my-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-400">Loading image: {attachment.name}</div>;
  }

  return (
    <div className="my-3 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <a href={source} target="_blank" rel="noreferrer" title="Open image">
        <img src={source} alt={attachment.name} className="max-h-[520px] max-w-full object-contain" loading="lazy" />
      </a>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <span className="min-w-0 truncate text-[10px] text-slate-500">{attachment.name}</span>
        <a href={source} download={attachment.name} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
          <Download size={13} /> Download
        </a>
      </div>
    </div>
  );
};


const normaliseQuizAnswer = (value: string) =>
  value.toLowerCase().replace(/\s+/g, '').replace(/,/g, '').trim();

const getQuizQuestionCorrect = (question: MentorQuizQuestion, selected: string[]) => {
  const expected = question.correctAnswers.map(normaliseQuizAnswer).sort();
  const actual = selected.map(normaliseQuizAnswer).sort();
  return expected.length === actual.length && expected.every((answer, index) => answer === actual[index]);
};

const MentorQuizCard: React.FC<{
  quiz: MentorQuizPayload;
  onChange: (quiz: MentorQuizPayload) => void;
}> = ({ quiz, onChange }) => {
  const question = quiz.questions[quiz.currentIndex];
  if (!question) return null;
  const selected = quiz.responses[question.id] || [];
  const totalMarks = quiz.questions.reduce((sum, item) => sum + item.marks, 0);
  const correctCount = quiz.questions.filter((item) => getQuizQuestionCorrect(item, quiz.responses[item.id] || [])).length;
  const score = quiz.questions.reduce((sum, item) => {
    const answer = quiz.responses[item.id] || [];
    if (!answer.length) return sum;
    return sum + (getQuizQuestionCorrect(item, answer) ? item.marks : -item.negativeMarks);
  }, 0);
  const accuracy = quiz.questions.length ? Math.round((correctCount / quiz.questions.length) * 100) : 0;
  const updateAnswer = (answers: string[]) => onChange({
    ...quiz,
    responses: { ...quiz.responses, [question.id]: answers },
  });
  const moveTo = (index: number) => onChange({
    ...quiz,
    currentIndex: Math.max(0, Math.min(quiz.questions.length - 1, index)),
  });
  const toggleReview = () => {
    const marked = new Set(quiz.markedForReview);
    if (marked.has(question.id)) marked.delete(question.id);
    else marked.add(question.id);
    onChange({ ...quiz, markedForReview: [...marked] });
  };
  const chooseOption = (id: string) => {
    if (quiz.submitted) return;
    updateAnswer(question.type === 'multiple'
      ? (selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
      : [id]);
  };

  return (
    <section className="my-4 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-4 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100">Interactive GATE Practice</p>
            <h3 className="mt-1 text-lg font-bold">{quiz.title}</h3>
            <p className="mt-1 text-xs text-indigo-100">{quiz.subject} · {quiz.topic} · {quiz.difficulty.toUpperCase()}</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{quiz.questions.length} questions</span>
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-indigo-100">
          <span>Question {quiz.currentIndex + 1} of {quiz.questions.length}</span>
          <span>{Math.round(((quiz.currentIndex + 1) / quiz.questions.length) * 100)}% viewed</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: (((quiz.currentIndex + 1) / quiz.questions.length) * 100) + '%' }} />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase text-indigo-700">{question.type === 'single' ? 'MCQ · Single correct' : question.type === 'multiple' ? 'MSQ · Multiple correct' : question.type === 'nat' ? 'Numerical answer' : 'True / False'}</span>
            <span className="text-[10px] text-slate-500">+{question.marks} marks{question.negativeMarks > 0 ? ' · −' + question.negativeMarks + ' for wrong answer' : ''}</span>
          </div>
          <button type="button" onClick={toggleReview} disabled={quiz.submitted} className={quiz.markedForReview.includes(question.id) ? 'rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800' : 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40'}>
            {quiz.markedForReview.includes(question.id) ? '★ Marked for review' : '☆ Mark for review'}
          </button>
        </div>

        <div className="text-sm font-semibold leading-6 text-slate-900">{question.prompt}</div>
        {question.type === 'nat' ? (
          <div className="mt-4 max-w-xs">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your numerical answer</label>
            <input
              value={selected[0] || ''}
              onChange={(event) => updateAnswer(event.target.value ? [event.target.value] : [])}
              disabled={quiz.submitted}
              inputMode="decimal"
              placeholder="Enter numerical value"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 disabled:bg-slate-50"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {question.options.map((option) => {
              const isSelected = selected.includes(option.id);
              const isCorrect = quiz.submitted && question.correctAnswers.includes(option.id);
              const isWrongSelection = quiz.submitted && isSelected && !isCorrect;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={quiz.submitted}
                  onClick={() => chooseOption(option.id)}
                  className={[
                    'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition',
                    isCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-900' :
                    isWrongSelection ? 'border-rose-300 bg-rose-50 text-rose-900' :
                    isSelected ? 'border-indigo-300 bg-indigo-50 text-indigo-900' :
                    'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className={['mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-bold', question.type === 'multiple' ? 'rounded' : 'rounded-full', isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-500'].join(' ')}>
                    {isSelected ? '✓' : option.id}
                  </span>
                  <span className="min-w-0 flex-1">{option.text}</span>
                  {isCorrect && <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        )}

        {quiz.submitted && (
          <div className={getQuizQuestionCorrect(question, selected) ? 'mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3' : 'mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3'}>
            <p className="text-xs font-bold">{getQuizQuestionCorrect(question, selected) ? 'Correct answer' : 'Not quite — review the solution'}</p>
            <p className="mt-1 text-xs leading-5">
              <strong>Correct answer:</strong> {question.correctAnswers.join(', ')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5">{question.explanation}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => moveTo(quiz.currentIndex - 1)} disabled={quiz.currentIndex === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Previous</button>
          <div className="flex flex-wrap gap-2">
            {!quiz.submitted && (
              <button type="button" onClick={() => onChange({ ...quiz, submitted: true })} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">Submit quiz</button>
            )}
            <button type="button" onClick={() => moveTo(quiz.currentIndex + 1)} disabled={quiz.currentIndex === quiz.questions.length - 1} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">Next</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {quiz.questions.map((item, index) => {
            const answered = Boolean(quiz.responses[item.id]?.length);
            const marked = quiz.markedForReview.includes(item.id);
            return (
              <button key={item.id} type="button" onClick={() => moveTo(index)} title={'Question ' + (index + 1) + (marked ? ' · Marked for review' : '')} className={[
                'flex h-8 w-8 items-center justify-center rounded-lg border text-[11px] font-bold',
                index === quiz.currentIndex ? 'border-indigo-600 bg-indigo-600 text-white' :
                marked ? 'border-amber-300 bg-amber-50 text-amber-800' :
                answered ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                'border-slate-200 bg-white text-slate-500',
              ].join(' ')}>{index + 1}</button>
            );
          })}
        </div>

        {quiz.submitted && (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm font-bold text-indigo-950">Quiz performance</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-2"><p className="text-lg font-bold text-slate-900">{correctCount}/{quiz.questions.length}</p><p className="text-[9px] uppercase text-slate-500">Correct</p></div>
              <div className="rounded-lg bg-white p-2"><p className="text-lg font-bold text-slate-900">{accuracy}%</p><p className="text-[9px] uppercase text-slate-500">Accuracy</p></div>
              <div className="rounded-lg bg-white p-2"><p className="text-lg font-bold text-slate-900">{score.toFixed(2)}/{totalMarks}</p><p className="text-[9px] uppercase text-slate-500">Score</p></div>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-indigo-800">Score uses the marks and negative-marking values shown for each question. Numerical answers are compared as entered; verify rounding instructions in the question.</p>
          </div>
        )}
      </div>
    </section>
  );
};


const StoredMentorFile: React.FC<{ attachment: MentorStoredAttachment }> = ({ attachment }) => {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    if (!attachment.id) return;
    readMentorAttachment(attachment.id)
      .then((blob) => {
        if (!blob || cancelled) {
          if (!blob) setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  return (
    <div className="my-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{attachment.name}</p>
        <p className="mt-1 text-[10px] text-slate-400">{failed ? 'File preview unavailable' : attachment.mimeType + (attachment.size ? ' · ' + (attachment.size / 1024).toFixed(0) + ' KB' : '')}</p>
      </div>
      {source && (
        <a href={source} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">Open</a>
      )}
      {source && (
        <a href={source} download={attachment.name} className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">Download</a>
      )}
    </div>
  );
};

const createWelcomeMessage = (): MentorStoredMessage => ({
  id: 'welcome',
  role: 'assistant',
  content:
    `# J.A.R.V.I.S. — Personal AI Learning & Intelligence

**Just A Rather Very Intelligent System**, integrated with ACHIEVER.

I can explain GATE CS/IT/DA concepts, solve PYQs step by step, analyse your recorded mock and PYQ performance, review your Roadmap and revision status, build realistic study plans, search notes you upload, understand educational images, and generate diagrams and infographics.

Your voice assistant and this full AI Mentor workspace share the same conversation history and user-approved memories. I use the tracker’s available records rather than guessing your statistics.

**Tell me what you want to learn, analyse, plan or improve.**`,
  timestamp: new Date().toISOString(),
});

const createMessage = (
  role: MentorStoredMessage['role'],
  content: string,
  attachments: MentorStoredAttachment[] = []
): MentorStoredMessage => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  role,
  content,
  timestamp: new Date().toISOString(),
  ...(attachments.length ? { attachments } : {}),
});

const AIMentor: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialAsk = searchParams.get('ask') || '';

  const [profile, setProfile] = useState<StudentProfile>(() => getStudentProfile());
  const [activeModel, setActiveModel] = useState<string>(AI_MODEL_CONFIG.primaryModel);
  const [conversations, setConversations] = useState<MentorConversation[]>(() => loadMentorConversations());
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const loaded = loadMentorConversations();
    const savedActive = getActiveMentorConversationId();
    return loaded.some((conversation) => conversation.id === savedActive)
      ? savedActive
      : loaded[0]?.id || '';
  });
  const [messages, setMessages] = useState<MentorStoredMessage[]>(() => {
    const loaded = loadMentorConversations();
    const savedActive = getActiveMentorConversationId();
    const active = loaded.find((conversation) => conversation.id === savedActive) || loaded[0];
    return active?.messages?.length ? active.messages : [createWelcomeMessage()];
  });

  const [input, setInput] = useState(initialAsk);
  const [mode, setMode] = useState<MentorMode>('chat');
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [lastRequestLatencyMs, setLastRequestLatencyMs] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('achiever_ai_mentor_sidebar_collapsed_v1') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [showConversationActions, setShowConversationActions] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);
  const [quizSubject, setQuizSubject] = useState('Computer Organization and Architecture');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('medium');
  const [quizCount, setQuizCount] = useState(10);
  const [quizQuestionType, setQuizQuestionType] = useState<MentorQuizQuestionType | 'mixed'>('mixed');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [utilityPanel, setUtilityPanel] = useState<'settings' | 'documents' | null>(null);
  const [memories, setMemories] = useState<AIMemoryRecord[]>(() => listMemories());
  const [editingMemory, setEditingMemory] = useState<{ id: string; title: string; content: string } | null>(null);
  const [documentsCount, setDocumentsCount] = useState(() => listDocuments().length);
  const [documentActionsId, setDocumentActionsId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [pendingDocuments, setPendingDocuments] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [imageGenerationMode, setImageGenerationMode] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const conversationsRef = useRef(conversations);
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  // Gemini API key and connection state (preserves the existing key settings UI).
  const [geminiKey, setGeminiKey] = useState<string>(() => getGeminiApiKey());
  const [keyStatus, setKeyStatus] = useState<'verifying' | 'connected' | 'error'>('verifying');
  const [geminiLatency, setGeminiLatency] = useState<number | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [keyTestFeedback, setKeyTestFeedback] = useState<string | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;

  const updateConversationList = (next: MentorConversation[]) => {
    const saved = saveMentorConversations(next);
    conversationsRef.current = saved;
    setConversations(saved);
    return saved;
  };

  const persistMessagesForConversation = (
    conversationId: string,
    nextMessages: MentorStoredMessage[]
  ) => {
    const boundedMessages = nextMessages.slice(-120);
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const base = current || createMentorConversation([createWelcomeMessage()]);
    const firstUser = boundedMessages.find((message) => message.role === 'user')?.content || '';
    const updated: MentorConversation = {
      ...base,
      title: base.titleIsCustom ? base.title : (firstUser.replace(/\s+/g, ' ').trim().slice(0, 52) || 'New conversation'),
      updatedAt: new Date().toISOString(),
      messages: boundedMessages,
    };
    updateConversationList([
      updated,
      ...conversationsRef.current.filter((conversation) => conversation.id !== updated.id),
    ]);

    if (activeConversationIdRef.current === conversationId) {
      messagesRef.current = boundedMessages;
      setMessages(boundedMessages);
    }
  };

  const persistMessages = (nextMessages: MentorStoredMessage[]) =>
    persistMessagesForConversation(activeConversationIdRef.current, nextMessages);

  const appendMessage = (role: MentorStoredMessage['role'], content: string) => {
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const baseMessages = current?.messages || messagesRef.current;
    persistMessagesForConversation(conversationId, [...baseMessages, createMessage(role, content)]);
  };

  const maybeSummarizeConversation = async (conversationId: string) => {
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    if (!current) return;

    const targetCount = Math.max(0, current.messages.length - 10);
    const alreadySummarized = current.summarizedMessageCount || 0;
    if (targetCount < 18 || targetCount - alreadySummarized < 12) return;

    const olderMessages = current.messages.slice(0, targetCount);
    const summary = await summarizeMentorConversation(
      olderMessages.map((message) => ({ role: message.role, content: message.content })),
      current.summary || ''
    );

    const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    if (!latest) return;
    const updated: MentorConversation = {
      ...latest,
      summary,
      summarizedMessageCount: targetCount,
      updatedAt: new Date().toISOString(),
    };
    updateConversationList([
      updated,
      ...conversationsRef.current.filter((conversation) => conversation.id !== conversationId),
    ]);
  };

  // Restore a valid conversation after first mount and keep the active ID durable.
  useEffect(() => {
    messagesRef.current = messages;
    conversationsRef.current = conversations;

    if (!activeConversationId || !conversations.some((conversation) => conversation.id === activeConversationId)) {
      const welcome = createWelcomeMessage();
      const conversation = createMentorConversation([welcome]);
      const next = updateConversationList([conversation, ...conversationsRef.current]);
      setActiveConversationId(conversation.id);
      setActiveMentorConversationId(conversation.id);
      messagesRef.current = conversation.messages;
      setMessages(conversation.messages);
      setConversations(next);
      return;
    }

    setActiveMentorConversationId(activeConversationId);
  // Initial recovery only; conversation switching is handled explicitly below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;
    const activeKey = getGeminiApiKey();
    setGeminiKey(activeKey);
    testGeminiKeyConnection(activeKey)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setKeyStatus('connected');
          setGeminiLatency(result.latencyMs);
          if (result.model) setActiveModel(result.model);
        } else {
          setKeyStatus('error');
          setKeyTestFeedback(result.message);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setKeyStatus('error');
        setKeyTestFeedback(describeAIGatewayError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = () => {
      setProfile(getStudentProfile());
      setMemories(listMemories());
      setDocumentsCount(listDocuments().length);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('gate-mentor-conversations-updated', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('gate-mentor-conversations-updated', onStorage);
    };
  }, []);

  const quickStats = useMemo(() => {
    const measuredRows = profile.pyqPerformance.filter(
      (subject) => subject.accuracy != null && subject.attempted > 0
    );
    const avgAccuracy = measuredRows.length
      ? Math.round(
          measuredRows.reduce((sum, subject) => sum + Number(subject.accuracy || 0), 0) /
            measuredRows.length
        )
      : null;
    const weakMeasuredSubjects = measuredRows.filter((subject) => Number(subject.accuracy) < 75).length;

    return {
      avgAccuracy,
      weak: weakMeasuredSubjects,
      measuredSubjects: measuredRows.length,
      mocks: profile.mocks.length,
    };
  }, [profile]);

  const handleTestConnection = async () => {
    setTestingKey(true);
    setKeyTestFeedback(null);
    try {
      const result = await testGeminiKeyConnection(geminiKey);
      if (result.ok) {
        setKeyStatus('connected');
        setGeminiLatency(result.latencyMs);
        const modelUsed = result.model || activeModel;
        if (result.model) setActiveModel(result.model);
        setKeyTestFeedback(`Connected to Google Gemini (${modelUsed} - ${result.latencyMs} ms)`);
      } else {
        setKeyStatus('error');
        setKeyTestFeedback(result.message);
      }
    } catch (error) {
      setKeyStatus('error');
      setKeyTestFeedback(describeAIGatewayError(error));
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveCustomKey = async (keyToSave: string) => {
    const trimmed = keyToSave.trim();
    setGeminiApiKey(trimmed);
    const effectiveKey = getGeminiApiKey();
    setGeminiKey(effectiveKey);
    setShowKeyModal(false);
    setKeyStatus('verifying');
    setKeyTestFeedback(null);

    try {
      const result = await testGeminiKeyConnection(effectiveKey);
      if (result.ok) {
        setKeyStatus('connected');
        setGeminiLatency(result.latencyMs);
        const modelUsed = result.model || activeModel;
        if (result.model) setActiveModel(result.model);
        appendMessage('assistant', `Gemini API key updated and verified successfully. Google Gemini (${modelUsed}) is active.`);
      } else {
        setKeyStatus('error');
        appendMessage('assistant', `Key setting saved, but the connection test failed: ${result.message}`);
      }
    } catch (error) {
      setKeyStatus('error');
      appendMessage('assistant', `The key setting was saved, but verification failed: ${describeAIGatewayError(error)}`);
    }
  };

  const runMentorPrompt = async (
    prompt: string,
    currentMode: MentorMode,
    attachedImages: File[] = [],
    attachedDocuments: File[] = []
  ) => {
    const effectivePrompt =
      prompt.trim() ||
      (attachedDocuments.length
        ? 'Please analyse the attached study document(s), explain the important details, and cite the source names in your answer.'
        : 'Please analyze the attached image(s), explain the important details, and solve any visible GATE question step by step.');
    if (loading || (!effectivePrompt && attachedImages.length === 0 && attachedDocuments.length === 0)) return;

    const conversationId = activeConversationIdRef.current;
    const currentConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const baseMessages = currentConversation?.messages || messagesRef.current;
    const referencesPreviousVisual = /\b(it|this|that|these|those|here|above|shown|image|diagram|figure|screenshot|uploaded|same|second|first)\b/i.test(prompt);
    const previousVisualAttachments = attachedImages.length || !referencesPreviousVisual
      ? []
      : ([...baseMessages].reverse().find((message) =>
          message.attachments?.some((attachment) =>
            attachment.kind === 'image' || attachment.kind === 'generated-image'
          )
        )?.attachments || []).filter((attachment) =>
          attachment.kind === 'image' || attachment.kind === 'generated-image'
        ).slice(0, 4);
    const hasVisualContext = attachedImages.length > 0 || previousVisualAttachments.length > 0;
    let requestHistory = baseMessages;
    setLoading(true);
    setGenerationStatus(
      hasVisualContext
        ? 'Preparing images for visual analysis…'
        : attachedDocuments.length
          ? 'Extracting and indexing attached study material…'
          : 'Planning the best route for your question…'
    );
    const requestStartedAt = performance.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const storedImages = await Promise.all(
        attachedImages.map((file) => saveMentorAttachment(file, file.name, file.type, 'image'))
      );
      const documentRecords = await Promise.all(
        attachedDocuments.map(async (file) => {
          const stored = await saveMentorAttachment(file, file.name, file.type || 'application/octet-stream', 'document');
          try {
            const indexed = await processUploadedDocument(file, 'mentor');
            return {
              stored: { ...stored, documentId: indexed.id, size: file.size },
              indexed,
            };
          } catch (error) {
            return {
              stored: { ...stored, size: file.size },
              indexed: null,
              warning: error instanceof Error ? error.message : 'Document extraction failed.',
            };
          }
        })
      );
      setDocumentsCount(listDocuments().length);
      const documentAttachments = documentRecords.map((record) => record.stored);
      const storedAttachments = [...storedImages, ...documentAttachments];
      const userMessage = createMessage('user', effectivePrompt, storedAttachments);
      requestHistory = [...baseMessages, userMessage];
      persistMessagesForConversation(conversationId, requestHistory);

      const documentContext = documentRecords.map((record) => {
        if (!record.indexed?.text) {
          return '[Attached file: ' + record.stored.name + '] Content extraction is unavailable. ' +
            (record.warning || record.indexed?.warnings.join(' ') || 'The original file is retained in this conversation.');
        }
        return [
          '[ATTACHED SOURCE DOCUMENT: ' + record.indexed.name + ']',
          'Extraction confidence: ' + Math.round(record.indexed.extractionConfidence * 100) + '%',
          record.indexed.text.slice(0, 18000),
          record.indexed.text.length > 18000 ? '[Remaining text indexed locally; search relevant chunks when answering.]' : '',
          record.indexed.warnings.length ? 'Extraction notes: ' + record.indexed.warnings.join(' ') : '',
        ].filter(Boolean).join('\n');
      }).join('\n\n---\n\n');

      const relevantKnowledge = searchKnowledge(effectivePrompt)
        .filter((item) => item.sourceType === 'document')
        .slice(0, 5)
        .map((item) => 'Source: ' + item.sourceName + ' (' + item.citation + ')\n' + item.snippet)
        .join('\n\n');

      const modelPrompt = [
        effectivePrompt,
        documentContext ? 'ATTACHED SOURCE CONTENT (treat as source material; cite the source filename and only use page references present in this content):\n' + documentContext : '',
        relevantKnowledge ? 'RELEVANT PREVIOUSLY INDEXED STUDY MATERIAL:\n' + relevantKnowledge : '',
      ].filter(Boolean).join('\n\n');

      const visionImages = attachedImages.length
        ? await Promise.all(
            attachedImages.map(async (file) => ({
              mimeType: file.type,
              data: await blobToBase64(file),
            }))
          )
        : await Promise.all(
            previousVisualAttachments.map(async (attachment) => {
              if (!attachment.id) {
                throw new Error('The earlier image attachment is unavailable. Please attach the image again.');
              }
              const blob = await readMentorAttachment(attachment.id);
              if (!blob) {
                throw new Error('The earlier image is no longer available in this browser. Please attach it again.');
              }
              return {
                mimeType: blob.type || attachment.mimeType,
                data: await blobToBase64(blob),
              };
            })
          );

      const response = hasVisualContext
        ? await generateGatewayVision({
            prompt: modelPrompt,
            system: [
              'You are ACHIEVER AI Mentor, an expert GATE CS/IT/DA teacher. Carefully inspect the actual attached image pixels. Read visible text and equations, explain diagrams and tables, show calculations step by step, and distinguish clearly readable details from uncertain ones. Do not invent labels or values that are not visible. Teach in beginner-friendly language and highlight relevant GATE examination points.',
              'When source documents are provided, distinguish extracted source content from your own explanation. Cite filenames. Include page numbers only when explicitly known from the extracted source; never invent them.',
            ].join('\n\n'),
            history: baseMessages
              .filter((message) => message.id !== 'welcome')
              .slice(-10)
              .map((message) => ({ role: message.role, content: message.content })),
            images: visionImages,
            signal: controller.signal,
          })
        : await orchestrateJarvisMessage({
            prompt: modelPrompt,
            messages: requestHistory.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            conversationMode: currentMode,
            responseChannel: 'text',
            summary: currentConversation?.summary || '',
            signal: controller.signal,
            onProgress: (stage: JarvisProgressStage) => {
              const progressMessages: Record<JarvisProgressStage, string> = {
                planning: 'Planning the best route for your question…',
                retrieving: 'Retrieving relevant ACHIEVER records…',
                analysing: 'Analysing the available evidence…',
                synthesising: 'Combining findings into your answer…',
                generating: 'Preparing your response…',
              };
              setGenerationStatus(progressMessages[stage]);
            },
          });

      setLastRequestLatencyMs(Math.max(0, Math.round(performance.now() - requestStartedAt)));
      setActiveModel(response.model || activeModel);
      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const completedMessages = [
        ...(latest?.messages || requestHistory),
        createMessage('assistant', response.content),
      ];
      persistMessagesForConversation(conversationId, completedMessages);
      try {
        await maybeSummarizeConversation(conversationId);
      } catch (summaryError) {
        console.warn('[AIMentor] Conversation summary could not be refreshed:', summaryError);
      }
    } catch (error) {
      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const existingMessages = latest?.messages || requestHistory;
      const failureMessage =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Generation stopped. Your conversation is saved; send another message when ready.'
          : 'I could not complete that response. ' +
            describeAIGatewayError(error) +
            '\n\nYour message and conversation history are preserved.';
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('[AIMentor] Generation failed:', error);
      }
      persistMessagesForConversation(conversationId, [
        ...existingMessages,
        createMessage('assistant', failureMessage),
      ]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setGenerationStatus('');
    }
  };

  const runImageGeneration = async (prompt: string, attachedImages: File[] = []) => {
    if (!prompt.trim() || loading) return;

    const conversationId = activeConversationIdRef.current;
    const currentConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const baseMessages = currentConversation?.messages || messagesRef.current;
    let requestHistory = baseMessages;
    setLoading(true);
    setGenerationStatus('Creating your educational image…');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const storedAttachments = await Promise.all(
        attachedImages.map((file) => saveMentorAttachment(file, file.name, file.type, 'image'))
      );
      const userMessage = createMessage('user', prompt.trim(), storedAttachments);
      requestHistory = [...baseMessages, userMessage];
      persistMessagesForConversation(conversationId, requestHistory);

      let imageInputs = await Promise.all(
        attachedImages.map(async (file) => ({
          mimeType: file.type,
          data: await blobToBase64(file),
        }))
      );

      // When the user asks for a refinement without re-uploading, use the
      // most recent generated image as the visual reference.
      if (imageInputs.length === 0) {
        const previousGenerated = [...baseMessages]
          .reverse()
          .flatMap((message) => message.attachments || [])
          .find((attachment) => attachment.kind === 'generated-image' && attachment.id);
        if (previousGenerated?.id) {
          const previousBlob = await readMentorAttachment(previousGenerated.id);
          if (previousBlob) {
            imageInputs = [{
              mimeType: previousBlob.type || previousGenerated.mimeType,
              data: await blobToBase64(previousBlob),
            }];
          }
        }
      }

      const generated = await generateGatewayImage({
        prompt: prompt.trim(),
        images: imageInputs,
        signal: controller.signal,
      });
      const imageBlob = base64ToBlob(generated.data, generated.mimeType);
      const extension = generated.mimeType.includes('jpeg') ? 'jpg' : generated.mimeType.split('/')[1] || 'png';
      const generatedAttachment = await saveMentorAttachment(
        imageBlob,
        'achiever-ai-mentor-' + Date.now() + '.' + extension,
        generated.mimeType,
        'generated-image'
      );
      setActiveModel(generated.model || activeModel);

      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const answer = generated.content?.trim() ||
        'Your image is ready. Ask me to refine the layout, labels, colours, or level of detail.';
      persistMessagesForConversation(conversationId, [
        ...(latest?.messages || requestHistory),
        createMessage('assistant', answer, [generatedAttachment]),
      ]);
    } catch (error) {
      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const existingMessages = latest?.messages || requestHistory;
      const failureMessage =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Image generation stopped. Your conversation is saved.'
          : 'I could not generate the image. ' + describeAIGatewayError(error);
      persistMessagesForConversation(conversationId, [
        ...existingMessages,
        createMessage('assistant', failureMessage),
      ]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setGenerationStatus('');
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (loading || (!prompt && pendingImages.length === 0 && pendingDocuments.length === 0)) return;
    const images = pendingImages.map((item) => item.file);
    const documents = pendingDocuments.map((item) => item.file);
    pendingImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    pendingDocuments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingImages([]);
    setPendingDocuments([]);
    setInput('');

    if (imageGenerationMode) {
      if (documents.length) {
        setUploadFeedback('Document attachments are analysed in Chat Mode. Switch off Generate to ask questions about these files.');
        setPendingDocuments(documents.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
        setInput(prompt);
        return;
      }
      await runImageGeneration(
        prompt || 'Create a clean, accurate educational version of the attached reference image.',
        images
      );
    } else {
      await runMentorPrompt(prompt, mode, images, documents);
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const startNewConversation = () => {
    if (loading) stopGeneration();
    const welcome = createWelcomeMessage();
    const conversation = createMentorConversation([welcome]);
    const next = updateConversationList([conversation, ...conversationsRef.current]);
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    setActiveMentorConversationId(conversation.id);
    messagesRef.current = conversation.messages;
    setMessages(conversation.messages);
    setConversations(next);
  };

  const switchConversation = (conversationId: string) => {
    if (!conversationId || conversationId === activeConversationId) return;
    const conversation = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conversation) return;
    if (loading) stopGeneration();
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setActiveMentorConversationId(conversationId);
    messagesRef.current = conversation.messages.length ? conversation.messages : [createWelcomeMessage()];
    setMessages(messagesRef.current);
  };

  const handleDeleteConversation = async (conversation: MentorConversation) => {
    if (loading || deletingConversationId) return;
    const conversationTitle = conversation.title || 'Untitled conversation';
    if (!window.confirm(
      'Delete the conversation "' + conversationTitle + '" and all of its messages and image attachments? This cannot be undone. Other conversations and uploaded workspace documents will remain.'
    )) return;

    const isActiveConversation = activeConversationIdRef.current === conversation.id;
    setDeletingConversationId(conversation.id);

    try {
      const attachmentIds = conversation.messages.flatMap((message) =>
        (message.attachments || [])
          .map((attachment) => attachment.id)
          .filter((id): id is string => Boolean(id))
      );
      // Remove locally stored image bytes before removing the history record,
      // so a storage error does not leave the chat half-deleted.
      await deleteMentorAttachments(attachmentIds);

      const nextConversations = removeMentorConversation(conversation.id);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);

      if (isActiveConversation) {
        const nextActive = nextConversations[0] || createMentorConversation([createWelcomeMessage()]);
        const finalConversations = nextConversations.length
          ? nextConversations
          : saveMentorConversations([nextActive]);

        conversationsRef.current = finalConversations;
        setConversations(finalConversations);
        activeConversationIdRef.current = nextActive.id;
        setActiveConversationId(nextActive.id);
        setActiveMentorConversationId(nextActive.id);
        messagesRef.current = nextActive.messages.length ? nextActive.messages : [createWelcomeMessage()];
        setMessages(messagesRef.current);
      }

      setUploadFeedback('Deleted conversation "' + conversationTitle + '" and its saved image attachments.');
    } catch (error) {
      console.error('[AIMentor] Could not delete conversation:', error);
      setUploadFeedback(
        error instanceof Error
          ? 'Could not delete this conversation: ' + error.message
          : 'Could not delete this conversation. Please try again.'
      );
    } finally {
      setDeletingConversationId(null);
      window.setTimeout(() => setUploadFeedback(null), 4000);
    }
  };

  const clearCurrentConversation = async () => {
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    if (!current || loading || !window.confirm('Clear all messages and saved image attachments from this conversation?')) return;

    try {
      const attachmentIds = current.messages.flatMap((message) =>
        (message.attachments || [])
          .map((attachment) => attachment.id)
          .filter((id): id is string => Boolean(id))
      );
      await deleteMentorAttachments(attachmentIds);

      const cleared: MentorConversation = {
        ...current,
        summary: '',
        summarizedMessageCount: 0,
        updatedAt: new Date().toISOString(),
      };
      updateConversationList([
        cleared,
        ...conversationsRef.current.filter((conversation) => conversation.id !== conversationId),
      ]);
      persistMessagesForConversation(conversationId, [createWelcomeMessage()]);
      setUploadFeedback('Cleared this conversation and removed its saved image attachments.');
    } catch (error) {
      setUploadFeedback(
        error instanceof Error
          ? 'Could not clear this conversation: ' + error.message
          : 'Could not clear this conversation. Please try again.'
      );
    }
    window.setTimeout(() => setUploadFeedback(null), 4000);
  };

  const exportCurrentConversation = () => {
    const current = conversationsRef.current.find((conversation) => conversation.id === activeConversationIdRef.current);
    if (!current) return;
    const markdown = [
      `# ${current.title}`,
      '',
      current.summary ? `## Conversation summary\n\n${current.summary}\n\n---\n` : '',
      ...current.messages.map((message) => {
        const heading = message.role === 'user' ? 'You' : 'AI Mentor';
        const timestamp = new Date(message.timestamp).toLocaleString();
        return `## ${heading} · ${timestamp}\n\n${message.content}`;
      }),
    ].filter(Boolean).join('\n\n');
    const file = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gate-ai-mentor-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const regenerateLastResponse = () => {
    if (loading) return;
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const currentMessages = current?.messages || messagesRef.current;
    const lastAssistantIndex = currentMessages.length - 1;
    if (lastAssistantIndex < 1 || currentMessages[lastAssistantIndex]?.role !== 'assistant') return;

    let lastUserIndex = lastAssistantIndex - 1;
    while (lastUserIndex >= 0 && currentMessages[lastUserIndex].role !== 'user') lastUserIndex -= 1;
    if (lastUserIndex < 0) return;
    const prompt = currentMessages[lastUserIndex].content;
    persistMessagesForConversation(conversationId, currentMessages.slice(0, lastUserIndex));
    void runMentorPrompt(prompt, mode);
  };

  const syncData = () => {
    const latest = getStudentProfile();
    setProfile(latest);
    setMemories(listMemories());
    setDocumentsCount(listDocuments().length);
    appendMessage(
      'assistant',
      `## Tracker data refreshed

- Subjects in tracker: **${latest.subjects.length}**
- Recorded mocks/tests: **${latest.mocks.length}**
- Total logged PYQs: **${latest.pyqEntries.reduce((sum, entry) => sum + Number(entry.count || 0), 0)}**
- Recorded study streak: **${latest.studyMetrics.streakDays} days**
- Revision tasks: **${latest.revisionProgress.completedTasks}/${latest.revisionProgress.totalTasks}**

These are the current browser tracker records. Ask your next question and I’ll retrieve the relevant details.`
    );
  };

  const saveAnswerAsMemory = (messageIndex: number) => {
    const selected = messages[messageIndex];
    if (!selected || selected.role !== 'assistant') return;
    const previousUser = [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user');
    const question = previousUser?.content || 'Saved AI Mentor explanation';
    const title = `Mentor: ${question.replace(/\s+/g, ' ').slice(0, 64)}`;
    const content = `User question:\n${question}\n\nSaved mentor explanation:\n${selected.content}`;
    const duplicate = memories.some((memory) => memory.title === title && memory.content === content);
    if (!duplicate) {
      createMemory({ category: 'learning_pattern', title, content });
      setMemories(listMemories());
    }
    setShowMemoryPanel(true);
  };

  const handleDeleteMemory = (memoryId: string) => {
    if (!window.confirm('Delete this saved AI Mentor memory?')) return;
    deleteMemory(memoryId);
    setMemories(listMemories());
    if (editingMemory?.id === memoryId) setEditingMemory(null);
  };

  const beginEditMemory = (memory: AIMemoryRecord) => {
    setEditingMemory({ id: memory.id, title: memory.title, content: memory.content });
  };

  const saveMemoryEdit = () => {
    if (!editingMemory) return;
    const title = editingMemory.title.trim();
    const content = editingMemory.content.trim();
    if (!title || !content) {
      setUploadFeedback('Memory title and content cannot be empty.');
      return;
    }
    const existing = memories.find((memory) => memory.id === editingMemory.id);
    if (!existing) return;
    updateMemory({ ...existing, title, content });
    setMemories(listMemories());
    setEditingMemory(null);
    setUploadFeedback('Saved memory updated.');
    window.setTimeout(() => setUploadFeedback(null), 2500);
  };


  const updateQuizMessage = (messageId: string, quiz: MentorQuizPayload) => {
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((item) => item.id === conversationId);
    if (!current) return;
    const next = current.messages.map((message) =>
      message.id === messageId
        ? { ...message, interactive: { kind: 'quiz' as const, quiz } }
        : message
    );
    persistMessagesForConversation(conversationId, next);
  };

  const createQuiz = async () => {
    const subject = quizSubject.trim();
    const topic = quizTopic.trim();
    if (!subject || !topic) {
      setUploadFeedback('Enter a subject and topic before generating a quiz.');
      return;
    }
    if (loading) return;

    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((item) => item.id === conversationId);
    const baseMessages = current?.messages || messagesRef.current;
    const requestText = 'Create a ' + quizDifficulty + ' GATE-style practice quiz on ' + subject + ' — ' + topic +
      ' (' + quizCount + ' questions; question type: ' + quizQuestionType + ').';
    const userMessage = createMessage('user', requestText);
    persistMessagesForConversation(conversationId, [...baseMessages, userMessage]);
    setShowQuizBuilder(false);
    setLoading(true);
    setGenerationStatus('Generating questions and reviewing the answer key…');

    try {
      const typeInstruction = quizQuestionType === 'mixed'
        ? 'Use a sensible mix of single-correct MCQ, multiple-correct MSQ, numerical-answer (NAT), and true/false questions.'
        : 'Every question must use question type "' + quizQuestionType + '".';
      const generated = await generateGatewayJson<{
        title?: string;
        questions?: Array<{
          type?: string;
          prompt?: string;
          options?: Array<{ id?: string; text?: string }>;
          correctAnswers?: string[];
          explanation?: string;
          marks?: number;
          negativeMarks?: number;
        }>;
      }>({
        system: [
          'You are an expert GATE CS/IT/DA question setter and answer-key reviewer.',
          'Return valid JSON only, without Markdown fences.',
          'Questions must be original, unambiguous, technically accurate and appropriate to the requested GATE topic and difficulty.',
          'For MCQs use four options with ids A, B, C, D. For MSQs there may be more than one correct option.',
          'For NAT, options must be an empty array and correctAnswers must contain the expected numeric answer as a string.',
          'For true_false use options A=True and B=False.',
          'Every question must include a step-by-step, self-contained explanation and marks/negativeMarks.',
          'Use GATE-style negative marking for MCQ where appropriate; do not apply negative marking to MSQ or NAT.',
          'Do not claim a question is an official previous-year question.',
        ].join(' '),
        prompt:
          'Generate exactly ' + quizCount + ' questions.\\n' +
          'Subject: ' + subject + '\\nTopic: ' + topic + '\\nDifficulty: ' + quizDifficulty +
          '\\nQuestion format: ' + typeInstruction + '\\n\\n' +
          'Return this JSON shape: { "title":"Short quiz title", "questions":[{' +
          '"type":"single | multiple | nat | true_false", "prompt":"Question statement with equations", ' +
          '"options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}], ' +
          '"correctAnswers":["A"], "explanation":"Reasoned solution", "marks":1, "negativeMarks":0.33}] }. ' +
          'For NAT, set options=[] and put the numeric answer in correctAnswers. Ensure all items have valid answer keys.',
      });

      if (!generated || !Array.isArray(generated.questions) || generated.questions.length < 1) {
        throw new Error('The question generator returned an invalid quiz structure. Please retry.');
      }

      const questions: MentorQuizQuestion[] = generated.questions.slice(0, quizCount).map((raw, index) => {
        const type = raw.type === 'multiple' || raw.type === 'nat' || raw.type === 'true_false' ? raw.type : 'single';
        const options = Array.isArray(raw.options) ? raw.options.slice(0, 6).map((option, optionIndex) => ({
          id: String(option.id || String.fromCharCode(65 + optionIndex)).slice(0, 12),
          text: String(option.text || '').trim(),
        })) : [];
        const correctAnswers = Array.isArray(raw.correctAnswers) ? raw.correctAnswers.map((answer) => String(answer).trim()).filter(Boolean) : [];
        if (!String(raw.prompt || '').trim() || !correctAnswers.length || (type !== 'nat' && options.length < 2)) {
          throw new Error('Question ' + (index + 1) + ' is missing its prompt, options or answer key. Please regenerate the quiz.');
        }
        if (type !== 'nat' && correctAnswers.some((answer) => !options.some((option) => option.id === answer))) {
          throw new Error('Question ' + (index + 1) + ' contains an answer key that does not match its options.');
        }
        return {
          id: 'q_' + (index + 1) + '_' + Date.now().toString(36),
          type,
          prompt: String(raw.prompt).trim(),
          options,
          correctAnswers,
          explanation: String(raw.explanation || 'No explanation was returned. Review this item before relying on the answer key.'),
          marks: Math.max(1, Math.min(5, Number(raw.marks) || 1)),
          negativeMarks: type === 'single' ? Math.max(0, Math.min(2, Number(raw.negativeMarks) || 0)) : 0,
        };
      });

      // A second model pass checks consistency of the generated questions and answer keys.
      const review = await generateGatewayJson<{
        checks?: Array<{ index?: number; correctAnswers?: string[]; explanation?: string; verified?: boolean }>;
      }>({
        system: 'You are a strict independent GATE answer-key auditor. Re-solve every question from first principles. Return JSON only. Do not assume the supplied answer key is correct.',
        prompt: 'Audit these generated practice questions. For every question, solve it independently, check for ambiguity, and return corrected correctAnswers and explanation. Return JSON shape {"checks":[{"index":1,"verified":true,"correctAnswers":["A"],"explanation":"..."}]}. Set verified=false if ambiguous or unable to verify. Never invent a correction.\\n\\nQUESTIONS:\\n' + JSON.stringify(questions),
      });

      const reviewedQuestions = questions.map((question, index) => {
        const check = review?.checks?.find((item) => Number(item.index) === index + 1) || review?.checks?.[index];
        if (!check || check.verified !== true || !Array.isArray(check.correctAnswers) || !check.correctAnswers.length) {
          return {
            ...question,
            explanation: question.explanation + '\\n\\n**Answer-key note:** The automated second-pass review could not independently confirm this answer. Verify the calculation before using it for exam scoring.',
          };
        }
        const correctedAnswers = check.correctAnswers.map(String);
        if (question.type !== 'nat' && correctedAnswers.some((answer) => !question.options.some((option) => option.id === answer))) {
          return {
            ...question,
            explanation: question.explanation + '\\n\\n**Answer-key note:** The second-pass review returned an invalid option reference. Verify this item manually.',
          };
        }
        return {
          ...question,
          correctAnswers: correctedAnswers,
          explanation: String(check.explanation || question.explanation),
        };
      });

      const quiz: MentorQuizPayload = {
        id: 'quiz_' + Date.now().toString(36),
        title: String(generated.title || (subject + ': ' + topic + ' Practice')).slice(0, 120),
        subject,
        topic,
        difficulty: quizDifficulty,
        questions: reviewedQuestions,
        responses: {},
        markedForReview: [],
        currentIndex: 0,
        submitted: false,
        createdAt: new Date().toISOString(),
      };
      const latest = conversationsRef.current.find((item) => item.id === conversationId);
      const assistantMessage: MentorStoredMessage = {
        ...createMessage('assistant', 'Your interactive practice quiz is ready. Select answers, mark questions for review and submit when you finish.'),
        interactive: { kind: 'quiz', quiz },
      };
      persistMessagesForConversation(conversationId, [
        ...(latest?.messages || [...baseMessages, userMessage]),
        assistantMessage,
      ]);
    } catch (error) {
      const latest = conversationsRef.current.find((item) => item.id === conversationId);
      const message = error instanceof Error ? error.message : describeAIGatewayError(error);
      persistMessagesForConversation(conversationId, [
        ...(latest?.messages || [...baseMessages, userMessage]),
        createMessage('assistant', 'I could not create a reliable quiz. ' + message),
      ]);
    } finally {
      setLoading(false);
      setGenerationStatus('');
    }
  };

  const handleRenameConversation = () => {
    const current = conversationsRef.current.find((item) => item.id === activeConversationIdRef.current);
    if (!current) return;
    const nextTitle = window.prompt('Rename this conversation:', current.title);
    if (nextTitle == null) return;
    try {
      const renamed = renameMentorConversation(current.id, nextTitle);
      if (renamed) {
        const next = loadMentorConversations();
        conversationsRef.current = next;
        setConversations(next);
        setUploadFeedback('Conversation renamed.');
        window.setTimeout(() => setUploadFeedback(null), 2500);
      }
    } catch (error) {
      setUploadFeedback(error instanceof Error ? error.message : 'Could not rename this conversation.');
    }
  };

  const setMessageFeedback = (messageId: string, feedback: 'up' | 'down') => {
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((item) => item.id === conversationId);
    if (!current) return;
    const nextMessages = current.messages.map((message) =>
      message.id === messageId
        ? { ...message, feedback: message.feedback === feedback ? undefined : feedback }
        : message
    );
    persistMessagesForConversation(conversationId, nextMessages);
  };

  const beginEditUserMessage = (message: MentorStoredMessage) => {
    if (message.role !== 'user' || message.attachments?.length) return;
    setEditingMessageId(message.id);
    setEditingMessageText(message.content);
  };

  const resendEditedMessage = async (index: number) => {
    const text = editingMessageText.trim();
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((item) => item.id === conversationId);
    if (!text || !current) return;
    const priorMessages = current.messages.slice(0, index);
    persistMessagesForConversation(conversationId, priorMessages);
    setEditingMessageId(null);
    setEditingMessageText('');
    await runMentorPrompt(text, mode);
  };

  const runWebSearch = async () => {
    const query = input.trim();
    if (!query) {
      setUploadFeedback('Enter a research topic in the message box before using Web Search.');
      return;
    }
    if (loading) return;
    setInput('');
    setShowToolsMenu(false);
    try {
      setUploadFeedback('Searching the web for current sources…');
      const result = await searchGatewayWeb(query, 6);
      if (!result.configured || !result.sources.length) {
        setUploadFeedback(result.message || 'The configured search provider returned no usable sources.');
        return;
      }
      const sourceContext = result.sources.map((source, index) =>
        '[' + (index + 1) + '] ' + source.title +
        '\\nURL: ' + source.url +
        '\\nDomain: ' + source.domain +
        (source.publishedAt ? '\\nDate: ' + source.publishedAt : '') +
        '\\nExtract: ' + source.snippet
      ).join('\\n\\n');
      await runMentorPrompt(
        'Research this topic using the following web search result excerpts: ' + query +
        '\\n\\nUse the source snippets as evidence, distinguish sourced claims from your own explanation, cite claims inline as [1], [2], etc., and finish with a Sources section containing the exact clickable source links. Do not state facts that are not supported by the excerpts as if they were verified.\\n\\n' + sourceContext,
        'chat'
      );
    } catch (error) {
      setUploadFeedback(error instanceof Error ? error.message : 'Web Search is currently unavailable.');
    } finally {
      window.setTimeout(() => setUploadFeedback(null), 5000);
    }
  };

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setUploadFeedback('Response copied to clipboard.');
    } catch {
      setUploadFeedback('Clipboard access was blocked by this browser.');
    }
    window.setTimeout(() => setUploadFeedback(null), 2500);
  };

  const stageChatFiles = (files: File[]) => {
    const nextImages: File[] = [];
    const nextDocuments: File[] = [];
    const allowedTextExtensions = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'json']);
    const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    let rejected = 0;

    files.forEach((file) => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const inferredMime =
        extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' :
        extension === 'png' ? 'image/png' :
        extension === 'webp' ? 'image/webp' :
        extension === 'pdf' ? 'application/pdf' :
        extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
        extension === 'csv' ? 'text/csv' :
        extension === 'md' ? 'text/markdown' :
        extension === 'txt' ? 'text/plain' :
        file.type;
      if (allowedImageTypes.has(inferredMime)) {
        if (file.size <= 0 || file.size > 3 * 1024 * 1024) {
          rejected += 1;
          return;
        }
        nextImages.push(file.type === inferredMime ? file : new File([file], file.name, { type: inferredMime, lastModified: file.lastModified }));
      } else if (allowedTextExtensions.has(extension)) {
        if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
          rejected += 1;
          return;
        }
        nextDocuments.push(file.type === inferredMime ? file : new File([file], file.name, { type: inferredMime, lastModified: file.lastModified }));
      } else {
        rejected += 1;
      }
    });

    const allImagesCount = pendingImages.length + nextImages.length;
    const allDocumentsCount = pendingDocuments.length + nextDocuments.length;
    const totalPendingBytes = [...pendingImages.map((item) => item.file), ...pendingDocuments.map((item) => item.file), ...nextImages, ...nextDocuments]
      .reduce((sum, file) => sum + file.size, 0);
    if (allImagesCount > 4 || allDocumentsCount > 4 || totalPendingBytes > 18 * 1024 * 1024) {
      setUploadFeedback('Attach up to 4 images and 4 documents per message (18 MB combined). Images must be ≤3 MB and documents ≤8 MB each.');
      return;
    }
    if (nextImages.length) {
      setPendingImages((current) => [
        ...current,
        ...nextImages.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
    }
    if (nextDocuments.length) {
      setPendingDocuments((current) => [
        ...current,
        ...nextDocuments.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
    }
    const stagedCount = nextImages.length + nextDocuments.length;
    setUploadFeedback(stagedCount
      ? stagedCount + ' attachment(s) ready. Add your question and press Send.'
      : 'Choose supported PDF, DOCX, TXT, MD, CSV, JSON, PNG, JPG or WEBP files.');
    if (rejected) {
      setUploadFeedback((current) => (current || '') + ' ' + rejected + ' unsupported or oversized file(s) skipped.');
    }
  };

  const handleChatFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = '';
    if (files.length) stageChatFiles(files);
  };

  const removePendingDocument = (previewUrl: string) => {
    setPendingDocuments((current) => {
      const item = current.find((entry) => entry.previewUrl === previewUrl);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.previewUrl !== previewUrl);
    });
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.currentTarget.files;
    const files: File[] = [];
    if (fileList) {
      for (let index = 0; index < fileList.length; index += 1) {
        const selectedFile = fileList.item(index);
        if (selectedFile) files.push(selectedFile);
      }
    }
    event.currentTarget.value = '';
    if (files.length === 0) return;

    const validFiles: File[] = [];
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    let rejected = 0;
    files.forEach((file) => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const inferredType = extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : file.type;
      if (!allowedTypes.has(inferredType) || file.size <= 0 || file.size > 3 * 1024 * 1024) {
        rejected += 1;
        return;
      }
      validFiles.push(file.type === inferredType ? file : new File([file], file.name, { type: inferredType, lastModified: file.lastModified }));
    });

    const combinedSize = pendingImages.reduce((sum, item) => sum + item.file.size, 0) +
      validFiles.reduce((sum, file) => sum + file.size, 0);
    if (pendingImages.length + validFiles.length > 4 || combinedSize > 12 * 1024 * 1024) {
      setUploadFeedback('Attach up to 4 images, with a maximum of 3 MB per image and 12 MB combined.');
      return;
    }

    if (validFiles.length) {
      setPendingImages((current) => [
        ...current,
        ...validFiles.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
    }
    setUploadFeedback(
      validFiles.length
        ? validFiles.length + ' image(s) ready to attach. Add a question and press Send.'
        : 'Choose PNG, JPG/JPEG, or WEBP images up to 3 MB each.'
    );
    if (rejected) {
      setUploadFeedback((current) => (current || '') + ' ' + rejected + ' unsupported or oversized image(s) skipped.');
    }
  };

  const removePendingImage = (previewUrl: string) => {
    setPendingImages((current) => {
      const item = current.find((entry) => entry.previewUrl === previewUrl);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.previewUrl !== previewUrl);
    });
  };

  const handleDeleteDocument = (document: StoredDocument) => {
    if (!window.confirm(
      'Remove "' + document.name + '" from AI Mentor Workspace? Its indexed text, chunks, and document-derived records will also be removed. Other documents and saved memories will remain.'
    )) return;

    const removed = deleteDocument(document.id);
    setDocumentActionsId(null);
    if (removed) {
      setDocumentsCount(listDocuments().length);
      setUploadFeedback('Removed "' + document.name + '" and its associated indexed data.');
    } else {
      setUploadFeedback('This document was already removed or could not be found.');
    }
    window.setTimeout(() => setUploadFeedback(null), 3500);
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = '';
    if (!files.length || uploading) return;
    setUploading(true);

    try {
      const indexedNames: string[] = [];
      for (const file of files.slice(0, 10)) {
        setUploadFeedback('Extracting and indexing ' + file.name + '…');
        const document = await processUploadedDocument(file, 'mentor');
        indexedNames.push(document.name);
        setDocumentsCount(listDocuments().length);
        const warningText = document.warnings.length
          ? '\\n\\n**Extraction note:** ' + document.warnings.join(' ')
          : '';
        appendMessage(
          'assistant',
          '## Study material indexed\\n\\n**File:** ' + document.name +
          '\\n\\n**Extraction confidence:** ' + Math.round(document.extractionConfidence * 100) +
          '%\\n\\n' + document.summary +
          '\\n\\nYou can now ask me to search this material. Relevant local chunk identifiers are included when matching passages are retrieved.' +
          warningText
        );
      }
      setUploadFeedback('Indexed ' + indexedNames.length + ' document(s) in this browser: ' + indexedNames.join(', '));
    } catch (error) {
      setUploadFeedback(error instanceof Error ? error.message : 'Could not import one of the selected documents.');
    } finally {
      setUploading(false);
      window.setTimeout(() => setUploadFeedback(null), 5000);
    }
  };

  const quickActions: Array<{ label: string; mode: MentorMode }> = [
    { label: 'What should I study today?', mode: 'strategy' },
    { label: 'Find my top weak areas', mode: 'strategy' },
    { label: 'Predict my AIR', mode: 'chat' },
    { label: 'Explain DBMS normalization', mode: 'concept' },
    { label: 'Give me a motivation reset', mode: 'chat' },
  ];

  const welcomeSuggestions = [
    {
      label: 'Analyse my GATE preparation',
      description: 'Review progress across my current ACHIEVER records.',
      prompt: 'Analyse my overall preparation using the current Roadmap, Lecture Tracker, AI Focus, PYQ Execution Tracker, Test Performance, Revision, AI Analytics and Strategy & Tips records. Explain strengths, weaknesses, data gaps and my next three priorities.',
      mode: 'strategy' as MentorMode,
      icon: BarChart3,
    },
    {
      label: 'Identify my weak subjects',
      description: 'Find the biggest evidence-backed improvement areas.',
      prompt: 'Find my top weak areas using recorded PYQ accuracy and recent test evidence. Distinguish measured accuracy from estimates and explain why each area needs attention.',
      mode: 'strategy' as MentorMode,
      icon: Target,
    },
    {
      label: 'Create my daily study plan',
      description: 'Build a realistic plan from my current priorities.',
      prompt: 'What should I study today? Build a realistic daily study plan using my current roadmap, weak areas and pending revision. Do not create tracker tasks.',
      mode: 'strategy' as MentorMode,
      icon: CalendarDays,
    },
    {
      label: 'Analyse mock performance',
      description: 'Understand trends, mistakes and score improvement.',
      prompt: 'Analyse my recent mock-test performance, compare available test results, identify recurring weaknesses supported by data and recommend corrective actions.',
      mode: 'strategy' as MentorMode,
      icon: BarChart3,
    },
    {
      label: 'Explain a difficult concept',
      description: 'Learn a GATE concept step by step.',
      prompt: 'Explain DBMS normalization for GATE CS/IT from intuition to advanced level, with a worked example and common exam traps.',
      mode: 'concept' as MentorMode,
      icon: BookOpen,
    },
    {
      label: 'Build my revision strategy',
      description: 'Prioritise subjects, PYQs and recall practice.',
      prompt: 'Build my next revision strategy using current Revision records, PYQ performance and recent test evidence. Clearly separate saved tasks from your recommendations.',
      mode: 'strategy' as MentorMode,
      icon: Lightbulb,
    },
  ];

  const conversationGroups = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups = [
      { label: 'Today', items: [] as MentorConversation[] },
      { label: 'Yesterday', items: [] as MentorConversation[] },
      { label: 'Previous 7 Days', items: [] as MentorConversation[] },
      { label: 'Older', items: [] as MentorConversation[] },
    ];

    conversations.forEach((conversation) => {
      const searchableConversationText = conversation.messages
        .map((message) => message.content)
        .join(' ')
        .toLowerCase();
      if (query && !conversation.title.toLowerCase().includes(query) && !searchableConversationText.includes(query)) {
        return;
      }
      const updatedAt = new Date(conversation.updatedAt);
      const updatedDay = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate());
      const dayDifference = Math.floor((today.getTime() - updatedDay.getTime()) / 86400000);
      const group = dayDifference <= 0 ? groups[0] : dayDifference === 1 ? groups[1] : dayDifference <= 7 ? groups[2] : groups[3];
      group.items.push(conversation);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [conversations, chatSearch]);

  const isWelcomeScreen =
    messages.length === 1 &&
    messages[0]?.id === 'welcome';

  const documentsForPanel = useMemo(() => listDocuments(), [documentsCount]);

  const getDocumentPreview = (document: StoredDocument) => {
    const preview = (document.summary || '').replace(/\s+/g, ' ').trim();
    // Some PDF parsers return raw object/stream syntax instead of readable text.
    // Keep the document available, but do not expose that binary-like dump in the UI.
    if (!preview || /%PDF-\d|endstream|\/Type\/ObjStm|<<\s*\/Filter|\/DecodeParms/i.test(preview)) {
      return 'No clean text preview is available. Ask AI Mentor to search the indexed content of this file.';
    }
    return preview;
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem('achiever_ai_mentor_sidebar_collapsed_v1', String(next));
    } catch {
      // A visual preference must never interrupt the mentor workspace.
    }
  };

  const openMemoryPanel = () => {
    setUtilityPanel(null);
    setShowMemoryPanel(true);
    setMobileSidebarOpen(false);
  };

  const openUtilityPanel = (panel: 'settings' | 'documents') => {
    setShowMemoryPanel(false);
    setUtilityPanel(panel);
    setMobileSidebarOpen(false);
  };

  const closeUtilityPanels = () => {
    setShowMemoryPanel(false);
    setUtilityPanel(null);
  };

  return (
    <div className="ai-mentor-chatgpt relative flex h-[calc(100vh-112px)] min-h-[680px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm">
      <style>{"\n.ai-mentor-chatgpt {\n  border: 1px solid #e2e8f0 !important;\n  border-radius: 24px !important;\n  background: #ffffff !important;\n  box-shadow: 0 18px 60px rgba(15, 23, 42, .09) !important;\n  isolation: isolate;\n}\n.ai-mentor-chatgpt > aside:first-of-type {\n  background: linear-gradient(180deg, #111827 0%, #151f31 100%) !important;\n  border-color: rgba(255,255,255,.08) !important;\n  color: #e5e7eb !important;\n}\n.ai-mentor-chatgpt > aside:first-of-type > div:first-child {\n  border-color: rgba(255,255,255,.09) !important;\n  background: rgba(255,255,255,.015);\n}\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-900\"],\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-800\"] { color: #f8fafc !important; }\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-700\"],\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-600\"],\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-500\"] { color: #cbd5e1 !important; }\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"text-slate-400\"] { color: #94a3b8 !important; }\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"border-slate-200\"],\n.ai-mentor-chatgpt > aside:first-of-type [class*=\"border-slate-100\"] { border-color: rgba(255,255,255,.10) !important; }\n.ai-mentor-chatgpt > aside:first-of-type input {\n  color: #f8fafc !important;\n  background: rgba(255,255,255,.07) !important;\n  border-color: rgba(255,255,255,.12) !important;\n}\n.ai-mentor-chatgpt > aside:first-of-type input::placeholder { color: #94a3b8 !important; }\n.ai-mentor-chatgpt > aside:first-of-type button:hover { background-color: rgba(255,255,255,.075) !important; }\n.ai-mentor-chatgpt > aside:first-of-type button[title=\"New chat\"] {\n  background: linear-gradient(135deg, #4f46e5, #6d5ce8) !important;\n  color: #ffffff !important;\n  box-shadow: 0 7px 22px rgba(79,70,229,.22) !important;\n}\n.ai-mentor-chatgpt > aside:first-of-type .group:has(.text-indigo-700) {\n  background: rgba(99,102,241,.20) !important;\n  box-shadow: inset 0 0 0 1px rgba(165,180,252,.16) !important;\n}\n.ai-mentor-chatgpt > aside:first-of-type .group:has(.text-indigo-700) .text-indigo-700 { color: #e0e7ff !important; }\n.ai-mentor-chatgpt > aside:first-of-type .rounded-lg.bg-white,\n.ai-mentor-chatgpt > aside:first-of-type .rounded-lg.bg-white.ring-1 {\n  background: rgba(255,255,255,.075) !important;\n  box-shadow: inset 0 0 0 1px rgba(255,255,255,.07) !important;\n}\n.ai-mentor-chatgpt > aside:first-of-type .mt-3.flex.items-center.gap-2.rounded-lg.bg-white {\n  background: rgba(255,255,255,.055) !important;\n}\n.ai-mentor-chatgpt > main { background: #ffffff !important; }\n.ai-mentor-chatgpt > main > header {\n  min-height: 70px;\n  background: rgba(255,255,255,.94) !important;\n  border-color: #e8edf4 !important;\n  box-shadow: 0 2px 12px rgba(15,23,42,.025);\n}\n.ai-mentor-chatgpt > main > header h1 { letter-spacing: -.025em; }\n.ai-mentor-chatgpt > main > div.relative.flex.min-h-0.flex-1 > div.flex-1.overflow-y-auto {\n  background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.055), transparent 52%), #f8fafc !important;\n  scrollbar-color: #cbd5e1 transparent;\n}\n.ai-mentor-chatgpt .mentor-suggestion-card {\n  border-color: #e5eaf2 !important;\n  border-radius: 18px !important;\n  background: rgba(255,255,255,.92) !important;\n  box-shadow: 0 3px 15px rgba(15,23,42,.035) !important;\n}\n.ai-mentor-chatgpt .mentor-suggestion-card:hover {\n  border-color: #a5b4fc !important;\n  box-shadow: 0 12px 28px rgba(79,70,229,.09) !important;\n}\n.ai-mentor-chatgpt .mentor-user-message {\n  border: 1px solid #dfe5ff;\n  background: linear-gradient(135deg, #eef2ff, #e9edff) !important;\n  box-shadow: 0 3px 12px rgba(79,70,229,.045);\n}\n.ai-mentor-chatgpt .mentor-assistant-message { border-bottom: 1px solid #edf0f5; padding-bottom: 14px !important; }\n.ai-mentor-chatgpt .mentor-composer {\n  border: 1px solid #dce3ed !important;\n  border-radius: 24px !important;\n  background: #ffffff !important;\n  box-shadow: 0 9px 34px rgba(15,23,42,.075) !important;\n}\n.ai-mentor-chatgpt .mentor-composer:focus-within {\n  border-color: #a5b4fc !important;\n  box-shadow: 0 0 0 4px rgba(99,102,241,.09), 0 12px 36px rgba(15,23,42,.08) !important;\n}\n.ai-mentor-chatgpt .mentor-composer button[aria-label=\"Send message\"],\n.ai-mentor-chatgpt .mentor-composer button[aria-label=\"Generate image\"] {\n  background: linear-gradient(135deg, #4f46e5, #6658e8) !important;\n  box-shadow: 0 5px 16px rgba(79,70,229,.22);\n}\n.ai-mentor-chatgpt .mentor-composer select { background: #f8fafc !important; border-color: #e2e8f0 !important; }\n.ai-mentor-chatgpt main > div.absolute.inset-0 > aside {\n  border-color: #e5eaf2 !important;\n  box-shadow: -24px 0 70px rgba(15,23,42,.16) !important;\n}\n.ai-mentor-chatgpt .mentor-document-card {\n  border-color: #e3e9f2 !important;\n  border-radius: 16px !important;\n  background: #ffffff !important;\n  box-shadow: 0 2px 10px rgba(15,23,42,.025);\n}\n.ai-mentor-chatgpt .mentor-document-remove {\n  min-height: 30px;\n  border-radius: 9px !important;\n  background: #fff7f7;\n  border-color: #fee2e2 !important;\n  font-weight: 700;\n  white-space: nowrap;\n}\n@media (max-width: 767px) {\n  .ai-mentor-chatgpt { border-radius: 18px !important; }\n  .ai-mentor-chatgpt > aside:first-of-type { border-radius: 18px 0 0 18px; }\n}\n"}</style>

      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close AI Mentor sidebar"
          onClick={() => setMobileSidebarOpen(false)}
          className="absolute inset-0 z-30 bg-slate-950/30 md:hidden"
        />
      )}

      <aside
        className={[
          mobileSidebarOpen ? 'flex' : 'hidden',
          'absolute inset-y-0 left-0 z-40 flex-col border-r border-slate-200 bg-[#fbfbfc] transition-all duration-200 md:relative md:flex md:shrink-0',
          sidebarCollapsed ? 'md:w-[76px]' : 'md:w-[274px]',
          mobileSidebarOpen ? 'w-[286px] shadow-2xl md:shadow-none' : '',
        ].join(' ')}
      >
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 px-4">
          {sidebarCollapsed ? (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Sparkles size={19} />
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">ACHIEVER</p>
              <p className="text-sm font-semibold text-slate-800">AI Mentor</p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand AI Mentor sidebar' : 'Collapse AI Mentor sidebar'}
            className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close sidebar"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <div className={sidebarCollapsed ? 'flex flex-1 flex-col items-center gap-3 px-2 py-4' : 'flex min-h-0 flex-1 flex-col px-3 py-4'}>
          <button
            type="button"
            onClick={() => {
              startNewConversation();
              setMobileSidebarOpen(false);
            }}
            title="New chat"
            className={sidebarCollapsed
              ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700'
              : 'flex w-full items-center gap-3 rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700'}
          >
            <Plus size={18} />
            {!sidebarCollapsed && <span>New chat</span>}
          </button>

          {!sidebarCollapsed && (
            <>
              <div className="relative mt-4 w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                  placeholder="Search chats"
                  aria-label="Search chats"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
                {conversationGroups.length === 0 ? (
                  <p className="px-2 py-5 text-xs leading-5 text-slate-400">
                    {chatSearch ? 'No matching conversations.' : 'Your conversations will appear here.'}
                  </p>
                ) : conversationGroups.map((group) => (
                  <div key={group.label} className="mb-4">
                    <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.label}</p>
                    <div className="space-y-1">
                      {group.items.map((conversation) => (
                        <div
                          key={conversation.id}
                          className={conversation.id === activeConversationId
                            ? 'group flex w-full items-center gap-1 rounded-lg bg-indigo-50 p-1 ring-1 ring-inset ring-indigo-100'
                            : 'group flex w-full items-center gap-1 rounded-lg p-1 transition hover:bg-slate-100'}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              switchConversation(conversation.id);
                              setMobileSidebarOpen(false);
                            }}
                            title={conversation.title}
                            className={conversation.id === activeConversationId
                              ? 'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold text-indigo-700'
                              : 'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs text-slate-600 transition hover:text-slate-900'}
                          >
                            <MessageSquare size={14} className="shrink-0 opacity-70" />
                            <span className="min-w-0 flex-1 truncate">{conversation.title || 'New conversation'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteConversation(conversation)}
                            disabled={loading || Boolean(deletingConversationId)}
                            aria-label={'Delete conversation: ' + (conversation.title || 'New conversation')}
                            title={deletingConversationId === conversation.id ? 'Deleting conversation…' : 'Delete conversation'}
                            className="shrink-0 rounded-md p-1.5 text-slate-400 opacity-70 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {deletingConversationId === conversation.id
                              ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-rose-500" />
                              : <Trash2 size={14} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto border-t border-slate-200 pt-3">
                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  <div className="rounded-lg bg-white px-1.5 py-2 text-center ring-1 ring-slate-100">
                    <p className="text-sm font-bold text-slate-800">{quickStats.avgAccuracy == null ? '—' : quickStats.avgAccuracy + '%'}</p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">PYQ accuracy</p>
                  </div>
                  <div className="rounded-lg bg-white px-1.5 py-2 text-center ring-1 ring-slate-100">
                    <p className="text-sm font-bold text-slate-800">{quickStats.weak}</p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">Weak*</p>
                  </div>
                  <div className="rounded-lg bg-white px-1.5 py-2 text-center ring-1 ring-slate-100">
                    <p className="text-sm font-bold text-slate-800">{quickStats.mocks}</p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">Tests</p>
                  </div>
                </div>
                <p className="mb-2 text-[9px] leading-4 text-slate-400">*Weak count uses measured PYQ accuracy below 75% only.</p>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Workspace</p>
                <div className="space-y-1">
                  <button type="button" onClick={openMemoryPanel} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                    <Bookmark size={15} /> Persistent memory <span className="ml-auto text-[10px] text-slate-400">{memories.length}</span>
                  </button>
                  <button type="button" onClick={() => openUtilityPanel('documents')} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                    <FileText size={15} /> Uploaded documents <span className="ml-auto text-[10px] text-slate-400">{documentsCount}</span>
                  </button>
                  <button type="button" onClick={() => openUtilityPanel('settings')} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                    <Settings size={15} /> AI settings
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-slate-100">
                  <span className={keyStatus === 'connected' ? 'h-2 w-2 rounded-full bg-emerald-500' : keyStatus === 'verifying' ? 'h-2 w-2 animate-pulse rounded-full bg-amber-500' : 'h-2 w-2 rounded-full bg-rose-500'} />
                  <span className="truncate text-[10px] text-slate-500">{keyStatus === 'connected' ? 'Gemini connected' : keyStatus === 'verifying' ? 'Checking connection…' : 'Connection needs attention'}</span>
                </div>
              </div>
            </>
          )}

          {sidebarCollapsed && (
            <div className="mt-auto flex flex-col items-center gap-3">
              <button type="button" onClick={openMemoryPanel} title="Persistent memory" className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><Bookmark size={18} /></button>
              <button type="button" onClick={() => openUtilityPanel('documents')} title="Uploaded documents" className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><FileText size={18} /></button>
              <button type="button" onClick={() => openUtilityPanel('settings')} title="AI settings" className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><Settings size={18} /></button>
              <span className={keyStatus === 'connected' ? 'h-2 w-2 rounded-full bg-emerald-500' : 'h-2 w-2 rounded-full bg-rose-500'} />
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-white">
        <header className="z-10 flex min-h-[68px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.matchMedia('(max-width: 767px)').matches) setMobileSidebarOpen(true);
                else toggleSidebar();
              }}
              aria-label="Toggle AI Mentor sidebar"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900">AI Mentor</h1>
              <p className="truncate text-[11px] text-slate-500">J.A.R.V.I.S. intelligence · {activeModel}</p>
            </div>
            <span className={keyStatus === 'connected'
              ? 'hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:inline-flex'
              : keyStatus === 'verifying'
                ? 'hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 sm:inline-flex'
                : 'hidden items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 sm:inline-flex'}
            >
              <span className={keyStatus === 'connected' ? 'h-1.5 w-1.5 rounded-full bg-emerald-500' : 'h-1.5 w-1.5 rounded-full bg-current'} />
              {keyStatus === 'connected' ? 'Connected' : keyStatus === 'verifying' ? 'Checking' : 'Offline'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <select
              value={activeConversationId}
              onChange={(event) => switchConversation(event.target.value)}
              aria-label="Saved conversations"
              className="hidden max-w-[180px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-600 outline-none hover:border-slate-300 md:block"
            >
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Plus size={15} /><span className="hidden sm:inline">New chat</span>
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowConversationActions((value) => !value)}
                aria-label="Conversation actions"
                className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              >
                <MoreHorizontal size={17} />
              </button>
              {showConversationActions && (
                <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <button type="button" onClick={() => { handleRenameConversation(); setShowConversationActions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><FileText size={14} /> Rename conversation</button>
                  <button type="button" onClick={() => { exportCurrentConversation(); setShowConversationActions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Download size={14} /> Export conversation</button>
                  <button type="button" onClick={() => { syncData(); setShowConversationActions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><RefreshCw size={14} /> Sync Data</button>
                  <button type="button" onClick={() => { clearCurrentConversation(); setShowConversationActions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"><Trash2 size={14} /> Clear conversation</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
            {isWelcomeScreen ? (
              <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col justify-center px-5 py-10">
                <div className="mx-auto mb-8 max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                    <Sparkles size={25} />
                  </div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">ACHIEVER · AI MENTOR</p>
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">How can I help you today?</h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">Your personal AI learning and intelligence assistant, powered by ACHIEVER.</p>
                </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {welcomeSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      disabled={loading}
                      onClick={() => void runMentorPrompt(suggestion.prompt, suggestion.mode)}
                      className="mentor-suggestion-card group min-h-[126px] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md disabled:opacity-60"
                    >
                      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
                        <suggestion.icon size={18} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{suggestion.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{suggestion.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[900px] space-y-7 px-5 py-8">
                {messages.map((message, index) => (
                  <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={message.role === 'user' ? 'mentor-user-message max-w-[92%] rounded-[22px] rounded-br-md bg-[#edf0ff] px-5 py-3.5 text-slate-900 sm:max-w-[78%]' : 'mentor-assistant-message w-full max-w-[850px] px-1 py-1 text-slate-800'}>
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white"><Sparkles size={14} /></span>
                          <span>J.A.R.V.I.S.</span>
                        </div>
                      )}
                      {message.attachments?.map((attachment, attachmentIndex) => (
                        attachment.kind === 'document'
                          ? <StoredMentorFile key={attachment.id || attachment.name + attachmentIndex} attachment={attachment} />
                          : <StoredMentorImage key={attachment.id || attachment.name + attachmentIndex} attachment={attachment} />
                      ))}
                      {editingMessageId === message.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingMessageText}
                            onChange={(event) => setEditingMessageText(event.target.value)}
                            rows={Math.min(8, Math.max(3, editingMessageText.split('\\n').length))}
                            aria-label="Edit your message"
                            className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => { setEditingMessageId(null); setEditingMessageText(''); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
                            <button type="button" onClick={() => void resendEditedMessage(index)} disabled={!editingMessageText.trim() || loading} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">Save &amp; resend</button>
                          </div>
                        </div>
                      ) : (
                        <MentorMarkdown content={message.content} className={message.role === 'user' ? 'text-slate-900' : 'text-slate-800'} />
                      )}
                      {message.interactive?.kind === 'quiz' && (
                        <MentorQuizCard
                          quiz={message.interactive.quiz}
                          onChange={(quiz) => updateQuizMessage(message.id, quiz)}
                        />
                      )}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-slate-400">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {message.role === 'user' && !message.attachments?.length && editingMessageId !== message.id && (
                          <button type="button" onClick={() => beginEditUserMessage(message)} title="Edit and resend message" aria-label="Edit message" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600">Edit</button>
                        )}
                        {message.role === 'assistant' && message.id !== 'welcome' && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => void handleCopyMessage(message.content)} title="Copy response" aria-label="Copy response" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"><Copy size={14} /></button>
                            {index === messages.length - 1 && (
                              <button type="button" onClick={regenerateLastResponse} title="Regenerate response" aria-label="Regenerate response" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"><RotateCcw size={14} /></button>
                            )}
                            <button type="button" onClick={() => setMessageFeedback(message.id, 'up')} title="Helpful response" aria-label="Helpful response" className={message.feedback === 'up' ? 'rounded-lg bg-emerald-50 p-2 text-emerald-600' : 'rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600'}>👍</button>
                            <button type="button" onClick={() => setMessageFeedback(message.id, 'down')} title="Not helpful" aria-label="Not helpful" className={message.feedback === 'down' ? 'rounded-lg bg-rose-50 p-2 text-rose-600' : 'rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600'}>👎</button>
                            <button type="button" onClick={() => saveAnswerAsMemory(index)} title="Save memory" aria-label="Save memory" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"><Bookmark size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 px-5 pb-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><Sparkles size={15} /></div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:240ms]" />
                    <span className="ml-1 text-xs text-slate-500">{generationStatus || 'Preparing your response…'}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="relative shrink-0 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
            <div className="mx-auto max-w-[900px]">
              {uploadFeedback && (
                <p className="mb-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{uploadFeedback}</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                multiple
                className="hidden"
                onChange={handleDocumentUpload}
              />
              <input
                ref={messageFileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.json,image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleChatFileUpload}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />

              {pendingDocuments.length > 0 && (
                <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {pendingDocuments.map((item) => (
                    <div key={item.previewUrl} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-700">{item.file.name}</p>
                        <p className="text-[10px] text-slate-400">{(item.file.size / 1024).toFixed(0)} KB · {item.file.type || 'Document'}</p>
                      </div>
                      <button type="button" onClick={() => removePendingDocument(item.previewUrl)} aria-label={'Remove ' + item.file.name} title="Remove attachment" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
              {pendingImages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {pendingImages.map((item) => (
                    <div key={item.previewUrl} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePendingImage(item.previewUrl)}
                        aria-label={'Remove ' + item.file.name}
                        title="Remove image"
                        className="absolute right-1 top-1 rounded-full bg-slate-900/80 p-1 text-white hover:bg-rose-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="flex min-w-[130px] flex-col justify-center">
                    <p className="text-xs font-semibold text-slate-700">{pendingImages.length} image(s) attached</p>
                    <p className="mt-1 text-[10px] text-slate-500">PNG, JPG, or WEBP · up to 3 MB each</p>
                  </div>
                </div>
              )}
              {imageGenerationMode && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                  <WandSparkles size={14} />
                  <span><strong>Image generation mode</strong> — describe the educational visual you want to create or refine.</span>
                </div>
              )}

              {showToolsMenu && (
                <div className="absolute bottom-[112px] left-4 z-20 w-[min(340px,calc(100%-32px))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                  <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick actions</p>
                  <div className="grid grid-cols-1 gap-1">
                    {quickActions.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        disabled={loading}
                        onClick={() => { setShowToolsMenu(false); void runMentorPrompt(item.label, item.mode); }}
                        className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                      >
                        {item.label}
                      </button>
                    ))}
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); setShowQuizBuilder(true); }} className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50">Create interactive GATE quiz</button>
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); void runMentorPrompt('Create concise, exam-ready flashcards from the relevant uploaded study material or topic in my previous message. Format each as Front / Back and include only accurate, independently explainable facts.', 'concept'); }} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Generate flashcards</button>
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); void runMentorPrompt('Create structured GATE revision notes for the selected topic or uploaded material. Include definitions, key formulas, worked examples, common traps and a short recap. Cite uploaded sources accurately.', 'concept'); }} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Create study notes</button>
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); void runMentorPrompt('Solve the mathematical problem I provide step by step. Define variables, show derivation, verify calculations and state any assumptions.', 'problem'); }} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Solve mathematical problem</button>
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); void runMentorPrompt('Act as a programming and algorithms assistant. Explain, write or debug the code I provide, include edge cases and analyse time and space complexity. Do not claim that code was executed.', 'problem'); }} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Coding assistant</button>
                    <button type="button" disabled={loading} onClick={() => { setShowToolsMenu(false); void runMentorPrompt('Analyse the uploaded document(s) and the existing AI Mentor document workspace. Summarise key concepts, retrieve relevant passages and cite exact source filenames. Do not invent page references.', 'concept'); }} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Analyse document</button>
                    <button type="button" disabled={loading} onClick={() => void runWebSearch()} className="rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-indigo-50 disabled:opacity-50">Web search &amp; research</button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setShowToolsMenu(false);
                        void runMentorPrompt(
                          'Review my 90-day SKY Meditation Practice and 100-day No-Fap Tracker. Retrieve both current challenge records, identify any missed dates or interrupted streaks, review previous archived attempts if present, and give me a practical, non-judgmental recovery plan.',
                          'chat'
                        );
                      }}
                      className="rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Review SKY &amp; No-Fap Challenges
                    </button>
                  </div>
                </div>
              )}

              {loading && (
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={stopGeneration}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Square size={12} /> Stop generation
                  </button>
                </div>
              )}

              <div
                className="mentor-composer rounded-[24px] border border-slate-300 bg-white p-3 shadow-[0_5px_24px_rgba(15,23,42,0.06)] transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.files?.length) stageChatFiles(Array.from(event.dataTransfer.files));
                }}
              >
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
                  placeholder={imageGenerationMode ? 'Describe the image or diagram you want to generate…' : 'Ask anything about GATE, your progress, or your study material…'}
                  aria-label="Message AI Mentor"
                  className="max-h-40 min-h-[54px] w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                  disabled={loading}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => messageFileInputRef.current?.click()}
                      disabled={loading || uploading}
                      title="Attach PDF, DOCX, notes or images"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      <Paperclip size={15} />
                      <span className="hidden sm:inline">Attach</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={loading || pendingImages.length >= 4}
                      title="Attach image for visual analysis"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      <ImagePlus size={15} /> <span className="hidden sm:inline">Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageGenerationMode((value) => !value)}
                      aria-pressed={imageGenerationMode}
                      title="Generate or edit an educational image"
                      className={imageGenerationMode
                        ? 'inline-flex items-center gap-1.5 rounded-lg bg-violet-100 px-2.5 py-2 text-xs font-semibold text-violet-700'
                        : 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800'}
                    >
                      <WandSparkles size={14} /> <span className="hidden sm:inline">Generate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowToolsMenu((value) => !value)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                    >
                      <Zap size={14} /> Tools <ChevronDown size={13} />
                    </button>
                    <select
                      value={mode}
                      onChange={(event) => setMode(event.target.value as MentorMode)}
                      aria-label="AI Mentor mode"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold capitalize text-slate-600 outline-none focus:border-indigo-300"
                    >
                      {(['chat', 'concept', 'problem', 'strategy'] as MentorMode[]).map((item) => (
                        <option key={item} value={item}>{item === 'chat' ? 'Chat mode' : item === 'concept' ? 'Concept mode' : item === 'problem' ? 'Problem mode' : 'Strategy mode'}</option>
                      ))}
                    </select>
                    <span className="hidden text-[10px] text-slate-400 lg:inline">{documentsCount} document(s) indexed</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={loading || (!input.trim() && pendingImages.length === 0 && pendingDocuments.length === 0)}
                    aria-label={imageGenerationMode ? 'Generate image' : 'Send message'}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send size={17} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">AI Mentor can make mistakes. Verify important academic calculations and source claims.</p>
            </div>
          </div>
        </div>

        {(showMemoryPanel || utilityPanel !== null) && (
          <div className="absolute inset-0 z-50 flex justify-end bg-slate-950/20" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUtilityPanels(); }}>
            <aside className="h-full w-full max-w-[430px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">AI Mentor workspace</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{showMemoryPanel ? 'Persistent memory' : utilityPanel === 'documents' ? 'Uploaded documents' : 'AI settings'}</h3>
                </div>
                <button type="button" onClick={closeUtilityPanels} aria-label="Close panel" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
              </div>

              {showMemoryPanel && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-800">
                    User-approved memories are shared with J.A.R.V.I.S. and AI Mentor. Review or edit saved items below.
                  </div>
                  <p className="text-xs text-slate-500">{memories.length} saved item(s)</p>
                  {memories.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">No saved memories yet. Use “Save memory” under an AI response.</p>
                  )}
                  {memories.slice(0, 30).map((memory) => (
                    <div key={memory.id} className="rounded-xl border border-slate-200 p-3">
                      {editingMemory?.id === memory.id ? (
                        <div className="space-y-2">
                          <input value={editingMemory.title} onChange={(event) => setEditingMemory({ ...editingMemory, title: event.target.value })} aria-label="Edit memory title" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-indigo-300" />
                          <textarea value={editingMemory.content} onChange={(event) => setEditingMemory({ ...editingMemory, content: event.target.value })} aria-label="Edit memory content" rows={5} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-5 outline-none focus:border-indigo-300" />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditingMemory(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
                            <button type="button" onClick={saveMemoryEdit} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Save changes</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">{memory.title}</p>
                            <div className="flex shrink-0 gap-2">
                              <button type="button" onClick={() => beginEditMemory(memory)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Edit</button>
                              <button type="button" onClick={() => handleDeleteMemory(memory.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800">Delete</button>
                            </div>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{memory.content}</p>
                          <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">{memory.category}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {utilityPanel === 'documents' && !showMemoryPanel && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                    {documentsCount} locally indexed document(s). Upload a note or PDF from the message composer to add it to the existing knowledge index.
                  </div>
                  {documentsForPanel.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">No documents have been indexed in this browser yet.</p>
                  ) : documentsForPanel.map((document: StoredDocument) => (
                    <div key={document.id} className="mentor-document-card rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText size={17} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="break-words text-sm font-semibold text-slate-800">{document.name}</p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteDocument(document)}
                                aria-label={'Remove uploaded document: ' + document.name}
                                title="Remove this uploaded document"
                                className="mentor-document-remove inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                              <div className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() => setDocumentActionsId((current) => current === document.id ? null : document.id)}
                                aria-label={'Options for ' + document.name}
                                title="Document options"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              >
                                <MoreHorizontal size={17} />
                              </button>
                              {documentActionsId === document.id && (
                                <div className="absolute right-0 top-8 z-20 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDocument(document)}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                  >
                                    <Trash2 size={14} /> Remove Document
                                  </button>
                                </div>
                              )}
                            </div>
                            </div>
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">{document.kind.toUpperCase()} · {document.purpose.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleDateString()}</p>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{getDocumentPreview(document)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => { closeUtilityPanels(); fileInputRef.current?.click(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"><Paperclip size={16} /> Upload Notes / PDF</button>
                </div>
              )}

              {utilityPanel === 'settings' && !showMemoryPanel && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Provider connection</p>
                      <span className={keyStatus === 'connected' ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700' : keyStatus === 'verifying' ? 'rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700' : 'rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700'}>
                        {keyStatus === 'connected' ? 'Connected' : keyStatus === 'verifying' ? 'Verifying' : 'Offline / Error'}
                      </span>
                    </div>
                    <h4 className="mt-3 text-lg font-bold text-slate-900">Google Gemini</h4>
                    <p className="mt-1 break-all text-xs text-slate-500">{activeModel}</p>
                    <div className="mt-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Masked API key</span><code className="rounded bg-slate-50 px-2 py-1 text-slate-700">{getMaskedGeminiKey(geminiKey)}</code></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Connection test</span><strong className="font-mono text-slate-800">{geminiLatency ? geminiLatency + ' ms' : '—'}</strong></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Last AI request</span><strong className="font-mono text-indigo-700">{lastRequestLatencyMs == null ? '—' : lastRequestLatencyMs + ' ms'}</strong></div>
                    </div>
                    {keyTestFeedback && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">{keyTestFeedback}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={handleTestConnection} disabled={testingKey} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} /> {testingKey ? 'Testing…' : 'Test Connection'}</button>
                      <button type="button" onClick={() => { setCustomKeyInput(geminiKey); setShowKeyModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><Settings size={14} /> Key Settings</button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-emerald-800"><ShieldCheck size={16} /><p className="text-xs font-bold uppercase tracking-wide">Connected application data</p></div>
                    <p className="text-[11px] leading-5 text-emerald-800/80">Relevant records are retrieved from existing ACHIEVER sections when needed. Lecture Tracker task creation remains scoped to explicit user requests. Other tracker operations remain read-only.</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {['Roadmap', 'AI Focus', 'Lecture Tracker', 'PYQ Execution', 'Health Tracker', 'Test Performance', 'Revision', 'AI Analytics', 'Strategy & Tips'].map((section) => <span key={section} className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800">{section}</span>)}
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-emerald-900/70">Health Tracker information is accessed only for relevant wellness questions.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-slate-50 p-3 text-center"><p className="text-base font-bold">{quickStats.avgAccuracy == null ? '—' : quickStats.avgAccuracy + '%'}</p><p className="text-[9px] uppercase text-slate-400">PYQ accuracy</p></div>
                    <div className="rounded-lg bg-slate-50 p-3 text-center"><p className="text-base font-bold">{quickStats.weak}</p><p className="text-[9px] uppercase text-slate-400">Weak*</p></div>
                    <div className="rounded-lg bg-slate-50 p-3 text-center"><p className="text-base font-bold">{quickStats.mocks}</p><p className="text-[9px] uppercase text-slate-400">Tests</p></div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

      </main>

      {showQuizBuilder && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100">ACHIEVER · AI Mentor</p>
                <h2 className="mt-1 text-lg font-bold">Create GATE practice quiz</h2>
              </div>
              <button type="button" onClick={() => setShowQuizBuilder(false)} aria-label="Close quiz builder" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Subject</span>
                <input value={quizSubject} onChange={(event) => setQuizSubject(event.target.value)} placeholder="e.g. Computer Organization and Architecture" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Topic</span>
                <input value={quizTopic} onChange={(event) => setQuizTopic(event.target.value)} placeholder="e.g. Cache memory, direct mapping, AMAT" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Difficulty</span>
                <select value={quizDifficulty} onChange={(event) => setQuizDifficulty(event.target.value as typeof quizDifficulty)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="easy">Easy</option><option value="medium">GATE standard</option><option value="hard">Advanced</option><option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Number of questions</span>
                <select value={quizCount} onChange={(event) => setQuizCount(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  {[5, 10, 15, 20, 25, 30].map((count) => <option key={count} value={count}>{count} questions</option>)}
                </select>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Question type</span>
                <select value={quizQuestionType} onChange={(event) => setQuizQuestionType(event.target.value as MentorQuizQuestionType | 'mixed')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="mixed">Mixed (MCQ, MSQ, NAT and True/False)</option>
                  <option value="single">Single-correct MCQ</option>
                  <option value="multiple">Multiple-correct MSQ</option>
                  <option value="nat">Numerical answer (NAT)</option>
                  <option value="true_false">True / False</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <p className="max-w-xs text-[10px] leading-4 text-slate-500">AI-generated practice questions are not official GATE PYQs. Answer keys receive a second-pass model review; flagged items are marked for manual verification.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowQuizBuilder(false)} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>
                <button type="button" onClick={() => void createQuiz()} disabled={loading || !quizSubject.trim() || !quizTopic.trim()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">Generate quiz</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Existing Gemini key configuration UI, retained without changing its handlers. */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="text-lg font-bold">Google Gemini API Key</h3>
              </div>
              <button type="button" onClick={() => setShowKeyModal(false)} className="text-lg font-bold text-white/80 hover:text-white" aria-label="Close key settings">✕</button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-xs leading-relaxed text-slate-600">The AI Mentor uses Google Gemini for concept explanations, step-by-step problem solving, read-only tracker tools and adaptive GATE preparation guidance.</p>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Gemini API Key</label>
                <input
                  type="password"
                  value={customKeyInput}
                  onChange={(event) => setCustomKeyInput(event.target.value)}
                  placeholder="Enter Gemini API key…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">Active key: <code className="font-mono text-slate-600">{getMaskedGeminiKey()}</code></p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomKeyInput('');
                  setGeminiApiKey('');
                  const environmentKey = getGeminiApiKey();
                  setGeminiKey(environmentKey);
                }}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Use Environment Key
              </button>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowKeyModal(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Cancel</button>
                <button type="button" onClick={() => void handleSaveCustomKey(customKeyInput)} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700">Save &amp; Verify Key</button>
              </div>
              <p className="text-[10px] leading-relaxed text-amber-700">This existing static-app configuration keeps the custom key in this browser. Do not use a shared or production-secret key here.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIMentor;

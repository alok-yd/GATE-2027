import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getGeminiApiKey,
  getMaskedGeminiKey,
  setGeminiApiKey,
  testGeminiKeyConnection,
  describeAIGatewayError,
} from '../services/AIGatewayClient';
import { AI_MODEL_CONFIG } from '../services/ai/modelConfig';
import { aiHub } from '../services/AIServiceHub';
import { getStudentProfile } from '../services/DataExtractor';
import {
  createMemory,
  deleteMemory,
  listDocuments,
  listMemories,
  processUploadedDocument,
  updateMemory,
} from '../services/AINativeServices';
import type { AIMemoryRecord } from '../services/AINativeServices';
import {
  createMentorConversation,
  getActiveMentorConversationId,
  loadMentorConversations,
  saveMentorConversations,
  setActiveMentorConversationId,
} from '../services/mentor/MentorStorage';
import type { MentorConversation, MentorStoredMessage } from '../services/mentor/MentorStorage';
import { generateMentorReply, summarizeMentorConversation } from '../services/mentor/MentorAgent';
import { getAIAnalyticsMentorContext } from '../services/mentor/MentorDomainData';
import type { MentorHistoryMessage, MentorMode } from '../services/mentor/MentorAgent';
import { MentorMarkdown } from './mentor/MentorMarkdown';
import type { StudentProfile } from '../types';

const createWelcomeMessage = (): MentorStoredMessage => ({
  id: 'welcome',
  role: 'assistant',
  content:
    `# J.A.R.V.I.S. — Personal AI Learning & Intelligence

**Just A Rather Very Intelligent System**, integrated with ACHIEVER.

I can explain GATE CS/IT/DA concepts, solve PYQs step by step, analyse your recorded mock and PYQ performance, review your Roadmap and revision status, build realistic study plans, and search notes you upload here.

Your voice assistant and this full AI Mentor workspace share the same conversation history and user-approved memories. I use the tracker’s available records rather than guessing your statistics.

**Tell me what you want to learn, analyse, plan or improve.**`,
  timestamp: new Date().toISOString(),
});

const createMessage = (role: MentorStoredMessage['role'], content: string): MentorStoredMessage => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  role,
  content,
  timestamp: new Date().toISOString(),
});

const formatPlan = (plan: Awaited<ReturnType<typeof aiHub.createPersonalizedPlan>>) => {
  const week = plan.weeks?.[0];
  if (!week) return 'No plan could be generated yet. Add study logs or mock scores and try again.';

  const days = week.daily
    .slice(0, 7)
    .map((day) => `- **${day.day}:** ${day.target}`)
    .join('\n');

  return `## This week's target

**Milestone:** ${week.milestone}

**Focus:** ${week.focus.join(', ')}

${days}

${plan.notes || ''}`;
};

const formatWeakAreas = (areas: Awaited<ReturnType<typeof aiHub.identifyWeakAreas>>) => {
  if (areas.length === 0) return 'No weak area is currently above the tracker priority threshold.';

  return `## Priority areas

${areas
    .slice(0, 5)
    .map(
      (area, index) =>
        `${index + 1}. **${area.subject} — ${area.topic}**
   - Priority: ${area.priority} | ROI indicator: ${area.roi} | Time estimate: ${area.timeRequired}
   - Next action: ${area.milestones[0] || 'Solve PYQs and update error notes.'}`
    )
    .join('\n\n')}

_Accuracy-based priority indicators in the legacy tracker can be derived estimates; check measured correct/attempted PYQ records before treating them as test accuracy._`;
};

const formatPrediction = (prediction: Awaited<ReturnType<typeof aiHub.predictAIR>>) => {
  const readiness = prediction.rankReadiness;
  const hardGateSummary = readiness
    ? `
### Rank-readiness checks
- Readiness score: **${readiness.score}/100**
- Under-50 conditions met: **${readiness.under50Eligible ? 'Yes' : 'No'}**

${readiness.hardConditions.map((condition) => `- ${condition.passed ? 'PASS' : 'MISS'} — ${condition.label}: ${condition.detail}`).join('\n')}
`
    : '';

  return `> This is a tracker-derived readiness estimate, not a prediction or guarantee of your actual GATE rank.

## AIR readiness estimate

- Most likely range: **${prediction.mostLikely.range}** (${prediction.mostLikely.confidence}% model confidence)
- Optimistic scenario: **${prediction.optimistic.range}**
- Pessimistic scenario: **${prediction.pessimistic.range}**
${hardGateSummary}

### Key factors
${prediction.keyFactors.map((factor) => `- ${factor}`).join('\n')}

### Improvements to prioritise
${prediction.requiredImprovements
    .map((item) => `- **${item.area}:** ${item.from} → ${item.to} (${item.impact})`)
    .join('\n')}`;
};

const formatDashboardAIRAnalytics = () => {
  const data = getAIAnalyticsMentorContext();
  const { preparation, airPrediction, collegeCompatibility, defaultWhatIfSimulation, savedAIRHistory } = data;

  const dimensions = preparation.dimensions
    .map((dimension) => `- **${dimension.name}:** ${dimension.score}/100 (${dimension.level}) — ${dimension.primaryMetric}`)
    .join('\n');
  const subjects = preparation.subjectReadiness
    .slice()
    .sort((a, b) => a.compositeScore - b.compositeScore)
    .slice(0, 6)
    .map((subject) =>
      `- **${subject.name}:** ${subject.compositeScore}/100 · ${subject.status} · ${subject.pyqsSolved} PYQs · measured PYQ accuracy: ${subject.pyqAccuracy == null ? 'not recorded' : `${subject.pyqAccuracy}%`}`
    )
    .join('\n');
  const scenarios = Object.values(airPrediction.scenarios)
    .map((scenario) => `- **${scenario.title}:** ${scenario.airDisplay} · ${scenario.marks} marks · ${scenario.gateScore} GATE score · ${scenario.probability}% scenario weight`)
    .join('\n');
  const colleges = collegeCompatibility.topMatches.length
    ? collegeCompatibility.topMatches
        .map((match) => `- ${match.record.institute} — ${match.record.program}: ${match.statusText} (historical cutoff score ${match.closingScore})`)
        .join('\n')
    : 'No matches in the historically competitive/above categories for the selected category.';
  const whatIf = defaultWhatIfSimulation.result;

  return `# AI Analytics — AIR Readiness & Performance

> These are dashboard model projections from your current tracker data, not actual GATE results or rank guarantees.

## Current projection
- **Overall readiness:** ${preparation.overallReadinessPercent}/100
- **Predicted AIR:** ${airPrediction.airDisplay}
- **Likely AIR range:** ${airPrediction.likelyRange}
- **Expected marks:** ${airPrediction.marksEstimation.expectedMarks}/100
- **Estimated GATE score:** ${airPrediction.marksEstimation.estimatedScore}/1000
- **Model confidence:** ${airPrediction.confidencePercent}%
- **Stability:** ${airPrediction.stability}
- **Data quality:** ${preparation.dataHealth.dataQualityRating}

## Eight readiness dimensions
${dimensions}

## Subjects needing the closest review
${subjects}

## AIR scenarios
${scenarios}

## Historical college compatibility
Selected category: **${collegeCompatibility.category}**
${colleges}

## Default what-if scenario
Assumptions: +${defaultWhatIfSimulation.assumptions.mockMarksDelta} mock marks, +${defaultWhatIfSimulation.assumptions.pyqAccuracyDelta}% PYQ accuracy, ${defaultWhatIfSimulation.assumptions.sillyMistakesSaved} marks recovered from silly mistakes, and ${defaultWhatIfSimulation.assumptions.revisionCyclesComplete} revision cycles.
- Projected marks: **${whatIf.projectedMarks}**
- Projected GATE score: **${whatIf.projectedScore}**
- Projected AIR: **AIR ${whatIf.projectedAIR.toLocaleString()}**
- Improvement vs current estimate: **${whatIf.airDelta > 0 ? '+' : ''}${whatIf.airDelta} rank positions**
  
This is a hypothetical simulator output, not a recorded improvement.

Saved prediction snapshots: **${savedAIRHistory.count}**.
`;
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memories, setMemories] = useState<AIMemoryRecord[]>(() => listMemories());
  const [editingMemory, setEditingMemory] = useState<{ id: string; title: string; content: string } | null>(null);
  const [documentsCount, setDocumentsCount] = useState(() => listDocuments().length);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    const boundedMessages = nextMessages.slice(-60);
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const base = current || createMentorConversation([createWelcomeMessage()]);
    const firstUser = boundedMessages.find((message) => message.role === 'user')?.content || '';
    const updated: MentorConversation = {
      ...base,
      title: firstUser.replace(/\s+/g, ' ').trim().slice(0, 52) || 'New conversation',
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

  const runMentorAction = async (label: string, action: () => Promise<string>) => {
    if (loading) return;
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const baseMessages = current?.messages || messagesRef.current;
    const requestMessages = [...baseMessages, createMessage('user', label)];
    persistMessagesForConversation(conversationId, requestMessages);
    setLoading(true);
    try {
      const response = await action();
      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      persistMessagesForConversation(conversationId, [
        ...(latest?.messages || requestMessages),
        createMessage('assistant', response),
      ]);
    } catch (error) {
      console.error('[AIMentor] Quick action failed:', error);
      const latest = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      persistMessagesForConversation(conversationId, [
        ...(latest?.messages || requestMessages),
        createMessage('assistant', `I couldn't complete that quick action. ${describeAIGatewayError(error)}`),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const runMentorPrompt = async (prompt: string, currentMode: MentorMode) => {
    if (!prompt.trim() || loading) return;

    const conversationId = activeConversationIdRef.current;
    const currentConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const baseMessages = currentConversation?.messages || messagesRef.current;
    const userMessage = createMessage('user', prompt.trim());
    const requestHistory = [...baseMessages, userMessage];
    persistMessagesForConversation(conversationId, requestHistory);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await generateMentorReply({
        messages: requestHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })) as MentorHistoryMessage[],
        mode: currentMode,
        summary: currentConversation?.summary || '',
        signal: controller.signal,
      });
      setActiveModel(response.model);
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
          : `I couldn't complete that response. ${describeAIGatewayError(error)}\n\nYour message and conversation history are preserved.`;
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
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput('');
    await runMentorPrompt(prompt, mode);
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

  const clearCurrentConversation = () => {
    const conversationId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    if (!current || !window.confirm('Clear messages and summary from this conversation?')) return;
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

  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setUploadFeedback('Response copied to clipboard.');
    } catch {
      setUploadFeedback('Clipboard access was blocked by this browser.');
    }
    window.setTimeout(() => setUploadFeedback(null), 2500);
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    setUploading(true);
    setUploadFeedback(`Indexing ${file.name} locally…`);

    try {
      const document = await processUploadedDocument(file, 'mentor');
      setDocumentsCount(listDocuments().length);
      const warningText = document.warnings.length
        ? `\n\n**Extraction note:** ${document.warnings.join(' ')}`
        : '';
      appendMessage(
        'assistant',
        `## Study material indexed

**File:** ${document.name}

**Local extraction confidence:** ${Math.round(document.extractionConfidence * 100)}%

${document.summary}

You can now ask me to search this material. I’ll include local chunk identifiers when a matching passage is retrieved.${warningText}`
      );
      setUploadFeedback(`Indexed ${file.name} in this browser.`);
    } catch (error) {
      setUploadFeedback(error instanceof Error ? error.message : 'Could not import that document.');
    } finally {
      setUploading(false);
    }
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
      action: async () => formatDashboardAIRAnalytics(),
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
    <div className="grid grid-cols-1 gap-6 min-h-[720px] lg:grid-cols-4">
      <aside className="space-y-4 lg:col-span-1">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">J.A.R.V.I.S. status</p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                keyStatus === 'connected'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : keyStatus === 'verifying'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  keyStatus === 'connected'
                    ? 'animate-pulse bg-emerald-500'
                    : keyStatus === 'verifying'
                      ? 'animate-spin bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
              {keyStatus === 'connected' ? 'Connected' : keyStatus === 'verifying' ? 'Verifying…' : 'Offline / Error'}
            </span>
          </div>

          <h2 className="mt-2 text-xl font-bold text-slate-800">Google Gemini ({activeModel})</h2>
          <p className="mt-1 text-xs text-slate-500">Personalised GATE CS/IT/DA preparation mentor</p>

          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-500">Gemini Key</span>
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono font-bold text-slate-700">
                {getMaskedGeminiKey(geminiKey)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-500">Response Latency</span>
              <span className="font-mono font-semibold text-emerald-700">{geminiLatency ? `${geminiLatency} ms` : '—'}</span>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Connected app data · read access + scoped task creation
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  'Roadmap',
                  'AI Focus',
                  'Lecture Tracker',
                  'PYQ Execution',
                  'Health Tracker',
                  'Test Performance',
                  'Revision',
                  'AI Analytics',
                  'Strategy & Tips',
                ].map((section) => (
                  <span
                    key={section}
                    className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800"
                  >
                    {section}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-emerald-800/80">
                Gemini retrieves current records from relevant sections when your question needs them. It can create tasks only in Lecture Tracker, and only when you explicitly ask.
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                All other sections are read-only. Health records are included only for relevant wellness questions; private SKY and No-Fap notes remain excluded.
              </p>
            </div>
            {keyTestFeedback && (
              <p className={`rounded p-1.5 text-[11px] ${
                keyStatus === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {keyTestFeedback}
              </p>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingKey}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 transition hover:text-indigo-800 disabled:opacity-50"
              >
                {testingKey ? 'Testing…' : '⚡ Test Connection'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomKeyInput(geminiKey);
                  setShowKeyModal(true);
                }}
                className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-800"
              >
                ⚙️ Key Settings
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
            <div className="rounded-lg bg-slate-50 p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.avgAccuracy == null ? '—' : `${quickStats.avgAccuracy}%`}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">PYQ accuracy</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.weak}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">Weak*</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5 text-center">
              <p className="text-base font-bold text-slate-800">{quickStats.mocks}</p>
              <p className="text-[9px] font-bold uppercase text-slate-400">Tests</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            *Weak count includes only subjects with measured PYQ accuracy below 75%. Accuracy is unavailable until correct/attempted data is logged.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {(['chat', 'concept', 'problem', 'strategy'] as MentorMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`rounded-lg px-3 py-2 text-sm font-bold capitalize transition ${
                  mode === item ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Quick actions</p>
          <div className="space-y-2">
            {quickActions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => runMentorAction(item.label, item.action)}
                disabled={loading}
                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void runMentorPrompt(
                'Review my 90-day SKY Meditation Practice and 100-day No-Fap Tracker. Retrieve both current challenge records, identify any missed dates or interrupted streaks, review previous archived attempts if present, and give me a practical, non-judgmental recovery plan.',
                'chat'
              )}
              disabled={loading}
              className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-left text-sm font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-60"
            >
              Review SKY &amp; No-Fap Challenges
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Persistent memory</p>
              <p className="mt-1 text-xs text-slate-500">{memories.length} saved item(s)</p>
            </div>
            <button
              type="button"
              onClick={() => setShowMemoryPanel((current) => !current)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {showMemoryPanel ? 'Hide' : 'Manage'}
            </button>
          </div>
          {showMemoryPanel && (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {memories.length === 0 && (
                <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  No saved memories yet. Use “Save memory” under a useful mentor response.
                </p>
              )}
              {memories.slice(0, 20).map((memory) => (
                <div key={memory.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  {editingMemory?.id === memory.id ? (
                    <div className="space-y-2">
                      <input
                        value={editingMemory.title}
                        onChange={(event) => setEditingMemory({ ...editingMemory, title: event.target.value })}
                        aria-label="Edit memory title"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
                      />
                      <textarea
                        value={editingMemory.content}
                        onChange={(event) => setEditingMemory({ ...editingMemory, content: event.target.value })}
                        aria-label="Edit memory content"
                        rows={5}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingMemory(null)}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveMemoryEdit}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800">{memory.title}</p>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => beginEditMemory(memory)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemory(memory.id)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-800"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] text-slate-600">{memory.content}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{memory.category}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            Saved memories, chats and imported notes stay in this browser’s local storage.
          </p>
        </div>
      </aside>

      <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-3">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-slate-800">J.A.R.V.I.S.</h2>
            <p className="text-sm text-slate-500">Personal AI Learning &amp; Intelligence · {mode} mode · {documentsCount} locally indexed document(s)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeConversationId}
              onChange={(event) => switchConversation(event.target.value)}
              aria-label="Saved conversations"
              className="max-w-[190px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
            >
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewConversation}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              New Chat
            </button>
            <button
              type="button"
              onClick={clearCurrentConversation}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={exportCurrentConversation}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Export
            </button>
            <button
              type="button"
              onClick={syncData}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Sync Data
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
          {messages.map((message, index) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[94%] rounded-xl px-4 py-3 shadow-sm md:max-w-[820px] ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                <MentorMarkdown content={message.content} className={message.role === 'user' ? 'text-white [&_strong]:text-white' : ''} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[11px] ${message.role === 'user' ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {message.role === 'assistant' && message.id !== 'welcome' && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopyMessage(message.content)}
                        className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                      >
                        Copy
                      </button>
                      {index === messages.length - 1 && (
                        <button
                          type="button"
                          onClick={regenerateLastResponse}
                          className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                        >
                          Regenerate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => saveAnswerAsMemory(index)}
                        className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600"
                      >
                        Save memory
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                  <span className="ml-1 text-xs text-slate-500">Checking context and preparing an answer…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          {uploadFeedback && (
            <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{uploadFeedback}</p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={handleDocumentUpload}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? 'Indexing…' : 'Upload Notes / PDF'}
            </button>
            <span className="text-[10px] text-slate-400">Files are indexed locally; scanned PDFs may not extract reliably.</span>
            {loading && (
              <button
                type="button"
                onClick={stopGeneration}
                className="ml-auto rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
              >
                Stop generation
              </button>
            )}
          </div>
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
              rows={3}
              placeholder="Ask about a GATE concept, paste a problem, analyse your mocks, or request today's study plan…"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-slate-900 px-6 py-3 font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Existing Gemini key configuration UI, retained for backwards compatibility. */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="text-lg font-bold">Google Gemini API Key</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-lg font-bold text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-xs leading-relaxed text-slate-600">
                The AI Mentor uses Google Gemini for concept explanations, step-by-step problem solving, read-only tracker tools and adaptive GATE preparation guidance.
              </p>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={customKeyInput}
                  onChange={(event) => setCustomKeyInput(event.target.value)}
                  placeholder="Enter Gemini API key…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Active key: <code className="font-mono text-slate-600">{getMaskedGeminiKey()}</code>
                </p>
              </div>
              <div className="flex gap-2">
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
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveCustomKey(customKeyInput)}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
                >
                  Save & Verify Key
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-amber-700">
                This existing static-app configuration keeps the custom key in this browser. Do not use a shared or production-secret key here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIMentor;

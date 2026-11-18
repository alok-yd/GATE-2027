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
  setActiveMentorConversationId,
} from '../services/mentor/MentorStorage';
import type { MentorConversation, MentorStoredAttachment, MentorStoredMessage } from '../services/mentor/MentorStorage';
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
  const [utilityPanel, setUtilityPanel] = useState<'settings' | 'documents' | null>(null);
  const [memories, setMemories] = useState<AIMemoryRecord[]>(() => listMemories());
  const [editingMemory, setEditingMemory] = useState<{ id: string; title: string; content: string } | null>(null);
  const [documentsCount, setDocumentsCount] = useState(() => listDocuments().length);
  const [documentActionsId, setDocumentActionsId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<Array<{ file: File; previewUrl: string }>>([]);
  const [imageGenerationMode, setImageGenerationMode] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const runMentorPrompt = async (
    prompt: string,
    currentMode: MentorMode,
    attachedImages: File[] = []
  ) => {
    const effectivePrompt =
      prompt.trim() ||
      'Please analyze the attached image(s), explain the important details, and solve any visible GATE question step by step.';
    if (loading || (!effectivePrompt && attachedImages.length === 0)) return;

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
    setGenerationStatus(hasVisualContext ? 'Preparing images for visual analysis…' : 'Planning the best route for your question…');
    const requestStartedAt = performance.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const storedAttachments = await Promise.all(
        attachedImages.map((file) => saveMentorAttachment(file, file.name, file.type, 'image'))
      );
      const userMessage = createMessage('user', effectivePrompt, storedAttachments);
      requestHistory = [...baseMessages, userMessage];
      persistMessagesForConversation(conversationId, requestHistory);

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
            prompt: effectivePrompt,
            system: [
              'You are ACHIEVER AI Mentor, an expert GATE CS/IT/DA teacher. Carefully inspect the actual attached image pixels. Read visible text and equations, explain diagrams and tables, show calculations step by step, and distinguish clearly readable details from uncertain ones. Do not invent labels or values that are not visible. Teach in beginner-friendly language and highlight relevant GATE examination points.',
              (() => {
                const notes = searchKnowledge(effectivePrompt)
                  .filter((item) => item.sourceType === 'document')
                  .slice(0, 4)
                  .map((item) => 'Source: ' + item.sourceName + ' (' + item.citation + ')\n' + item.snippet)
                  .join('\n\n');
                return notes
                  ? 'Relevant uploaded study material follows. Use it only when relevant and identify the source in your answer:\n' + notes
                  : '';
              })(),
            ].filter(Boolean).join('\n\n'),
            history: baseMessages
              .filter((message) => message.id !== 'welcome')
              .slice(-10)
              .map((message) => ({ role: message.role, content: message.content })),
            images: visionImages,
            signal: controller.signal,
          })
        : await orchestrateJarvisMessage({
            prompt: effectivePrompt,
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
    if (loading || (!prompt && pendingImages.length === 0)) return;
    const images = pendingImages.map((item) => item.file);
    pendingImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setPendingImages([]);
    setInput('');

    if (imageGenerationMode) {
      await runImageGeneration(
        prompt || 'Create a clean, accurate educational version of the attached reference image.',
        images
      );
    } else {
      await runMentorPrompt(prompt, mode, images);
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
    <div className="relative flex h-[calc(100vh-112px)] min-h-[680px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm">
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
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => {
                            switchConversation(conversation.id);
                            setMobileSidebarOpen(false);
                          }}
                          title={conversation.title}
                          className={conversation.id === activeConversationId
                            ? 'group flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-2.5 text-left text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100'
                            : 'group flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'}
                        >
                          <MessageSquare size={14} className="shrink-0 opacity-70" />
                          <span className="min-w-0 flex-1 truncate">{conversation.title || 'New conversation'}</span>
                        </button>
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
                  <button type="button" onClick={() => { exportCurrentConversation(); setShowConversationActions(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><FileText size={14} /> Export conversation</button>
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
                      className="group min-h-[126px] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md disabled:opacity-60"
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
                    <div className={message.role === 'user' ? 'max-w-[92%] rounded-[22px] rounded-br-md bg-[#edf0ff] px-5 py-3.5 text-slate-900 sm:max-w-[78%]' : 'w-full max-w-[850px] px-1 py-1 text-slate-800'}>
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white"><Sparkles size={14} /></span>
                          <span>J.A.R.V.I.S.</span>
                        </div>
                      )}
                      {message.attachments?.map((attachment, attachmentIndex) => (
                        <StoredMentorImage key={attachment.id || attachment.name + attachmentIndex} attachment={attachment} />
                      ))}
                      <MentorMarkdown content={message.content} className={message.role === 'user' ? 'text-slate-900' : 'text-slate-800'} />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-slate-400">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {message.role === 'assistant' && message.id !== 'welcome' && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => void handleCopyMessage(message.content)} title="Copy response" aria-label="Copy response" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"><Copy size={14} /></button>
                            {index === messages.length - 1 && (
                              <button type="button" onClick={regenerateLastResponse} title="Regenerate response" aria-label="Regenerate response" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"><RotateCcw size={14} /></button>
                            )}
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
                accept=".pdf,.txt,.md,.csv,.json"
                className="hidden"
                onChange={handleDocumentUpload}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />

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

              <div className="rounded-[24px] border border-slate-300 bg-white p-3 shadow-[0_5px_24px_rgba(15,23,42,0.06)] transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50">
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
                  placeholder={imageGenerationMode ? 'Describe the image or diagram you want to generate…' : 'Message AI Mentor…'}
                  aria-label="Message AI Mentor"
                  className="max-h-40 min-h-[54px] w-full resize-y border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
                  disabled={loading}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      title="Upload notes or PDF"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      <Paperclip size={15} />
                      <span className="hidden sm:inline">{uploading ? 'Indexing…' : 'Attach'}</span>
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
                    disabled={loading || (!input.trim() && pendingImages.length === 0)}
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
                    <div key={document.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText size={17} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="break-words text-sm font-semibold text-slate-800">{document.name}</p>
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
                          <p className="mt-1 text-[10px] text-slate-400">{document.kind.toUpperCase()} · {document.purpose.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleDateString()}</p>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{document.summary || 'No summary available.'}</p>
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

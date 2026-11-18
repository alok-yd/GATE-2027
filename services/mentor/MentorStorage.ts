export interface MentorStoredAttachment {
  id?: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'generated-image' | 'document';
  size?: number;
  documentId?: string;
}

export type MentorQuizQuestionType = 'single' | 'multiple' | 'nat' | 'true_false';

export interface MentorQuizOption {
  id: string;
  text: string;
}

export interface MentorQuizQuestion {
  id: string;
  type: MentorQuizQuestionType;
  prompt: string;
  options: MentorQuizOption[];
  correctAnswers: string[];
  explanation: string;
  marks: number;
  negativeMarks: number;
}

export interface MentorQuizPayload {
  id: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  questions: MentorQuizQuestion[];
  responses: Record<string, string[]>;
  markedForReview: string[];
  currentIndex: number;
  submitted: boolean;
  createdAt: string;
}

export type MentorInteractivePayload = {
  kind: 'quiz';
  quiz: MentorQuizPayload;
};

export interface MentorStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** File metadata only; bytes live in IndexedDB, never in localStorage. */
  attachments?: MentorStoredAttachment[];
  interactive?: MentorInteractivePayload;
  feedback?: 'up' | 'down';
}

export interface MentorConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MentorStoredMessage[];
  summary?: string;
  summarizedMessageCount?: number;
  titleIsCustom?: boolean;
}

const CONVERSATIONS_KEY = 'gate_ai_mentor_conversations_v1';
const ACTIVE_CONVERSATION_KEY = 'gate_ai_mentor_active_conversation_v1';
const MAX_CONVERSATIONS = 40;
const MAX_MESSAGES_PER_CONVERSATION = 120;
const MAX_MESSAGE_CHARS = 12000;

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mentor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isStoredMessage = (value: unknown): value is MentorStoredMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.timestamp === 'string'
  );
};

const sanitiseQuiz = (value: unknown): MentorQuizPayload | null => {
  if (!value || typeof value !== 'object') return null;
  const quiz = value as Record<string, unknown>;
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) return null;
  const questions = quiz.questions.slice(0, 40).filter((question) => question && typeof question === 'object').map((value, index) => {
    const question = value as Record<string, unknown>;
    const type = question.type === 'multiple' || question.type === 'nat' || question.type === 'true_false'
      ? question.type
      : 'single';
    return {
      id: typeof question.id === 'string' ? question.id.slice(0, 100) : `question_${index + 1}`,
      type,
      prompt: String(question.prompt || '').slice(0, 5000),
      options: Array.isArray(question.options)
        ? question.options.slice(0, 8).map((option, optionIndex) => {
            const item = option as Record<string, unknown>;
            return {
              id: String(item?.id || String.fromCharCode(65 + optionIndex)).slice(0, 16),
              text: String(item?.text || '').slice(0, 1200),
            };
          })
        : [],
      correctAnswers: Array.isArray(question.correctAnswers)
        ? question.correctAnswers.slice(0, 8).map((answer) => String(answer).slice(0, 80))
        : [],
      explanation: String(question.explanation || '').slice(0, 5000),
      marks: Math.max(0, Math.min(10, Number(question.marks) || 1)),
      negativeMarks: Math.max(0, Math.min(10, Number(question.negativeMarks) || 0)),
    };
  });
  if (!questions.length || questions.some((question) => !question.prompt || !question.correctAnswers.length)) return null;
  const responsesValue = quiz.responses && typeof quiz.responses === 'object'
    ? quiz.responses as Record<string, unknown>
    : {};
  const responses: Record<string, string[]> = {};
  Object.entries(responsesValue).slice(0, 40).forEach(([key, answer]) => {
    responses[key.slice(0, 100)] = Array.isArray(answer) ? answer.slice(0, 8).map(String) : [];
  });
  const validDifficulty = quiz.difficulty === 'easy' || quiz.difficulty === 'hard' || quiz.difficulty === 'mixed'
    ? quiz.difficulty
    : 'medium';
  return {
    id: String(quiz.id || makeId()).slice(0, 100),
    title: String(quiz.title || 'GATE practice quiz').slice(0, 120),
    subject: String(quiz.subject || 'General').slice(0, 100),
    topic: String(quiz.topic || 'Mixed topics').slice(0, 160),
    difficulty: validDifficulty,
    questions,
    responses,
    markedForReview: Array.isArray(quiz.markedForReview) ? quiz.markedForReview.slice(0, 40).map(String) : [],
    currentIndex: Math.max(0, Math.min(questions.length - 1, Math.floor(Number(quiz.currentIndex) || 0))),
    submitted: quiz.submitted === true,
    createdAt: String(quiz.createdAt || new Date().toISOString()),
  };
};

const sanitiseConversation = (value: unknown): MentorConversation | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    !Array.isArray(candidate.messages)
  ) {
    return null;
  }

  const messages = candidate.messages
    .filter(isStoredMessage)
    .slice(-MAX_MESSAGES_PER_CONVERSATION)
    .map((message) => {
      const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
      const attachments = rawAttachments
        .filter((attachment) =>
          attachment &&
          typeof attachment.name === 'string' &&
          typeof attachment.mimeType === 'string' &&
          (attachment.kind === 'image' || attachment.kind === 'generated-image' || attachment.kind === 'document')
        )
        .slice(0, 8)
        .map((attachment) => ({
          ...(typeof attachment.id === 'string' ? { id: attachment.id } : {}),
          name: attachment.name.slice(0, 180),
          mimeType: attachment.mimeType.slice(0, 100),
          kind: attachment.kind,
          ...(typeof attachment.size === 'number' ? { size: Math.max(0, Math.floor(attachment.size)) } : {}),
          ...(typeof attachment.documentId === 'string' ? { documentId: attachment.documentId.slice(0, 120) } : {}),
        }));
      const interactive = message.interactive?.kind === 'quiz'
        ? sanitiseQuiz(message.interactive.quiz)
        : null;
      return {
        ...message,
        content: message.content.slice(0, MAX_MESSAGE_CHARS),
        ...(attachments.length ? { attachments } : {}),
        ...(interactive ? { interactive: { kind: 'quiz' as const, quiz: interactive } } : {}),
        ...(message.feedback === 'up' || message.feedback === 'down' ? { feedback: message.feedback } : {}),
      };
    });

  const firstUserMessage = messages.find((message) => message.role === 'user')?.content || '';
  const fallbackTitle = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 52);
  return {
    id: candidate.id,
    title:
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim().slice(0, 60)
        : fallbackTitle || 'New conversation',
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    messages,
    summary: typeof candidate.summary === 'string' ? candidate.summary.slice(0, 3000) : '',
    summarizedMessageCount:
      typeof candidate.summarizedMessageCount === 'number'
        ? Math.max(0, Math.min(messages.length, Math.floor(candidate.summarizedMessageCount)))
        : 0,
    titleIsCustom: candidate.titleIsCustom === true,
  };
};

export const loadMentorConversations = (): MentorConversation[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitiseConversation)
      .filter((conversation): conversation is MentorConversation => Boolean(conversation))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
};

export const saveMentorConversations = (conversations: MentorConversation[]): MentorConversation[] => {
  const bounded = conversations
    .map(sanitiseConversation)
    .filter((conversation): conversation is MentorConversation => Boolean(conversation))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(bounded));
      window.dispatchEvent(new Event('gate-mentor-conversations-updated'));
    } catch (error) {
      console.error('[AIMentor] Conversation history could not be saved:', error);
      throw new Error('Conversation storage is full. Export an older chat or remove unused history, then retry.');
    }
  }
  return bounded;
};

export const getActiveMentorConversationId = (): string =>
  typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CONVERSATION_KEY) || '' : '';

export const setActiveMentorConversationId = (id: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
  }
};

export const createMentorConversation = (messages: MentorStoredMessage[] = []): MentorConversation => {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages,
    titleIsCustom: false,
  };
};

export const renameMentorConversation = (conversationId: string, title: string): MentorConversation | null => {
  const cleanedTitle = title.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!cleanedTitle) throw new Error('Conversation title cannot be empty.');
  const conversations = loadMentorConversations();
  const selected = conversations.find((conversation) => conversation.id === conversationId);
  if (!selected) return null;
  const updated = { ...selected, title: cleanedTitle, titleIsCustom: true, updatedAt: new Date().toISOString() };
  saveMentorConversations([updated, ...conversations.filter((conversation) => conversation.id !== conversationId)]);
  return updated;
};

export const upsertMentorConversation = (
  conversation: MentorConversation,
  messages: MentorStoredMessage[],
  summary?: string,
  summarizedMessageCount?: number
): MentorConversation => {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content || '';
  const generatedTitle = firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 52) || 'New conversation';
  const updated = {
    ...conversation,
    title: conversation.titleIsCustom ? conversation.title : generatedTitle,
    updatedAt: new Date().toISOString(),
    messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    summary: summary ?? conversation.summary ?? '',
    summarizedMessageCount: summarizedMessageCount ?? conversation.summarizedMessageCount ?? 0,
  };
  const conversations = loadMentorConversations().filter((item) => item.id !== conversation.id);
  saveMentorConversations([updated, ...conversations]);
  return updated;
};

export const removeMentorConversation = (conversationId: string): MentorConversation[] => {
  const next = loadMentorConversations().filter((conversation) => conversation.id !== conversationId);
  saveMentorConversations(next);
  if (getActiveMentorConversationId() === conversationId) {
    setActiveMentorConversationId(next[0]?.id || '');
  }
  return next;
};

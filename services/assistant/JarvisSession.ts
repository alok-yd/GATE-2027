import {
  createMentorConversation,
  getActiveMentorConversationId,
  loadMentorConversations,
  setActiveMentorConversationId,
  upsertMentorConversation,
} from '../mentor/MentorStorage';
import type { MentorConversation, MentorStoredMessage } from '../mentor/MentorStorage';
import {
  generateMentorReply,
  summarizeMentorConversation,
} from '../mentor/MentorAgent';
import type { MentorHistoryMessage } from '../mentor/MentorAgent';

const JARVIS_WELCOME = `J.A.R.V.I.S. — Just A Rather Very Intelligent System

I am your personal AI learning and goal-achievement assistant inside ACHIEVER. I can explain concepts, analyse your recorded preparation, review performance, help plan your next study block, and create supported tracker tasks when you explicitly ask.

I use current tracker records where available, distinguish verified data from estimates, and tell you when information is missing. Your existing AI Mentor conversations and saved memories are shared with this assistant.`;

const makeMessage = (
  role: MentorStoredMessage['role'],
  content: string
): MentorStoredMessage => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `jarvis_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  role,
  content: content.slice(0, 4000),
  timestamp: new Date().toISOString(),
});

const ensureConversation = (): MentorConversation => {
  const conversations = loadMentorConversations();
  const activeId = getActiveMentorConversationId();
  const active = conversations.find((conversation) => conversation.id === activeId);

  if (active) return active;

  const existing = conversations[0];
  if (existing) {
    setActiveMentorConversationId(existing.id);
    return existing;
  }

  const created = createMentorConversation([
    makeMessage('assistant', JARVIS_WELCOME),
  ]);
  setActiveMentorConversationId(created.id);
  return upsertMentorConversation(created, created.messages);
};

/**
 * J.A.R.V.I.S. deliberately reuses the existing Mentor conversation store,
 * memory retrieval and section-specific tool-calling agent. This keeps one
 * source of truth instead of creating a competing assistant history or data
 * model. Voice and text conversations are therefore visible in AI Mentor.
 */
export const getJarvisConversationSnapshot = (): MentorConversation => ensureConversation();

export const startNewJarvisConversation = (): MentorConversation => {
  const created = createMentorConversation([
    makeMessage('assistant', JARVIS_WELCOME),
  ]);
  setActiveMentorConversationId(created.id);
  return upsertMentorConversation(created, created.messages);
};

export const sendJarvisMessage = async (
  prompt: string,
  signal?: AbortSignal
): Promise<{ content: string; model: string; toolCalling: boolean; conversation: MentorConversation }> => {
  const cleanPrompt = prompt.trim().slice(0, 4000);
  if (!cleanPrompt) throw new Error('Please enter a message for J.A.R.V.I.S.');
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');

  const current = ensureConversation();
  const requestMessages = [...current.messages, makeMessage('user', cleanPrompt)].slice(-60);
  const savedWithUser = upsertMentorConversation(current, requestMessages);

  const history: MentorHistoryMessage[] = savedWithUser.messages
    .slice(-14)
    .map((message) => ({ role: message.role, content: message.content }));

  const result = await generateMentorReply({
    messages: history,
    mode: 'chat',
    summary: savedWithUser.summary || '',
    signal,
  });

  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');

  let updated = upsertMentorConversation(savedWithUser, [
    ...savedWithUser.messages,
    makeMessage('assistant', result.content),
  ]);

  // Reuse the existing bounded conversation summarisation policy so long
  // voice sessions retain continuity without sending the full transcript.
  const targetCount = Math.max(0, updated.messages.length - 10);
  const alreadySummarized = updated.summarizedMessageCount || 0;
  if (targetCount >= 18 && targetCount - alreadySummarized >= 12) {
    try {
      const summary = await summarizeMentorConversation(
        updated.messages.slice(0, targetCount).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        updated.summary || ''
      );
      updated = upsertMentorConversation(
        updated,
        updated.messages,
        summary,
        targetCount
      );
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Conversation summary was not updated.', error);
    }
  }

  return { ...result, conversation: updated };
};

export const JARVIS_DAILY_BRIEFING_PROMPT =
  'Prepare my J.A.R.V.I.S. daily intelligence briefing from current ACHIEVER records. Retrieve the relevant configured goal/exam date, Roadmap, Lecture Tracker, verified AI Focus time for yesterday and the last seven days, pending Revision work, measured PYQ performance, and the latest Test Performance records. Report days remaining only when the configured exam date is available. Identify the weakest subject using measured accuracy where recorded; clearly label any proxy or missing data. Give me three evidence-based priorities for today and a realistic time allocation. Do not include Health Tracker information unless I ask for it. Do not invent values, dates, tasks, or completed actions. Do not create tracker tasks unless I explicitly request insertion.';

export const JARVIS_PREPARATION_REVIEW_PROMPT =
  'Analyse my overall preparation using the current Roadmap, Lecture Tracker, AI Focus, PYQ Execution Tracker, Test Performance, Revision, AI Analytics and Strategy & Tips records. Explain the strongest areas, the most important weaknesses, recent trends, data gaps, and the next three corrective actions. Use exact tracker evidence, distinguish measured values from estimates, and do not promise an examination rank.';

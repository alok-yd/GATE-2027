import type { MentorMode } from '../mentor/MentorAgent';
import type { JarvisAgentId } from './JarvisAgentRegistry';

export interface JarvisExecutionPlan {
  mode: 'direct' | 'single-agent' | 'multi-agent';
  reason: string;
  agents: JarvisAgentId[];
  maxParallelAgents: number;
  readOnly: boolean;
}

const hasExplicitLectureTrackerWriteRequest = (prompt: string): boolean => {
  const text = prompt.toLowerCase();
  if (/\b(don't|do not|never|no need to)\s+(add|create|insert|save|schedule)\b/i.test(text)) {
    return false;
  }
  const action = /\b(add|create|insert|save|schedule)\b/i.test(text);
  const destination = /\b(lecture tracker|daily study log|my tracker|the tracker)\b/i.test(text);
  const task = /\b(task|tasks|study plan|daily plan)\b/i.test(text);
  return action && (destination || task && /\b(lecture tracker|tracker)\b/i.test(text));
};

const hasLectureStudyHoursIntent = (prompt: string): boolean =>
  /\b(lecture tracker|daily study log|study hours?|hours studied|total studied|historical study records|daily study duration)\b/i.test(prompt) ||
  (/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/i.test(prompt) &&
    /\b(every day|each day|daily|for \d{1,2}|from \d{1,2}|between \d{1,2}|on \d{1,2}|date range)\b/i.test(prompt));

const isOverallPreparationRequest = (prompt: string): boolean =>
  /overall preparation|overall gate preparation|comprehensive preparation analysis|full preparation analysis|analyse my preparation|analyze my preparation|how is my (?:gate )?preparation|preparation status|overall progress|complete preparation review|daily intelligence briefing|daily briefing|all sections|all tracker data|full workspace|complete workspace|entire achiever|everything in achiever|complete app snapshot/i.test(prompt);

const hasAcademicIntent = (prompt: string): boolean =>
  /roadmap|syllabus|subject completion|lecture completion|remaining subjects|remaining syllabus|milestone|study plan|what should i study|today.?s? target|tomorrow.?s? plan|plan for tomorrow|daily target|preparation strategy|prepare for gate|gate preparation|predict my air|predicted air|air readiness|rank prediction|expected marks|gate score|college compatibility|what.if simulation/i.test(prompt);

const hasPerformanceIntent = (prompt: string): boolean =>
  /mock|test performance|test score|test history|marks|negative marks|accuracy|performance trend|weak subject|weak area|weak topic|top weak|weakest subject|test analysis|analyse my tests|analyze my tests/i.test(prompt);

const hasFocusIntent = (prompt: string): boolean =>
  /ai focus|focus timer|verified study|verified hours|study hours|study time|consistency|focus session|time at desk/i.test(prompt);

const hasRevisionIntent = (prompt: string): boolean =>
  /revision|revise|revising|second pass|second-pass|forgetting|forgotten|retention|recall practice|revision plan/i.test(prompt);

const hasResearchIntent = (prompt: string): boolean =>
  /research|research paper|paper review|literature review|academic source|arxiv|crossref|latest (?:ai|ml|llm)|research methodology|compare research/i.test(prompt);

const hasConceptIntent = (prompt: string): boolean => {
  const explicitConceptRequest =
    /teach me|concept|derive|derivation|solve this|solve the|numerical|problem step by step|why does|how does .* work/i.test(prompt);
  const asksToExplain = /\bexplain\b/i.test(prompt);
  const isSectionAnalysis =
    hasWellnessIntent(prompt) ||
    hasPerformanceIntent(prompt) ||
    hasFocusIntent(prompt) ||
    hasAcademicIntent(prompt) ||
    hasRevisionIntent(prompt) ||
    hasResearchIntent(prompt);
  return explicitConceptRequest || (asksToExplain && !isSectionAnalysis);
};

const hasWellnessIntent = (prompt: string): boolean =>
  /health|wellness|sleep|stress|spo2|oxygen|heart.?rate|steps|hydration|mood|symptom|supplement|vitamin|omega|magnesium|sky|sudarshan|meditation|no.?fap|fatigue|tired|recovery|habit challenge|missed.{0,12}days?|broken streak/i.test(prompt);

/**
 * A deterministic, low-cost router: trivial questions remain on the existing
 * Mentor path; complex cross-domain requests are delegated to a bounded set of
 * read-only specialists. Health is never added unless the request explicitly
 * contains a health/wellness intent.
 */
export const planJarvisExecution = (
  prompt: string,
  conversationMode: MentorMode = 'chat'
): JarvisExecutionPlan => {
  const text = prompt.trim();
  if (!text) {
    return { mode: 'direct', reason: 'Empty request', agents: [], maxParallelAgents: 0, readOnly: true };
  }

  // Operational daily study-hour requests use the main Mentor tool set so authenticated reads/writes and verification stay together.
  if (hasExplicitLectureTrackerWriteRequest(text) || hasLectureStudyHoursIntent(text)) {
    return {
      mode: 'direct',
      reason: 'Lecture Tracker task and daily study-hour operations use the permission-checked Mentor tool path.',
      agents: [],
      maxParallelAgents: 0,
      readOnly: false,
    };
  }

  if (isOverallPreparationRequest(text)) {
    const agents: JarvisAgentId[] = [
      'academic-strategist',
      'performance-analyst',
      'focus-consistency',
      'revision-planner',
    ];
    const explicitWellnessRequest = hasWellnessIntent(text);
    if (explicitWellnessRequest) agents.push('wellness-agent');
    const maxAgents = explicitWellnessRequest ? 5 : 4;
    return {
      mode: 'multi-agent',
      reason: 'Cross-domain preparation review requires independent academic, performance, focus and revision evidence.',
      agents: agents.slice(0, maxAgents),
      maxParallelAgents: maxAgents,
      readOnly: true,
    };
  }

  const agents: JarvisAgentId[] = [];
  if (hasWellnessIntent(text)) agents.push('wellness-agent');
  if (hasResearchIntent(text)) agents.push('research-agent');
  if (hasPerformanceIntent(text)) agents.push('performance-analyst');
  if (hasFocusIntent(text)) agents.push('focus-consistency');
  if (hasRevisionIntent(text)) agents.push('revision-planner');
  if (hasAcademicIntent(text)) agents.push('academic-strategist');

  if (hasConceptIntent(text) || conversationMode === 'concept' || conversationMode === 'problem') {
    agents.push('concept-tutor');
  }

  // Daily plans benefit from both current academic priorities and revision evidence.
  const isDailyPlanRequest =
    /plan my day|daily plan|what should i study (today|tomorrow)|today.?s? target|tomorrow.?s? plan|plan for tomorrow|what next|next steps/i.test(text);
  if (
    isDailyPlanRequest ||
    (agents.length === 0 && conversationMode === 'strategy')
  ) {
    if (!agents.includes('academic-strategist')) agents.push('academic-strategist');
    if (!agents.includes('revision-planner')) agents.push('revision-planner');
  }

  const uniqueAgents = [...new Set(agents)].slice(0, 4);
  if (uniqueAgents.length === 0) {
    return {
      mode: 'direct',
      reason: 'Simple conversational request; avoid unnecessary specialist calls.',
      agents: [],
      maxParallelAgents: 0,
      readOnly: true,
    };
  }

  return {
    mode: uniqueAgents.length > 1 ? 'multi-agent' : 'single-agent',
    reason: uniqueAgents.length > 1
      ? 'Multiple independent domains are present; run only the relevant read-only specialists.'
      : 'One specialist has the relevant section-specific responsibility.',
    agents: uniqueAgents,
    maxParallelAgents: uniqueAgents.length > 1 ? uniqueAgents.length : 1,
    readOnly: true,
  };
};

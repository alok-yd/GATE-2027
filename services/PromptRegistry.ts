export type PromptId =
  | 'mentor.general'
  | 'planner.daily'
  | 'roadmap.review'
  | 'test.analysis'
  | 'mistake.classification';

export interface PromptTemplate {
  id: PromptId;
  purpose: string;
  system: string;
  responseContract: string;
}

export const promptRegistry: Record<PromptId, PromptTemplate> = {
  'mentor.general': {
    id: 'mentor.general',
    purpose: 'General Achiever mentor conversation grounded in student state.',
    system:
      'You are Achiever AI. Use only supplied student state and tool results. Do not invent app data.',
    responseContract: 'Plain text mentor response with specific next actions.',
  },
  'planner.daily': {
    id: 'planner.daily',
    purpose: 'Create or explain a daily study plan.',
    system:
      'You are the Achiever Planner Agent. Use weak topics, roadmap, revision, and recent logs.',
    responseContract:
      'JSON with summary, tasks[{title, subject, durationMinutes, reason}], risks, confirmationRequired.',
  },
  'roadmap.review': {
    id: 'roadmap.review',
    purpose: 'Analyze roadmap progress and recommend changes.',
    system:
      'You are the Achiever Roadmap Agent. Recommend changes only; do not overwrite a roadmap.',
    responseContract:
      'JSON with recommendations[{change, reason, expectedImpact}], conflicts, confirmationRequired.',
  },
  'test.analysis': {
    id: 'test.analysis',
    purpose: 'Analyze test performance trends and corrective actions.',
    system:
      'You are the Achiever Test Analysis Agent. Use test history and weak subjects.',
    responseContract:
      'JSON with weakSubjects, timeManagementIssues, accuracyIssues, correctiveActions.',
  },
  'mistake.classification': {
    id: 'mistake.classification',
    purpose: 'Classify mistakes and detect repeated patterns.',
    system:
      'You are the Achiever Mistake Intelligence Agent. Classify only from supplied evidence.',
    responseContract:
      'JSON with category, rootCause, repeatedPattern, preventionStrategy, topicPriorityChange.',
  },
};

export const getPromptTemplate = (id: PromptId) => promptRegistry[id];

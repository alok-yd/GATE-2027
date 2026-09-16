import { getCurrentPhaseSummary, getStudentProfile } from './DataExtractor';
import { studentStateEngine } from './StudentStateEngine';
import {
  classifyAndSaveMistake,
  createMemory,
  createStudyTask,
  getBehaviorProfile,
  getMistakePatterns,
  getWellnessSummary,
  listMemories,
  listMistakes,
  listRoadmapImports,
  listTestAnalyses,
  saveManualTestAnalysis,
  searchKnowledge,
} from './AINativeServices';

export type ToolName =
  | 'get_student_progress'
  | 'get_today_plan'
  | 'get_roadmap'
  | 'get_weak_topics'
  | 'get_recent_mistakes'
  | 'get_test_results'
  | 'get_revision_status'
  | 'search_study_material'
  | 'search_pyqs'
  | 'create_study_task'
  | 'update_planner'
  | 'update_roadmap'
  | 'save_mistake'
  | 'analyze_test'
  | 'start_focus_session'
  | 'end_focus_session'
  | 'get_focus_history'
  | 'get_behavior_profile'
  | 'get_wellness_summary'
  | 'get_ai_memory'
  | 'save_ai_memory';

export interface ToolCallResult {
  tool: ToolName;
  ok: boolean;
  data: unknown;
}

type ToolHandler = () => ToolCallResult;
type ToolHandlerWithArgs = (args?: unknown) => ToolCallResult;

const weakTopics = () => {
  const profile = getStudentProfile();
  return profile.subjects
    .filter((subject) => subject.accuracy < 82 || subject.completionRate < 85)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((subject) => ({
      subject: subject.name,
      accuracy: subject.accuracy,
      completionRate: subject.completionRate,
      weakTopics: subject.weakTopics,
    }));
};

const getArgString = (args: unknown, key: string, fallback = '') => {
  if (!args || typeof args !== 'object') return fallback;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : fallback;
};

const getArgNumber = (args: unknown, key: string, fallback = 0) => {
  if (!args || typeof args !== 'object') return fallback;
  const value = Number((args as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : fallback;
};

const tools: Record<ToolName, ToolHandlerWithArgs> = {
  get_student_progress: () => ({
    tool: 'get_student_progress',
    ok: true,
    data: studentStateEngine.getSnapshot(),
  }),
  get_today_plan: () => ({
    tool: 'get_today_plan',
    ok: true,
    data: studentStateEngine.getRelevantSnapshot('planner'),
  }),
  get_roadmap: () => ({
    tool: 'get_roadmap',
    ok: true,
    data: getCurrentPhaseSummary(),
  }),
  get_weak_topics: () => ({
    tool: 'get_weak_topics',
    ok: true,
    data: weakTopics(),
  }),
  get_recent_mistakes: () => ({
    tool: 'get_recent_mistakes',
    ok: true,
    data: {
      mistakes: listMistakes().slice(0, 10),
      patterns: getMistakePatterns().slice(0, 10),
    },
  }),
  get_test_results: () => ({
    tool: 'get_test_results',
    ok: true,
    data: {
      mocks: getStudentProfile().mocks.slice(-10),
      analyses: listTestAnalyses().slice(0, 10),
    },
  }),
  get_revision_status: () => ({
    tool: 'get_revision_status',
    ok: true,
    data: getStudentProfile().revisionProgress,
  }),
  search_study_material: (args) => ({
    tool: 'search_study_material',
    ok: true,
    data: searchKnowledge(getArgString(args, 'query', 'study material')),
  }),
  search_pyqs: (args) => ({
    tool: 'search_pyqs',
    ok: true,
    data: searchKnowledge(`${getArgString(args, 'query', '')} pyq previous year question`),
  }),
  create_study_task: (args) => {
    const title = getArgString(args, 'title', 'AI-created study task');
    const subject = getArgString(args, 'subject', 'General');
    const date = getArgString(args, 'date', new Date().toISOString().split('T')[0]);
    createStudyTask({
      id: `tool_task_${Date.now()}`,
      title,
      subject,
      date,
      durationMinutes: Math.max(15, getArgNumber(args, 'durationMinutes', 60)),
      priority: 'medium',
      dependencies: [],
      sourceLine: title,
    });
    return {
      tool: 'create_study_task',
      ok: true,
      data: { title, subject, date },
    };
  },
  update_planner: (args) => tools.create_study_task(args),
  update_roadmap: () => ({
    tool: 'update_roadmap',
    ok: false,
    data: {
      reason:
        'Roadmap updates require a user-confirmed roadmap import preview. Direct overwrite is blocked by policy.',
      pendingPreviews: listRoadmapImports().filter((item) => item.status === 'preview').slice(0, 5),
    },
  }),
  save_mistake: (args) => ({
    tool: 'save_mistake',
    ok: true,
    data: classifyAndSaveMistake({
      subject: getArgString(args, 'subject', 'General'),
      topic: getArgString(args, 'topic', 'Unspecified topic'),
      question: getArgString(args, 'question', 'Manual mistake entry'),
      studentAnswer: getArgString(args, 'studentAnswer', 'Not provided'),
      correctAnswer: getArgString(args, 'correctAnswer', 'Not provided'),
    }),
  }),
  analyze_test: (args) => ({
    tool: 'analyze_test',
    ok: true,
    data: saveManualTestAnalysis(getArgString(args, 'text', 'Manual test analysis requested.')),
  }),
  start_focus_session: () => {
    localStorage.setItem(
      'gate_focus_timer_state',
      JSON.stringify({
        isRunning: true,
        elapsedSeconds: 0,
        protocolPhase: 'study',
        protocolRemainingSeconds: 50 * 60,
        updatedAt: Date.now(),
      })
    );
    window.dispatchEvent(new Event('storage'));
    return { tool: 'start_focus_session', ok: true, data: { started: true } };
  },
  end_focus_session: () => {
    const existing = localStorage.getItem('gate_focus_timer_state');
    localStorage.setItem(
      'gate_focus_timer_state',
      JSON.stringify({
        ...(existing ? JSON.parse(existing) : {}),
        isRunning: false,
        updatedAt: Date.now(),
      })
    );
    window.dispatchEvent(new Event('storage'));
    return { tool: 'end_focus_session', ok: true, data: { ended: true } };
  },
  get_focus_history: () => ({
    tool: 'get_focus_history',
    ok: true,
    data: getBehaviorProfile(),
  }),
  get_behavior_profile: () => ({
    tool: 'get_behavior_profile',
    ok: true,
    data: getBehaviorProfile(),
  }),
  get_wellness_summary: () => ({
    tool: 'get_wellness_summary',
    ok: true,
    data: getWellnessSummary(),
  }),
  get_ai_memory: () => ({
    tool: 'get_ai_memory',
    ok: true,
    data: listMemories().slice(0, 20),
  }),
  save_ai_memory: (args) => ({
    tool: 'save_ai_memory',
    ok: true,
    data: createMemory({
      category: 'study_pattern',
      title: getArgString(args, 'title', 'AI memory note'),
      content: getArgString(args, 'content', 'Memory content not provided.'),
    }),
  }),
};

export class ToolRegistry {
  listTools() {
    return Object.keys(tools) as ToolName[];
  }

  execute(name: ToolName, args?: unknown): ToolCallResult {
    try {
      return tools[name](args);
    } catch (error) {
      return {
        tool: name,
        ok: false,
        data: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();

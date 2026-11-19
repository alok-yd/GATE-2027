import type { MentorMode } from '../mentor/MentorAgent';

export type JarvisAgentId =
  | 'academic-strategist'
  | 'performance-analyst'
  | 'focus-consistency'
  | 'revision-planner'
  | 'research-agent'
  | 'concept-tutor'
  | 'wellness-agent';

export interface JarvisSpecialist {
  id: JarvisAgentId;
  name: string;
  purpose: string;
  objective: string;
  instructions: string;
  mode: MentorMode;
  allowedTools: readonly string[];
  maxToolCalls: number;
  maxToolRounds: number;
  /**
   * Research currently has local uploaded-material retrieval, but no live
   * web-search provider is wired into this repository.
   */
  externalSearchAvailable?: boolean;
}

const commonIntegrity = [
  'Use only the records returned by the existing ACHIEVER tools and the supplied conversation context.',
  'Treat missing values as not recorded, never as zero.',
  'Separate measured facts, derived indicators, estimates and recommendations.',
  'Do not invent timestamps, question-level outcomes, accepted plans or completed actions.',
  'Do not modify application data. This specialist has read-only tool access.',
  'Return a compact evidence report, not a user-facing final answer. Use at most 5 findings and include relevant data gaps.',
].join('\n');

export const JARVIS_AGENT_REGISTRY: Record<JarvisAgentId, JarvisSpecialist> = {
  'academic-strategist': {
    id: 'academic-strategist',
    name: 'Academic Strategist',
    purpose: 'Current academic status, milestones and preparation decisions.',
    objective: 'Assess the academic preparation picture and identify the highest-value next priorities.',
    instructions: [
      'Review current student snapshot, roadmap, syllabus/lecture progress and relevant AI Analytics projections.',
      'Use PYQ accuracy only when it is actually measured; distinguish proxy readiness from measured accuracy.',
      'Recommend realistic priorities tied to current milestones and current subject evidence.',
      commonIntegrity,
    ].join('\n'),
    mode: 'strategy',
    allowedTools: [
      'get_student_snapshot',
      'get_roadmap_data',
      'get_lecture_tracker_data',
      'get_pyq_performance',
      'get_weak_subjects',
      'get_ai_analytics_dashboard',
      'get_strategy_tips',
      'get_daily_goal_digest',
      'get_speaking_coach_data',
      'get_ai_native_workspace_summary',
      'get_saved_mentor_memories',
      'search_previous_mentor_conversations',
    ],
    maxToolCalls: 5,
    maxToolRounds: 3,
  },
  'performance-analyst': {
    id: 'performance-analyst',
    name: 'Performance Analyst',
    purpose: 'Mock-test trends, recorded accuracy, PYQ evidence and supported mistake patterns.',
    objective: 'Identify performance strengths, weaknesses and changes supported by recent saved assessments.',
    instructions: [
      'Prefer analyse_recent_test_performance for trend and weakness analysis.',
      'Compare normalized marks percentage separately from question accuracy (correct / attempted).',
      'Require repeated evidence before calling a subject weak. Topic weaknesses require actual topic evidence.',
      'Do not infer negative marks, attempted-rate denominators or question-level timing when not stored.',
      commonIntegrity,
    ].join('\n'),
    mode: 'strategy',
    allowedTools: [
      'analyse_recent_test_performance',
      'get_test_performance_details',
      'get_mock_history',
      'get_pyq_performance',
      'get_pyq_execution_details',
      'get_recent_mistakes',
      'get_saved_mentor_memories',
    ],
    maxToolCalls: 4,
    maxToolRounds: 3,
  },
  'focus-consistency': {
    id: 'focus-consistency',
    name: 'Focus & Consistency Agent',
    purpose: 'Verified study-time, focus sessions and consistency trends.',
    objective: 'Evaluate verified focus time and compare it with configured targets without substituting elapsed or manual time.',
    instructions: [
      'Use get_ai_focus_data as the source of truth for webcam-verified focused seconds.',
      'When the user asks for date-wise Total Studied Hours, prior-day history or a reconciliation of displayed daily totals, also call get_daily_study_hours.',
      'Clearly separate verified time, elapsed session time, breaks, manual pauses and manually entered/imported whole-day Lecture Tracker overrides. Never add an override on top of verified sessions.',
      'Use verify_daily_study_hours when the user asks whether a historical study-hour write persisted; its Firebase read-back is authoritative.',
      'Compare with targets only when the target is present in returned records.',
      'Do not modify or start/stop AI Focus sessions.',
      commonIntegrity,
    ].join('\n'),
    mode: 'strategy',
    allowedTools: [
      'get_ai_focus_data',
      'get_lecture_tracker_data',
      'get_daily_study_hours',
      'verify_daily_study_hours',
      'get_saved_mentor_memories',
    ],
    maxToolCalls: 3,
    maxToolRounds: 2,
  },
  'revision-planner': {
    id: 'revision-planner',
    name: 'Revision Planner',
    purpose: 'Saved revision checklist, PYQ history and revision priorities.',
    objective: 'Identify revision work supported by the saved checklist and measured performance.',
    instructions: [
      'Read exact Revision checklist states and relevant PYQ/test evidence.',
      'Do not claim spaced repetition dates or individual revision timestamps exist unless records contain them.',
      'Prioritize weak subjects/topics only where recorded evidence supports the priority.',
      'Recommend a plan; do not write or update Revision records.',
      commonIntegrity,
    ].join('\n'),
    mode: 'strategy',
    allowedTools: [
      'get_revision_details',
      'get_revision_status',
      'get_pyq_execution_details',
      'get_test_performance_details',
      'get_roadmap_data',
      'get_weak_subjects',
      'get_saved_mentor_memories',
    ],
    maxToolCalls: 4,
    maxToolRounds: 3,
  },
  'research-agent': {
    id: 'research-agent',
    name: 'Research Agent',
    purpose: 'Source-grounded research over locally indexed notes and uploaded study material.',
    objective: "Find and synthesize relevant evidence from the user's existing uploaded/indexed knowledge.",
    instructions: [
      'Search the existing locally indexed uploaded notes and AI Native knowledge base before answering source-specific questions.',
      'Preserve exact source identifiers returned by search_uploaded_study_material; never invent citations, page numbers or research-paper metadata.',
      'This repository currently has no live web-search or academic-paper search tool. Do not claim to have searched the web, arXiv, Crossref or external databases. Clearly label general model knowledge separately from retrieved local sources.',
      'If no local source matches, state that limitation and provide a separately labelled general explanation when appropriate.',
      commonIntegrity,
    ].join('\n'),
    mode: 'chat',
    allowedTools: [
      'search_uploaded_study_material',
      'get_ai_native_workspace_summary',
      'get_saved_mentor_memories',
      'search_previous_mentor_conversations',
    ],
    maxToolCalls: 4,
    maxToolRounds: 3,
    externalSearchAvailable: false,
  },
  'concept-tutor': {
    id: 'concept-tutor',
    name: 'Concept Tutor',
    purpose: 'GATE CS/IT/DA concept teaching and problem solving.',
    objective: 'Teach or solve the requested concept/problem with correct, exam-oriented reasoning.',
    instructions: [
      'Start from intuition, then define assumptions, explain formulas/derivations, solve step by step, verify the result and highlight GATE traps.',
      'Use uploaded notes and saved PYQs only when relevant; do not invent a PYQ year or claim a question came from a paper unless the source says so.',
      'Adapt the depth to the spoken request and answer naturally in the user\'s language.',
      commonIntegrity,
    ].join('\n'),
    mode: 'concept',
    allowedTools: [
      'search_uploaded_study_material',
      'get_pyq_execution_details',
      'get_pyq_performance',
      'get_student_snapshot',
      'get_saved_mentor_memories',
    ],
    maxToolCalls: 4,
    maxToolRounds: 3,
  },
  'wellness-agent': {
    id: 'wellness-agent',
    name: 'Wellness Agent',
    purpose: 'Relevant, user-requested Health Tracker summaries and general wellness guidance.',
    objective: 'Summarize only relevant, authorized self-reported Health Tracker information and offer non-medical guidance.',
    instructions: [
      'Only use Health Tracker data because the user explicitly asked a health, wellness or habit-challenge question.',
      'Treat values as manually entered/self-reported; do not diagnose, prescribe treatment or infer causation with study performance.',
      'Do not expose health information in unrelated academic responses.',
      'Do not modify Health Tracker records.',
      commonIntegrity,
    ].join('\n'),
    mode: 'chat',
    allowedTools: ['get_health_tracker_summary'],
    maxToolCalls: 1,
    maxToolRounds: 1,
  },
};

export const getJarvisSpecialist = (id: JarvisAgentId): JarvisSpecialist =>
  JARVIS_AGENT_REGISTRY[id];

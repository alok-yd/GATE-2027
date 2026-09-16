import { getStudentProfile } from './DataExtractor';
import { StudentProfile } from '../types';
import {
  getAIObservabilitySnapshot,
  getBehaviorProfile,
  getMistakePatterns,
  getWellnessSummary,
  listDocuments,
  listMemories,
  listMistakes,
  listTestAnalyses,
} from './AINativeServices';

export interface StudentStateSnapshot {
  academic_state: Pick<StudentProfile, 'subjects' | 'pyqPerformance'>;
  focus_state: {
    dailyHours: number;
    consistencyScore: number;
    streakDays: number;
  };
  behavior_state: unknown;
  wellness_state: unknown;
  nutrition_state: unknown;
  revision_state: StudentProfile['revisionProgress'];
  test_state: Pick<StudentProfile, 'mocks'>;
  mistake_state: {
    recentMistakes: ReturnType<typeof listMistakes>;
    patterns: ReturnType<typeof getMistakePatterns>;
  };
  roadmap_state: StudentProfile['roadmapProgress'] & {
    currentPhase: string;
    daysTillExam: number;
  };
  document_state: {
    documents: Array<{
      id: string;
      name: string;
      purpose: string;
      createdAt: string;
      extractionConfidence: number;
    }>;
    testAnalyses: ReturnType<typeof listTestAnalyses>;
  };
  memory_state: ReturnType<typeof listMemories>;
  goals: StudentProfile['target'];
}

export class StudentStateEngine {
  getSnapshot(): StudentStateSnapshot {
    const profile = getStudentProfile();
    return {
      academic_state: {
        subjects: profile.subjects,
        pyqPerformance: profile.pyqPerformance,
      },
      focus_state: {
        dailyHours: profile.studyMetrics.dailyHours,
        consistencyScore: profile.studyMetrics.consistencyScore,
        streakDays: profile.studyMetrics.streakDays,
      },
      behavior_state: getBehaviorProfile(),
      wellness_state: getWellnessSummary(),
      nutrition_state: getWellnessSummary(),
      revision_state: profile.revisionProgress,
      test_state: {
        mocks: profile.mocks.slice(-10),
      },
      mistake_state: {
        recentMistakes: listMistakes().slice(0, 10),
        patterns: getMistakePatterns().slice(0, 10),
      },
      roadmap_state: {
        ...profile.roadmapProgress,
        currentPhase: profile.currentPhase,
        daysTillExam: profile.daysTillExam,
      },
      document_state: {
        documents: listDocuments()
          .slice(0, 12)
          .map((document) => ({
            id: document.id,
            name: document.name,
            purpose: document.purpose,
            createdAt: document.createdAt,
            extractionConfidence: document.extractionConfidence,
          })),
        testAnalyses: listTestAnalyses().slice(0, 10),
      },
      memory_state: listMemories().slice(0, 12),
      goals: profile.target,
    };
  }

  getRelevantSnapshot(intent: string): Partial<StudentStateSnapshot> {
    const snapshot = this.getSnapshot();
    if (intent === 'planner') {
      return {
        academic_state: snapshot.academic_state,
        focus_state: snapshot.focus_state,
        revision_state: snapshot.revision_state,
        roadmap_state: snapshot.roadmap_state,
        mistake_state: snapshot.mistake_state,
        memory_state: snapshot.memory_state,
        goals: snapshot.goals,
      };
    }
    if (intent === 'test') {
      return {
        academic_state: snapshot.academic_state,
        test_state: snapshot.test_state,
        mistake_state: snapshot.mistake_state,
        document_state: snapshot.document_state,
        goals: snapshot.goals,
      };
    }
    if (intent === 'mistake') {
      return {
        academic_state: snapshot.academic_state,
        mistake_state: snapshot.mistake_state,
        test_state: snapshot.test_state,
        memory_state: snapshot.memory_state,
        goals: snapshot.goals,
      };
    }
    if (intent === 'roadmap') {
      return {
        academic_state: snapshot.academic_state,
        roadmap_state: snapshot.roadmap_state,
        revision_state: snapshot.revision_state,
        test_state: snapshot.test_state,
        mistake_state: snapshot.mistake_state,
        document_state: snapshot.document_state,
        goals: snapshot.goals,
      };
    }
    return snapshot;
  }

  async getObservabilitySnapshot() {
    return getAIObservabilitySnapshot();
  }
}

export const studentStateEngine = new StudentStateEngine();

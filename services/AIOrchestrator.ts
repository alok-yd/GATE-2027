import { getPromptTemplate, PromptId } from './PromptRegistry';
import { studentStateEngine } from './StudentStateEngine';
import { toolRegistry, ToolName } from './ToolRegistry';
import { searchKnowledge } from './AINativeServices';

export interface OrchestratedRequest {
  prompt: string;
  intent: 'planner' | 'roadmap' | 'test' | 'mistake' | 'mentor';
  promptId: PromptId;
  tools: ToolName[];
  context: unknown;
}

const routeIntent = (input: string): OrchestratedRequest['intent'] => {
  const lower = input.toLowerCase();
  if (lower.includes('roadmap')) return 'roadmap';
  if (lower.includes('test') || lower.includes('mock')) return 'test';
  if (lower.includes('mistake') || lower.includes('wrong')) return 'mistake';
  if (lower.includes('plan') || lower.includes('today') || lower.includes('tomorrow')) return 'planner';
  return 'mentor';
};

const promptForIntent = (intent: OrchestratedRequest['intent']): PromptId => {
  if (intent === 'planner') return 'planner.daily';
  if (intent === 'roadmap') return 'roadmap.review';
  if (intent === 'test') return 'test.analysis';
  if (intent === 'mistake') return 'mistake.classification';
  return 'mentor.general';
};

const toolsForIntent = (intent: OrchestratedRequest['intent']): ToolName[] => {
  if (intent === 'planner') {
    return ['get_today_plan', 'get_weak_topics', 'get_revision_status', 'get_recent_mistakes'];
  }
  if (intent === 'roadmap') {
    return ['get_roadmap', 'get_student_progress', 'get_test_results', 'get_recent_mistakes'];
  }
  if (intent === 'test') return ['get_test_results', 'get_weak_topics', 'get_recent_mistakes'];
  if (intent === 'mistake') return ['get_recent_mistakes', 'get_weak_topics', 'get_test_results'];
  return ['get_student_progress', 'get_ai_memory', 'get_wellness_summary'];
};

export class AchieverAIOrchestrator {
  buildRequest(userInput: string): OrchestratedRequest {
    const intent = routeIntent(userInput);
    const promptId = promptForIntent(intent);
    const template = getPromptTemplate(promptId);
    const tools = toolsForIntent(intent);
    const toolResults = tools.map((tool) => toolRegistry.execute(tool));
    const context = studentStateEngine.getRelevantSnapshot(intent);
    const retrieval = searchKnowledge(userInput);

    return {
      prompt: `${template.system}

Response contract:
${template.responseContract}

Student state:
${JSON.stringify(context)}

Tool results:
${JSON.stringify(toolResults)}

Retrieved local knowledge:
${JSON.stringify(retrieval)}

User request:
${userInput}`,
      intent,
      promptId,
      tools,
      context,
    };
  }
}

export const achieverAIOrchestrator = new AchieverAIOrchestrator();

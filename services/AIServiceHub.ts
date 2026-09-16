import {
  AIRPrediction,
  Alert,
  PerformanceAnalysis,
  RankReadiness,
  StudentProfile,
  StudyPlan,
  WeakArea,
} from '../types';
import { cleanGatewayJson, describeAIGatewayError, generateGatewayText } from './AIGatewayClient';
import { achieverAIOrchestrator } from './AIOrchestrator';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const normalizeSubjectName = (value: string) =>
  value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export class AIServiceHub {
  private lastGenerationError: string | null = null;

  getRuntimeLabel() {
    return 'Google Gemini 2.5 Flash';
  }

  getLastGenerationError() {
    return this.lastGenerationError;
  }

  private async generateText(prompt: string, system?: string) {
    this.lastGenerationError = null;
    try {
      const result = await generateGatewayText({ prompt, system });
      return result.content;
    } catch (error) {
      this.lastGenerationError = this.describeGenerationError(error);
    }
    return null;
  }

  private describeGenerationError(error: unknown) {
    return describeAIGatewayError(error);
  }

  private getGenerationFallbackReason() {
    return this.lastGenerationError
      ? `AI Gateway could not respond: ${this.lastGenerationError}`
      : 'AI Gateway could not return a generated response.';
  }

  private parseJson<T>(text: string | null, fallback: T): T {
    if (!text) return fallback;

    try {
      return JSON.parse(cleanGatewayJson(text)) as T;
    } catch (error) {
      console.warn('AI JSON parse failed, using local fallback.', error);
      return fallback;
    }
  }

  buildOrchestratedPrompt(userInput: string) {
    return achieverAIOrchestrator.buildRequest(userInput);
  }

  async askAchiever(userInput: string) {
    const request = this.buildOrchestratedPrompt(userInput);
    return this.generateText(
      request.prompt,
      'You are the Achiever AI Orchestrator. Use the supplied tool results and student-state snapshot. Do not invent application data, and do not claim state changes were applied unless a controlled tool result shows it.'
    );
  }

  private getMockAverage(studentData: StudentProfile) {
    if (studentData.mocks.length === 0) return 0;
    return average(
      studentData.mocks.map((mock) => (mock.score / Math.max(mock.totalMarks, 1)) * 100)
    );
  }

  private getReadinessScore(studentData: StudentProfile) {
    const subjectAverage = average(studentData.subjects.map((subject) => subject.accuracy));
    const mockAverage = this.getMockAverage(studentData);
    const mockComponent = mockAverage || subjectAverage - 6;
    const consistency = studentData.studyMetrics.consistencyScore;
    const weekly = studentData.studyMetrics.weeklyTargetCompletion;
    return Math.round(
      clamp(subjectAverage * 0.4 + mockComponent * 0.35 + consistency * 0.15 + weekly * 0.1, 0, 100)
    );
  }

  private getTestAccuracy(studentData: StudentProfile) {
    const attempts = studentData.mocks.reduce((sum, mock) => {
      if (mock.rightQuestions == null && mock.wrongQuestions == null) return sum;
      return sum + Number(mock.rightQuestions || 0) + Number(mock.wrongQuestions || 0);
    }, 0);

    if (attempts > 0) {
      const correct = studentData.mocks.reduce((sum, mock) => sum + Number(mock.rightQuestions || 0), 0);
      return Math.round((correct / attempts) * 1000) / 10;
    }

    return Math.round(this.getMockAverage(studentData) * 10) / 10;
  }

  private getSubjectFallbackAccuracy(studentData: StudentProfile, subjectName: string) {
    const key = normalizeSubjectName(subjectName);
    const subject = studentData.subjects.find((item) => {
      const subjectKey = normalizeSubjectName(item.name);
      return subjectKey === key || subjectKey.includes(key) || key.includes(subjectKey);
    });
    return subject?.accuracy || 0;
  }

  private buildRankReadiness(studentData: StudentProfile): RankReadiness {
    const pyqPerformance = studentData.pyqPerformance || [];
    const totalMocks = studentData.mocks.length;
    const fullMocks = studentData.mocks.filter((mock) => mock.testType === 'FULL').length;
    const revision = studentData.revisionProgress;
    const roadmap = studentData.roadmapProgress;
    const streakDays = studentData.studyMetrics.streakDays;
    const testAccuracy = this.getTestAccuracy(studentData);

    const coverageRatios = pyqPerformance.map((subject) => clamp(subject.totalSolved / 200, 0, 1));
    const weakestPYQSolved = pyqPerformance.length
      ? Math.min(...pyqPerformance.map((subject) => subject.totalSolved))
      : 0;
    const allSubjectsAbove200 =
      pyqPerformance.length > 0 && pyqPerformance.every((subject) => subject.totalSolved >= 200);
    const pyqCoverageScore = Math.round(
      clamp(average(coverageRatios) * 14 + clamp(weakestPYQSolved / 200, 0, 1) * 6, 0, 20)
    );

    const mockExecutionScore = Math.round(
      clamp(clamp(totalMocks / 70, 0, 1) * 18 + clamp(fullMocks / 50, 0, 1) * 2, 0, 20)
    );

    const revisionCycleScore =
      (revision?.cycle1Complete ? 5 : 0) +
      (revision?.cycle2Complete ? 5 : 0) +
      (revision?.cycle3Complete ? 5 : 0);
    const revisionCompletionScore = clamp(((revision?.completionRate || 0) / 100) * 15, 0, 15);
    const revisionScore = Math.round(Math.max(revisionCycleScore, revisionCompletionScore));

    const consistencyScore = Math.round(clamp(streakDays / 90, 0, 1) * 15);

    const pyqAccuracyForScoring = pyqPerformance.map((subject) =>
      subject.accuracy == null
        ? this.getSubjectFallbackAccuracy(studentData, subject.subject)
        : subject.accuracy
    );
    const pyqAccuracyScore = clamp(average(pyqAccuracyForScoring) / 90, 0, 1) * 10;
    const testAccuracyScore = clamp(testAccuracy / 90, 0, 1) * 10;
    const accuracyScore = Math.round(clamp(pyqAccuracyScore + testAccuracyScore, 0, 20));
    const everyPYQAccuracyLogged =
      pyqPerformance.length > 0 && pyqPerformance.every((subject) => subject.accuracy != null);
    const weakestPYQAccuracy = everyPYQAccuracyLogged
      ? Math.min(...pyqPerformance.map((subject) => subject.accuracy || 0))
      : null;
    const allAccuracyAbove90 =
      everyPYQAccuracyLogged &&
      pyqPerformance.every((subject) => Number(subject.accuracy) > 90) &&
      testAccuracy > 90;

    const roadmapCompletion = roadmap?.completionRate || 0;
    const roadmapScore = Math.round(clamp(roadmapCompletion / 85, 0, 1) * 10);

    const pillars = [
      {
        id: 'pyq-coverage',
        label: 'PYQ Subject Coverage',
        score: pyqCoverageScore,
        maxScore: 20,
        passed: allSubjectsAbove200,
        detail: `Weakest subject has ${weakestPYQSolved}/200 PYQs solved.`,
      },
      {
        id: 'mock-execution',
        label: 'Mock Test Execution',
        score: mockExecutionScore,
        maxScore: 20,
        passed: totalMocks > 70,
        detail: `${totalMocks} total mock/test entries logged, including ${fullMocks} full mocks.`,
      },
      {
        id: 'revision',
        label: 'Revision Completion',
        score: revisionScore,
        maxScore: 15,
        passed: Boolean(revision?.completeRevision),
        detail: `${revision?.completedTasks || 0}/${revision?.totalTasks || 0} revision tasks complete.`,
      },
      {
        id: 'consistency',
        label: 'Consistency Streak',
        score: consistencyScore,
        maxScore: 15,
        passed: streakDays > 90,
        detail: `${streakDays}/90 day streak requirement.`,
      },
      {
        id: 'accuracy',
        label: 'Accuracy Strength',
        score: accuracyScore,
        maxScore: 20,
        passed: allAccuracyAbove90,
        detail:
          weakestPYQAccuracy == null
            ? `Test accuracy is ${testAccuracy}%. PYQ subject-wise accuracy needs correct/attempted data.`
            : `Weakest PYQ accuracy is ${weakestPYQAccuracy}%; test accuracy is ${testAccuracy}%.`,
      },
      {
        id: 'roadmap',
        label: 'Roadmap Discipline',
        score: roadmapScore,
        maxScore: 10,
        passed: roadmapCompletion > 85,
        detail: `${roadmapCompletion}% roadmap completion against 85% threshold.`,
      },
    ];

    const score = Math.round(pillars.reduce((sum, pillar) => sum + pillar.score, 0));
    const hardConditions = [
      {
        label: 'Every subject has 200+ PYQs',
        passed: allSubjectsAbove200,
        detail: `Weakest subject solved count: ${weakestPYQSolved}.`,
      },
      {
        label: 'More than 70 mock tests attempted',
        passed: totalMocks > 70,
        detail: `${totalMocks} mock/test entries logged.`,
      },
      {
        label: 'Complete/multiple revision cycles done',
        passed: Boolean(revision?.completeRevision),
        detail: `${revision?.completedTasks || 0}/${revision?.totalTasks || 0} revision tasks complete.`,
      },
      {
        label: 'Consistency streak above 90 days',
        passed: streakDays > 90,
        detail: `${streakDays} day current streak.`,
      },
      {
        label: 'Every PYQ subject and tests above 90% accuracy',
        passed: allAccuracyAbove90,
        detail:
          weakestPYQAccuracy == null
            ? `Test accuracy ${testAccuracy}%; PYQ accuracy data incomplete.`
            : `Weakest PYQ accuracy ${weakestPYQAccuracy}%; test accuracy ${testAccuracy}%.`,
      },
      {
        label: 'Roadmap followed above 85%',
        passed: roadmapCompletion > 85,
        detail: `${roadmapCompletion}% roadmap completion.`,
      },
    ];

    const under50Eligible = score >= 85 && hardConditions.every((condition) => condition.passed);
    const hasMajorWeakSubject = pyqPerformance.some(
      (subject) => subject.totalSolved < 100 || (subject.accuracy != null && subject.accuracy < 75)
    );

    let range =
      score >= 92
        ? '1-10'
        : score >= 85
          ? '10-50'
          : score >= 75
            ? '50-150'
            : score >= 65
              ? '150-500'
              : score >= 50
                ? '500-1500'
                : '1500+';

    if (!under50Eligible && (range === '1-10' || range === '10-50')) {
      range = '50-150';
    }

    if (hasMajorWeakSubject && (range === '1-10' || range === '10-50' || range === '50-150')) {
      range = '150-500';
    }

    const confidence = Math.round(
      clamp(
        45 +
          hardConditions.filter((condition) => condition.passed).length * 5 +
          clamp(totalMocks / 70, 0, 1) * 10 +
          (everyPYQAccuracyLogged ? 8 : 0) +
          clamp((studentData.pyqEntries?.length || 0) / 100, 0, 1) * 5,
        45,
        under50Eligible ? 94 : 84
      )
    );

    const weakestSubjects = pyqPerformance
      .filter((subject) => subject.totalSolved < 200 || (subject.accuracy != null && subject.accuracy < 90))
      .sort((a, b) => a.totalSolved - b.totalSolved)
      .slice(0, 5)
      .map((subject) =>
        subject.accuracy == null
          ? `${subject.subject}: ${subject.totalSolved} PYQs, accuracy not logged`
          : `${subject.subject}: ${subject.totalSolved} PYQs, ${subject.accuracy}% accuracy`
      );

    return {
      score,
      range,
      confidence,
      under50Eligible,
      pillars,
      hardConditions,
      weakestSubjects,
      metrics: {
        allSubjectsAbove200,
        totalMocks,
        fullMocks,
        revisionsComplete: Boolean(revision?.completeRevision),
        streakDays,
        allAccuracyAbove90,
        roadmapCompletion,
        weakestPYQSolved,
        weakestPYQAccuracy,
        testAccuracy,
      },
    };
  }

  private localWeakAreas(studentData: StudentProfile): WeakArea[] {
    return studentData.subjects
      .map((subject) => {
        const gap = 100 - subject.accuracy;
        const completionGap = 100 - subject.completionRate;
        const roi = Math.round(subject.examWeight * gap * (0.65 + completionGap / 250));
        const priority = roi >= 260 ? 'HIGH' : roi >= 150 ? 'MEDIUM' : 'LOW';
        const topic = subject.weakTopics[0] || `${subject.name} PYQs`;

        return {
          topic,
          subject: subject.name,
          weight: subject.examWeight,
          currentScore: subject.accuracy,
          roi,
          priority,
          timeRequired: `${priority === 'HIGH' ? 10 : priority === 'MEDIUM' ? 6 : 3} hours`,
          resources: [
            `${subject.name} short notes`,
            `Last 10 years ${subject.name} PYQs`,
            'Error notebook revision',
          ],
          milestones: [
            `Raise ${subject.name} accuracy to ${Math.min(90, subject.accuracy + 12)}%`,
            `Solve 30 timed ${subject.name} questions`,
          ],
        } as WeakArea;
      })
      .filter((area) => area.currentScore < 82)
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 6);
  }

  private localAIRPrediction(studentData: StudentProfile): AIRPrediction {
    const readiness = this.buildRankReadiness(studentData);
    const failedConditions = readiness.hardConditions.filter((condition) => !condition.passed);
    const weakAreas = this.localWeakAreas(studentData).slice(0, 3);
    const optimistic = readiness.under50Eligible
      ? readiness.score >= 92
        ? 'AIR 1'
        : '1-10'
      : readiness.score >= 85
        ? '10-50'
        : readiness.score >= 75
          ? '50-150'
          : '150-500';
    const pessimistic =
      readiness.score >= 85
        ? '150-500'
        : readiness.score >= 75
          ? '500-1500'
          : readiness.score >= 65
            ? '1500+'
            : '3000+';

    return {
      mostLikely: {
        range: readiness.range,
        confidence: readiness.confidence,
      },
      optimistic: {
        range: optimistic,
        confidence: readiness.under50Eligible ? 22 : 16,
      },
      pessimistic: {
        range: pessimistic,
        confidence: readiness.under50Eligible ? 24 : 34,
      },
      keyFactors: [
        `${readiness.score}/100 rank readiness from PYQs, mocks, revision, streak, accuracy, and roadmap discipline`,
        readiness.under50Eligible
          ? 'All hard under-50 conditions are satisfied'
          : `${failedConditions.length} hard under-50 condition(s) still missing`,
        `${readiness.metrics.totalMocks} mock/test entries, ${readiness.metrics.weakestPYQSolved} PYQs in weakest subject, ${readiness.metrics.streakDays} day streak`,
      ],
      requiredImprovements:
        failedConditions.length > 0
          ? failedConditions.map((condition) => ({
              area: condition.label,
              from: 0,
              to: 1,
              impact: condition.detail,
            }))
          : weakAreas.map((area) => ({
              area: area.subject,
              from: area.currentScore,
              to: Math.min(90, area.currentScore + 12),
              impact: `High ROI: ${area.roi}`,
            })),
      readinessScore: readiness.score,
      rankReadiness: readiness,
    };
  }

  private localAlerts(studentData: StudentProfile): Alert[] {
    const weakAreas = this.localWeakAreas(studentData);
    const alerts: Alert[] = [];
    const topWeak = weakAreas[0];
    const latestMock = studentData.mocks[studentData.mocks.length - 1];
    const previousMock = studentData.mocks[studentData.mocks.length - 2];

    if (topWeak) {
      alerts.push({
        type: 'WEAK_AREA',
        severity: topWeak.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        message: `${topWeak.subject} needs attention now`,
        actionRequired: `Spend ${topWeak.timeRequired} on ${topWeak.topic}, then solve 20 timed PYQs.`,
        estimatedImpact: `ROI ${topWeak.roi}; likely +${Math.max(2, Math.round(topWeak.weight / 2))} marks ceiling`,
      });
    }

    if (studentData.studyMetrics.consistencyScore < 55) {
      alerts.push({
        type: 'STREAK_AT_RISK',
        severity: 'HIGH',
        message: 'Consistency has dropped below the safe zone',
        actionRequired: 'Log at least 90 minutes today and finish one measurable target.',
        estimatedImpact: 'Restores the daily feedback loop',
      });
    }

    if (latestMock && previousMock && latestMock.score < previousMock.score) {
      alerts.push({
        type: 'PERFORMANCE_BOOST',
        severity: 'MEDIUM',
        message: 'Recent mock trend dipped',
        actionRequired: 'Analyze the last mock for conceptual, calculation, and time-pressure errors.',
        estimatedImpact: 'Can recover 3-5 marks before the next mock',
      });
    }

    if (studentData.studyMetrics.dailyHours < 8.5) {
      alerts.push({
        type: 'TIME_MANAGEMENT',
        severity: 'MEDIUM',
        message: 'Daily study hours are below AIR-1 planner pace',
        actionRequired: 'Protect the three GATE blocks: hard revision, PYQs, then mock/error repair.',
        estimatedImpact: 'Moves you toward the 10+ hour execution rhythm',
      });
    }

    alerts.push({
      type: 'OPPORTUNITY',
      severity: 'LOW',
      message: 'Aptitude and math can lift the rank quickly',
      actionRequired: 'Reserve 30 minutes daily for GA/math speed drills.',
      estimatedImpact: 'Protects 12-15 high-confidence marks',
    });

    return alerts.slice(0, 5);
  }

  async analyzeProgress(studentData: StudentProfile): Promise<PerformanceAnalysis> {
    const weakAreas = this.localWeakAreas(studentData);
    const strongAreas = studentData.subjects
      .filter((subject) => subject.accuracy >= 80)
      .map((subject) => subject.name);
    const fallback: PerformanceAnalysis = {
      assessment: `Readiness is ${this.getReadinessScore(studentData)}%. The next best move is targeted weak-area work, not more passive logging.`,
      weakAreas: weakAreas.map((area) => area.subject),
      strongAreas,
      timeline:
        studentData.daysTillExam > 180
          ? 'Enough runway remains for deep repair plus multiple revision cycles.'
          : 'Timeline is tight, so weak-area ROI should drive each week.',
      actionItems: weakAreas.slice(0, 3).map((area) => `Finish ${area.topic} PYQs in ${area.subject}`),
    };

    const prompt = `
Return only JSON with keys assessment, weakAreas, strongAreas, timeline, actionItems.
Analyze this GATE CS 2027 profile:
${JSON.stringify(studentData, null, 2)}
Keep action items specific and measurable.
`;

    const text = await this.generateText(prompt).catch(() => null);
    return this.parseJson(text, fallback);
  }

  async identifyWeakAreas(studentData: StudentProfile): Promise<WeakArea[]> {
    const fallback = this.localWeakAreas(studentData);
    const prompt = `
Return only a JSON array of weak areas.
Each item must have topic, subject, weight, currentScore, roi, priority, timeRequired, resources, milestones.
Prioritize by GATE CS exam impact and improvement ROI.
Profile:
${JSON.stringify(studentData, null, 2)}
`;

    const text = await this.generateText(prompt).catch(() => null);
    return this.parseJson(text, fallback);
  }

  async createPersonalizedPlan(studentData: StudentProfile): Promise<StudyPlan> {
    const weakAreas = this.localWeakAreas(studentData);
    const focus = weakAreas.slice(0, 3);
    const fallback: StudyPlan = {
      weeks: [
        {
          weekNumber: 1,
          focus: ['Revision Cycle 1', 'PYQs 2015-2020', 'Error Log', ...focus.map((area) => area.subject)],
          daily: [
            {
              day: 'Monday',
              activities: [
                { type: 'revision', topic: 'Algorithms + DS', duration: 3 },
                { type: 'pyq', topic: 'Engineering Math', count: 25, duration: 2 },
                { type: 'analysis', topic: 'Error Log', duration: 1 },
              ],
              target: 'Algo + DS revision, Engineering Math PYQs, error-log entries',
            },
            {
              day: 'Tuesday',
              activities: [
                { type: 'revision', topic: 'OS + CN', duration: 3 },
                { type: 'pyq', topic: 'Aptitude', count: 30, duration: 1 },
                { type: 'analysis', topic: 'Wrong PYQs', duration: 1 },
              ],
              target: 'OS + CN revision, daily Aptitude, wrong-PYQ repair',
            },
            {
              day: 'Wednesday',
              activities: [
                { type: 'revision', topic: 'TOC + Compiler', duration: 3 },
                { type: 'pyq', topic: 'DBMS', count: 25, duration: 2 },
              ],
              target: 'TOC + CD revision and DBMS PYQs',
            },
            {
              day: 'Thursday',
              activities: [
                { type: 'analysis', topic: 'Error Log Review', duration: 3 },
                { type: 'revision', topic: 'Weak Topic Fix', duration: 3 },
              ],
              target: 'Resolve concept gaps from Mon-Wed before they repeat',
            },
            {
              day: 'Friday',
              activities: [
                { type: 'revision', topic: 'COA + Digital Logic', duration: 3 },
                { type: 'pyq', topic: 'Aptitude', count: 30, duration: 1 },
              ],
              target: 'COA + DL revision and Aptitude PYQs',
            },
            {
              day: 'Saturday',
              activities: [
                { type: 'mock', topic: 'Sectional or Full Mock', duration: 3 },
                { type: 'analysis', topic: 'Mock Analysis', duration: 3 },
              ],
              target: 'Give test in strict conditions and analyze every wrong answer',
            },
            {
              day: 'Sunday',
              activities: [
                { type: 'revision', topic: 'Light Review', duration: 2 },
                { type: 'analysis', topic: 'Recovery + Planning', duration: 1 },
              ],
              target: 'Light review only. Protect recovery for Monday performance',
            },
          ],
          milestone: focus[0]
            ? `Complete revision/PYQ repair for ${focus[0].subject} and raise accuracy toward ${Math.min(
                95,
                focus[0].currentScore + 8
              )}%`
            : 'Complete one full revision and PYQ loop',
        },
      ],
      notes: 'Aligned to the AIR-1 planner: syllabus complete, no new learning, revision + PYQs + error-log repair.',
    };

    const prompt = `
Return only JSON in the StudyPlan shape: weeks[{weekNumber, focus, daily[{day, activities, target}], milestone}], notes.
Build a one-week adaptive GATE CS plan from this profile:
${JSON.stringify(studentData, null, 2)}
Use weak-area ROI, PYQs, revision, and one measurable mock or sectional test.
`;

    const text = await this.generateText(prompt).catch(() => null);
    return this.parseJson(text, fallback);
  }

  async generateAlert(studentData: StudentProfile): Promise<Alert[]> {
    const fallback = this.localAlerts(studentData);
    const prompt = `
Return only a JSON array of 3-5 alerts.
Each alert must have type, severity, message, actionRequired, estimatedImpact.
Allowed types: WEAK_AREA, TIME_MANAGEMENT, STREAK_AT_RISK, PERFORMANCE_BOOST, OPPORTUNITY.
Allowed severity: CRITICAL, HIGH, MEDIUM, LOW.
Profile:
${JSON.stringify(studentData, null, 2)}
`;

    const text = await this.generateText(prompt).catch(() => null);
    return this.parseJson(text, fallback);
  }

  async predictAIR(studentData: StudentProfile): Promise<AIRPrediction> {
    const fallback = this.localAIRPrediction(studentData);
    const prompt = `
Return only JSON with mostLikely, optimistic, pessimistic, keyFactors, requiredImprovements.
Use this deterministic rank readiness model as the source of truth:
${JSON.stringify(fallback.rankReadiness, null, 2)}

Rules:
- Do not upgrade the mostLikely range above "${fallback.mostLikely.range}".
- Under-50 prediction is allowed only if under50Eligible is true.
- Keep confidence cautious and do not overpromise.
- Improve keyFactors and requiredImprovements using the student profile.

Student profile:
${JSON.stringify(studentData, null, 2)}
`;

    const text = await this.generateText(prompt).catch(() => null);
    const aiPrediction = this.parseJson<AIRPrediction>(text, fallback);
    return {
      ...fallback,
      keyFactors: aiPrediction.keyFactors?.length ? aiPrediction.keyFactors : fallback.keyFactors,
      requiredImprovements: aiPrediction.requiredImprovements?.length
        ? aiPrediction.requiredImprovements
        : fallback.requiredImprovements,
    };
  }

  async explainConcept(topic: string, learningStyle: string = 'visual') {
    const prompt = `
Explain this GATE CS topic for a serious 2027 aspirant: "${topic}".
Learning style: ${learningStyle}.
Structure:
1. Core idea
2. GATE pattern and formulas
3. Worked mini example
4. Common traps
5. 5 practice prompts
Keep it direct and exam-focused.
`;

    const text = await this.generateText(prompt).catch(() => null);
    if (text) return text;

    return `${this.getGenerationFallbackReason()}

Starter map for ${topic}:

Core idea: define the concept, then connect it to the exact GATE question pattern.

Study sequence:
1. Revise the definition and formula sheet.
2. Solve 5 easy examples without time pressure.
3. Solve 15 PYQs in timed mode.
4. Write every mistake in the error notebook.`;
  }

  async analyzeMistake(
    question: string,
    studentAnswer: string,
    correctAnswer: string,
    concept: string
  ) {
    const fallback = {
      mistakeType: 'Unknown',
      rootCause: 'Need the AI key for detailed classification.',
      whyWrong: 'Compare your chosen method with the correct concept path.',
      correctUnderstanding: `Revise ${concept} and solve 10 similar PYQs.`,
      similarQuestions: [],
      preventionStrategy: 'Write the trigger pattern and one prevention rule in the error notebook.',
    };

    const prompt = `
Return only JSON with mistakeType, rootCause, whyWrong, correctUnderstanding, similarQuestions, preventionStrategy.
Question: ${question}
Student answer: ${studentAnswer}
Correct answer: ${correctAnswer}
Concept: ${concept}
`;

    const text = await this.generateText(prompt).catch(() => null);
    return this.parseJson(text, fallback);
  }

  async solveProblem(question: string, includeShortcuts: boolean = true) {
    const prompt = `
Solve this GATE CS problem step by step:
${question}

Include problem reading, concept, formula/approach, solution, final answer, verification, common trap${
      includeShortcuts ? ', and any shortcut.' : '.'
    }
`;

    const text = await this.generateText(prompt).catch(() => null);
    if (text) return text;

    return `${this.getGenerationFallbackReason()}

For now, use this solving template:
1. Identify the topic and given values.
2. Write the governing formula or algorithm.
3. Solve slowly once.
4. Re-solve in exam time and compare.
5. Add the error trigger to your notebook.`;
  }

  async generateMotivationalMessage(studentData: StudentProfile) {
    const prompt = `
Write a short, specific GATE 2027 motivation message under 120 words.
Use this profile:
${JSON.stringify(studentData, null, 2)}
Include one concrete action for today.
`;

    const text = await this.generateText(prompt).catch(() => null);
    if (text) return text;

    const weakArea = this.localWeakAreas(studentData)[0];
    return weakArea
      ? `You have ${studentData.daysTillExam} days left. Today's move is simple: ${weakArea.subject}, ${weakArea.topic}, 20 timed PYQs, and clean error notes. One sharp session beats a vague long day.`
      : `You have ${studentData.daysTillExam} days left. Protect the streak, log the work, and make today's target measurable.`;
  }
}

export const aiHub = new AIServiceHub();

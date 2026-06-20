export interface OutlineItem {
  title: string;
  description: string;
  estimatedWords: number;
  subheadings: string[];
}

export interface BibliographyEntry {
  id: string;
  authors: string;
  year: string;
  title: string;
  journalOrPublisher: string;
  citationKey: string;
}

export interface VerificationReport {
  aiDetection: {
    provider: "Copyleaks" | "Originality.ai";
    score: number;
    status: "passed" | "warn" | "failed";
    details: string;
  };
  plagiarism: {
    score: number;
    status: "passed" | "warn" | "failed";
    sourcesScanned: number;
    details: string;
  };
  humanizer: {
    status: "passed" | "warn";
    gradeLevel: string;
    grammarScore: number;
    readabilityIndex: string;
    improvementsMade: string[];
  };
  dataValidation: {
    status: "passed" | "failed";
    methodologyMatch: boolean;
    sampleSizeMatch: boolean;
    details: string;
    consistencyLog: string[];
  };
}

export interface ChapterComment {
  id: string;
  paragraphIndex: number;
  authorName: string;
  text: string;
  timestamp: string;
}

export interface Chapter {
  title: string;
  content: string;
  status: "pending" | "outline" | "drafting" | "humanizing" | "completed";
  wordCount: number;
  aiOriginalityScore: number;
  plagiarismScore: number;
  citationsCount: number;
  completionTime: string;
  logs: string[];
  isApproved?: boolean;
  feedbackLogs?: { role: 'user' | 'assistant'; text: string; timestamp: string }[];
  verificationReport?: VerificationReport;
  comments?: ChapterComment[];
}

export interface ResearchProject {
  id: string;
  title: string;
  field: string;
  academicLevel: "Undergraduate" | "Postgraduate" | "MSc/MPhil" | "PhD Candidate";
  methodology: "Quantitative" | "Qualitative" | "Mixed Methods" | "Action Research" | "Systematic Literature Review";
  citationStyle: "APA 7th Edition" | "IEEE" | "Harvard" | "MLA 9th Edition" | "Chicago Style";
  wordLimit: number;
  wordCount: number;
  progress: number;
  createdAt: string;
  outline: OutlineItem[];
  chapters: {
    [chapterId: string]: Chapter;
  };
  references?: BibliographyEntry[];
  faculty?: string;
  studyDesign?: string;
  sampleSize?: string;
  studySetting?: string;
  stylePreferences?: string;
  objectiveToggle?: "generate" | "custom";
  customObjectives?: string;
  blueprintFile?: string | null;
  assetFile?: string | null;
}

export interface ContainerInstance {
  name: string;
  region: string;
  status: string;
  connections: number;
  cpu: number;
  memory: string;
}

export interface PoolStatus {
  totalSockets: number;
  openPorts: number;
  activeLlmSlots: number;
  idleLlmSlots: number;
  rateLimitBlocksSec: number;
  latencyP95: string;
}

export interface ClusterMetrics {
  activeUsers: number;
  queuedRequests: number;
  tokenThroughput: number;
  coreMemory: string;
  overallCpu: number;
  networkState: string;
  containerInstances: ContainerInstance[];
  poolStatus: PoolStatus;
  logs: string[];
  timestamp: string;
}

export interface VerificationPillar {
  name: string;
  percentage: number;
  label: string;
  status: "passed" | "warn" | "failed";
  description: string;
  metricLabel: string;
  subMetrics: { label: string; value: string | number }[];
}

export interface VerificationPillarHighlight {
  text: string;
  pillarId: "ai" | "plagiarism" | "humanizer" | "grammar" | "methodology";
  failed: boolean;
  explanation: string;
  sourceUrl?: string; // plagiarism link
}

export interface VerificationSuitePayload {
  id: string;
  fileName: string;
  fileSize: number;
  wordCount: number;
  processedAt: string;
  pillars: {
    ai: VerificationPillar;
    plagiarism: VerificationPillar;
    humanizer: VerificationPillar;
    grammar: VerificationPillar;
    methodology: VerificationPillar;
  };
  highlights: VerificationPillarHighlight[];
  isReGenerated?: boolean;
  textBlock: string;
}


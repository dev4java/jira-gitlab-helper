export interface IBugInfo {
  issueKey: string;
  summary: string;
  description: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  environment: string;
  stackTrace?: string;
  affectedVersion?: string;
  severity: string;
}

export interface ICodeSearchResult {
  filePath: string;
  lineNumber: number;
  content: string;
  relevanceScore: number;
  context: {
    before: string[];
    after: string[];
  };
}

export interface IStackTraceFrame {
  fileName: string;
  lineNumber: number;
  functionName: string;
  className?: string;
}

export interface IBugAnalysis {
  possibleCauses: Array<{
    description: string;
    confidence: number;
    relatedFiles: string[];
    evidence: string[];
  }>;
  suggestedLocations: ICodeSearchResult[];
  relatedChanges: ICodeChange[];
  analysisNotes: string[];
}

export interface ICodeChange {
  commitHash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  suspicious: boolean;
  reason?: string;
}

export interface IBugFixSuggestion {
  type: 'simple' | 'complex';
  description: string;
  rootCause: string;
  fixSteps: string[];
  codeChanges?: Array<{
    filePath: string;
    changeType: 'modify' | 'add' | 'delete';
    originalCode?: string;
    suggestedCode?: string;
    lineNumber?: number;
  }>;
  testSuggestions: string[];
  risks: string[];
}

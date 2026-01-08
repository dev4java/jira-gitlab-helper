export interface IRequirementAnalysis {
  goal: string;
  description: string;
  acceptanceCriteria: string[];
  technicalConstraints: string[];
  dependencies: string[];
  affectedCapabilities: string[];
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  needsDesignDoc: boolean;
  suggestedChangeId: string;
}

export interface IRequirementScenario {
  title: string;
  when: string;
  then: string;
  and?: string[];
}

export interface IRequirementSpec {
  requirement: string;
  description: string;
  scenarios: IRequirementScenario[];
}

export interface ITaskItem {
  id: string;
  description: string;
  dependencies?: string[];
  estimatedTime?: string;
}

export interface IOpenSpecProposal {
  changeId: string;
  why: string;
  whatChanges: string[];
  impact: {
    affectedSpecs: string[];
    affectedCode: string[];
    breakingChanges?: string[];
  };
  capabilities: Array<{
    name: string;
    specs: IRequirementSpec[];
  }>;
  tasks: ITaskItem[];
  designDoc?: {
    context: string;
    goals: string[];
    nonGoals: string[];
    decisions: Array<{
      decision: string;
      rationale: string;
      alternatives?: string[];
    }>;
    risks?: Array<{
      risk: string;
      mitigation: string;
    }>;
  };
}

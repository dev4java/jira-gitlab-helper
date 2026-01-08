export interface ICodeGenerationTask {
  id: string;
  module: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
  targetFiles: string[];
  completed: boolean;
}

export interface IProjectStructure {
  type: 'typescript' | 'javascript' | 'java' | 'python' | 'other';
  framework?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'maven' | 'gradle' | 'pip';
  sourceDirectory: string;
  testDirectory: string;
  configFiles: string[];
}

export interface IGeneratedCode {
  filePath: string;
  operation: 'create' | 'modify' | 'delete';
  content: string;
  language: string;
  imports?: string[];
}

export interface ICodeDiff {
  filePath: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

export interface IDependency {
  name: string;
  version: string;
  type: 'production' | 'development';
}

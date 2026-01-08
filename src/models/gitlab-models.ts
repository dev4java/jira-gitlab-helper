export interface IGitlabProject {
  id: number;
  name: string;
  path: string;
  pathWithNamespace: string;
  httpUrlToRepo: string;
  defaultBranch: string;
}

export interface IGitlabBranch {
  name: string;
  commit: {
    id: string;
    shortId: string;
    message: string;
  };
  protected: boolean;
}

export interface IGitlabMergeRequest {
  iid: number;
  id: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'locked' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
  webUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface IGitlabDiscussion {
  id: string;
  notes: IGitlabNote[];
  resolved?: boolean;
}

export interface IGitlabNote {
  id: number;
  body: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
  createdAt: string;
  resolvable: boolean;
  resolved: boolean;
  position?: {
    baseSha: string;
    startSha: string;
    headSha: string;
    oldPath: string;
    newPath: string;
    positionType: string;
    oldLine?: number;
    newLine?: number;
  };
}

export interface ICodeSuggestion {
  id: string;
  filePath: string;
  oldLine?: number;
  newLine?: number;
  body: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  type: 'error' | 'warning' | 'suggestion';
}

export interface ICommitFile {
  action: 'create' | 'update' | 'delete';
  filePath: string;
  content?: string;
  previousPath?: string;
  encoding?: 'text' | 'base64';
}

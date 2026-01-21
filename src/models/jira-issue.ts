export enum JiraIssueType {
  Story = 'Story',
  Task = 'Task',
  Bug = 'Bug',
  Epic = 'Epic',
  SubTask = 'Sub-task',
}

export interface IJiraIssue {
  key: string;
  id: string;
  summary: string;
  description: string;
  type: JiraIssueType;
  status: string;
  assignee?: {
    displayName: string;
    emailAddress: string;
  };
  reporter?: {
    displayName: string;
    emailAddress: string;
  };
  priority: string;
  created: string;
  updated: string;
  customFields?: Record<string, unknown>;
  labels?: string[];
  components?: string[];
  plannedTestDate?: string; // 计划提测日期
  dueDate?: string; // 到期日期
  url?: string; // 问题的URL链接
}

export interface IJiraSearchResult {
  issues: IJiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

export class JiraIssueTypeHelper {
  public static isRequirement(type: JiraIssueType): boolean {
    return (
      type === JiraIssueType.Story || type === JiraIssueType.Task || type === JiraIssueType.Epic
    );
  }

  public static isBug(type: JiraIssueType): boolean {
    return type === JiraIssueType.Bug;
  }

  public static fromString(typeStr: string): JiraIssueType {
    const normalized = typeStr.toLowerCase().replace(/[-\s]/g, '');

    switch (normalized) {
      case 'story':
        return JiraIssueType.Story;
      case 'task':
        return JiraIssueType.Task;
      case 'bug':
        return JiraIssueType.Bug;
      case 'epic':
        return JiraIssueType.Epic;
      case 'subtask':
        return JiraIssueType.SubTask;
      default:
        // Default to Task for unknown types
        return JiraIssueType.Task;
    }
  }
}

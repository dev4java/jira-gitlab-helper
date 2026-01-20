import * as vscode from 'vscode';
import { JiraService } from '../../services/jira-service';
import { Logger } from '../../utils/logger';
import { IJiraIssue } from '../../models/jira-issue';

export class JiraIssuesViewProvider implements vscode.TreeDataProvider<JiraIssueTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    JiraIssueTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _issues: IJiraIssue[] = [];

  constructor(
    private readonly _jiraService: JiraService,
    private readonly _logger: Logger
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: JiraIssueTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: JiraIssueTreeItem): Promise<JiraIssueTreeItem[]> {
    if (!element) {
      // Root level - show issues
      try {
        const result = await this._jiraService.searchMyIssues();
        this._issues = result.issues;

        if (this._issues.length === 0) {
          return [
            new JiraIssueTreeItem('没有分配给您的问题', '', vscode.TreeItemCollapsibleState.None),
          ];
        }

        return this._issues.map((issue) => this.createTreeItem(issue));
      } catch (error) {
        this._logger.error('Failed to load JIRA issues', error);
        return [
          new JiraIssueTreeItem(
            '加载失败,请检查JIRA配置',
            '',
            vscode.TreeItemCollapsibleState.None
          ),
        ];
      }
    }

    return [];
  }

  private createTreeItem(issue: IJiraIssue): JiraIssueTreeItem {
    const item = new JiraIssueTreeItem(
      `${issue.key}: ${issue.summary}`,
      issue.key,
      vscode.TreeItemCollapsibleState.None
    );

    item.description = `${issue.type} - ${issue.status}`;
    item.tooltip = this.createTooltip(issue);
    item.iconPath = this.getIconForIssueType(issue.type);
    item.contextValue = this.getContextValue(issue);

    item.command = {
      command: 'jiraGitlabHelper.showIssueDetails',
      title: '显示问题详情',
      arguments: [issue],
    };

    return item;
  }

  private createTooltip(issue: IJiraIssue): string {
    const lines = [
      `问题: ${issue.key}`,
      `标题: ${issue.summary}`,
      `类型: ${issue.type}`,
      `状态: ${issue.status}`,
      `优先级: ${issue.priority}`,
      issue.assignee ? `负责人: ${issue.assignee.displayName}` : '',
      issue.plannedTestDate ? `计划提测: ${this.formatDate(issue.plannedTestDate)}` : '',
      '',
      '点击查看详情',
    ];
    
    return lines.filter(Boolean).join('\n');
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  private getIconForIssueType(type: string): vscode.ThemeIcon {
    switch (type.toLowerCase()) {
      case 'story':
        return new vscode.ThemeIcon('book');
      case 'task':
        return new vscode.ThemeIcon('checklist');
      case 'bug':
        return new vscode.ThemeIcon('bug');
      case 'epic':
        return new vscode.ThemeIcon('milestone');
      case 'sub-task':
        return new vscode.ThemeIcon('note');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  private getContextValue(issue: IJiraIssue): string {
    const isRequirement = this._jiraService.isRequirementIssue(issue);
    const isBug = this._jiraService.isBugIssue(issue);

    if (isRequirement) {
      return 'jira-requirement';
    } else if (isBug) {
      return 'jira-bug';
    }

    return 'jira-issue';
  }
}

export class JiraIssueTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly issueKey: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

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
  private _groupedIssues: Map<string, IJiraIssue[]> = new Map();
  
  // 状态分类常量
  private readonly PENDING_STATUSES = ['open', '开放', 'design', '设计中', '设计', 'announcement', '公告', 'in progress', '进行中', 'reopened', '重新打开', '重开'];
  private readonly TESTING_STATUSES = ['resolved', '已解决', 'testing', '测试中', '测试'];
  // 已关闭状态：TESTED, CLOSE/CLOSED 等其他状态都归为已关闭

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
      // Root level - show groups
      try {
        const result = await this._jiraService.searchMyIssues();
        this._issues = result.issues;

        if (this._issues.length === 0) {
          return [
            new JiraIssueTreeItem('没有分配给您的问题', '', vscode.TreeItemCollapsibleState.None),
          ];
        }

        // Group issues
        this._groupedIssues = this.groupIssues(this._issues);

        // Create group items
        const groups: JiraIssueTreeItem[] = [];
        
        if (this._groupedIssues.has('pending')) {
          const pendingCount = this._groupedIssues.get('pending')!.length;
          const pendingItem = new JiraIssueTreeItem(
            `未处理 (${pendingCount})`,
            'group-pending',
            vscode.TreeItemCollapsibleState.Expanded
          );
          pendingItem.contextValue = 'issue-group';
          pendingItem.iconPath = new vscode.ThemeIcon('circle-outline');
          groups.push(pendingItem);
        }

        if (this._groupedIssues.has('testing')) {
          const testingCount = this._groupedIssues.get('testing')!.length;
          const testingItem = new JiraIssueTreeItem(
            `测试中 (${testingCount})`,
            'group-testing',
            vscode.TreeItemCollapsibleState.Expanded
          );
          testingItem.contextValue = 'issue-group';
          testingItem.iconPath = new vscode.ThemeIcon('beaker');
          groups.push(testingItem);
        }

        if (this._groupedIssues.has('closed')) {
          const closedCount = this._groupedIssues.get('closed')!.length;
          const closedItem = new JiraIssueTreeItem(
            `已关闭 (${closedCount})`,
            'group-closed',
            vscode.TreeItemCollapsibleState.Collapsed
          );
          closedItem.contextValue = 'issue-group';
          closedItem.iconPath = new vscode.ThemeIcon('pass');
          groups.push(closedItem);
        }

        return groups;
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
    } else if (element.issueKey.startsWith('group-')) {
      // Show issues in group
      const groupKey = element.issueKey.replace('group-', '');
      const issues = this._groupedIssues.get(groupKey) || [];
      return issues.map((issue) => this.createTreeItem(issue));
    }

    return [];
  }

  /**
   * 分组问题：未处理 / 测试中 / 已关闭
   */
  private groupIssues(issues: IJiraIssue[]): Map<string, IJiraIssue[]> {
    const groups = new Map<string, IJiraIssue[]>();
    const pending: IJiraIssue[] = [];
    const testing: IJiraIssue[] = [];
    const closed: IJiraIssue[] = [];

    for (const issue of issues) {
      const group = this.getIssueGroup(issue.status);
      if (group === 'pending') {
        pending.push(issue);
      } else if (group === 'testing') {
        testing.push(issue);
      } else {
        closed.push(issue);
      }
    }

    // 未处理：按提测日期倒序（日期近的在前）
    pending.sort((a, b) => {
      const aHasDate = !!a.plannedTestDate;
      const bHasDate = !!b.plannedTestDate;

      if (aHasDate && bHasDate) {
        // 都有提测日期，按日期正序（日期早的在前，即快要提测的在前）
        return new Date(a.plannedTestDate!).getTime() - new Date(b.plannedTestDate!).getTime();
      }

      if (aHasDate && !bHasDate) {
        return -1; // 有日期的在前
      }

      if (!aHasDate && bHasDate) {
        return 1;
      }

      // 都没有日期，按更新时间倒序
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    // 测试中：按修改时间倒序
    testing.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    // 已关闭：按修改时间倒序
    closed.sort((a, b) => {
      return new Date(b.updated).getTime() - new Date(a.updated).getTime();
    });

    if (pending.length > 0) {
      groups.set('pending', pending);
    }
    if (testing.length > 0) {
      groups.set('testing', testing);
    }
    if (closed.length > 0) {
      groups.set('closed', closed);
    }

    return groups;
  }

  /**
   * 判断问题属于哪个分组
   * @returns 'pending' | 'testing' | 'closed'
   */
  private getIssueGroup(status: string): 'pending' | 'testing' | 'closed' {
    const statusLower = status.toLowerCase();
    
    // 未处理
    if (this.PENDING_STATUSES.some(s => statusLower === s || statusLower.includes(s))) {
      return 'pending';
    }
    
    // 测试中
    if (this.TESTING_STATUSES.some(s => statusLower === s || statusLower.includes(s))) {
      return 'testing';
    }
    
    // 已关闭
    return 'closed';
  }

  private createTreeItem(issue: IJiraIssue): JiraIssueTreeItem {
    const item = new JiraIssueTreeItem(
      `${issue.key}: ${issue.summary}`,
      issue.key,
      vscode.TreeItemCollapsibleState.None
    );

    // 描述信息，包含提测日期（如果有）
    const group = this.getIssueGroup(issue.status);
    let description = `${issue.type} - ${issue.status}`;
    if (issue.plannedTestDate && group === 'pending') {
      const dateStr = this.formatDate(issue.plannedTestDate);
      description += ` 📅 ${dateStr}`;
    }
    item.description = description;

    item.tooltip = this.createTooltip(issue);
    item.iconPath = this.getIconForIssueType(issue.type);
    item.contextValue = this.getContextValue(issue);

    // REOPENED 状态强制标记为黄色
    const statusLower = issue.status.toLowerCase();
    if (statusLower === 'reopened' || statusLower.includes('重新打开') || statusLower.includes('重开')) {
      item.iconPath = this.getColoredIcon(issue.type, 'warning');
    } 
    // 根据提测日期状态设置颜色（仅未处理状态）
    else if (issue.plannedTestDate && group === 'pending') {
      const colorStatus = this.getTestDateColorStatus(issue.plannedTestDate);
      item.iconPath = this.getColoredIcon(issue.type, colorStatus);
    }

    item.command = {
      command: 'jiraGitlabHelper.showIssueDetails',
      title: '显示问题详情',
      arguments: [issue],
    };

    return item;
  }

  /**
   * 获取提测日期的颜色状态
   * @returns 'expired' | 'warning' | 'safe'
   */
  private getTestDateColorStatus(plannedTestDate: string): 'expired' | 'warning' | 'safe' {
    const now = new Date();
    const testDate = new Date(plannedTestDate);
    const diffInDays = Math.ceil((testDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
      return 'expired'; // 已过期 - 红色
    } else if (diffInDays < 3) {
      return 'warning'; // 小于3天 - 黄色
    } else {
      return 'safe'; // 3天及以上 - 绿色
    }
  }

  /**
   * 根据类型和颜色状态获取带颜色的图标
   */
  private getColoredIcon(type: string, colorStatus: 'expired' | 'warning' | 'safe'): vscode.ThemeIcon {
    let iconName: string;
    
    switch (type.toLowerCase()) {
      case 'story':
        iconName = 'book';
        break;
      case 'task':
        iconName = 'checklist';
        break;
      case 'bug':
        iconName = 'bug';
        break;
      case 'epic':
        iconName = 'milestone';
        break;
      case 'sub-task':
        iconName = 'note';
        break;
      default:
        iconName = 'circle-outline';
    }

    // 根据状态设置颜色
    let color: vscode.ThemeColor;
    switch (colorStatus) {
      case 'expired':
        color = new vscode.ThemeColor('errorForeground'); // 红色
        break;
      case 'warning':
        color = new vscode.ThemeColor('editorWarning.foreground'); // 黄色
        break;
      case 'safe':
        color = new vscode.ThemeColor('terminal.ansiGreen'); // 绿色
        break;
    }

    return new vscode.ThemeIcon(iconName, color);
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

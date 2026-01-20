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
  private _searchKeyword: string = '';
  
  // 状态分类常量（使用精确匹配，避免误判）
  private readonly PENDING_STATUSES = [
    'open', 'opened', '开放',
    'design', '设计中', '设计',
    'announcement', '公告',
    'in progress', '进行中', 'inprogress',
    'reopened', '重新打开', '重开', 'reopen',
    'to do', 'todo', '待办'
  ];
  private readonly TESTING_STATUSES = [
    'resolved', '已解决',
    'testing', '测试中', '测试'
  ];
  // 已关闭状态：TESTED, CLOSE/CLOSED 等其他状态都归为已关闭

  constructor(
    private readonly _jiraService: JiraService,
    private readonly _logger: Logger
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 搜索问题
   */
  async search(): Promise<void> {
    const keyword = await vscode.window.showInputBox({
      prompt: '输入关键词搜索问题标题或内容',
      placeHolder: '例如: IOP-1234 或 登录问题',
      value: this._searchKeyword
    });

    if (keyword !== undefined) {
      this._searchKeyword = keyword.trim();
      this._logger.info(`搜索关键词: "${this._searchKeyword}"`);
      this.refresh();
    }
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    this._searchKeyword = '';
    this._logger.info('清除搜索');
    this.refresh();
  }

  /**
   * 根据关键词过滤问题
   */
  private filterIssuesByKeyword(issues: IJiraIssue[]): IJiraIssue[] {
    if (!this._searchKeyword) {
      return issues;
    }

    const keyword = this._searchKeyword.toLowerCase();
    const filtered = issues.filter(issue => {
      return issue.key.toLowerCase().includes(keyword) ||
             issue.summary.toLowerCase().includes(keyword) ||
             (issue.description && issue.description.toLowerCase().includes(keyword));
    });
    
    this._logger.info(`Filtered ${issues.length} -> ${filtered.length} issues with keyword: "${this._searchKeyword}"`);
    
    return filtered;
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

        this._logger.info(`Total issues fetched: ${this._issues.length} (total in Jira: ${result.total})`);
        this._logger.info(`Issue keys: ${this._issues.map(i => i.key).join(', ')}`);
        
        // 警告：如果Jira中的问题总数超过返回的数量
        if (result.total > this._issues.length) {
          this._logger.warn(`⚠️ Jira中有 ${result.total} 个问题，但只返回了 ${this._issues.length} 个。某些问题可能未显示。`);
        }

        // 应用搜索过滤
        const filteredIssues = this.filterIssuesByKeyword(this._issues);

        if (filteredIssues.length === 0) {
          if (this._searchKeyword) {
            return [
              new JiraIssueTreeItem(`没有找到匹配 "${this._searchKeyword}" 的问题`, '', vscode.TreeItemCollapsibleState.None),
            ];
          }
          return [
            new JiraIssueTreeItem('没有分配给您的问题', '', vscode.TreeItemCollapsibleState.None),
          ];
        }

        // Group issues
        this._groupedIssues = this.groupIssues(filteredIssues);

        // Create group items
        const groups: JiraIssueTreeItem[] = [];
        
        // 如果有搜索关键词，显示搜索提示
        const searchSuffix = this._searchKeyword ? ` [搜索: ${this._searchKeyword}]` : '';
        
        if (this._groupedIssues.has('pending')) {
          const pendingCount = this._groupedIssues.get('pending')!.length;
          const pendingItem = new JiraIssueTreeItem(
            `未处理 (${pendingCount})${searchSuffix}`,
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
            `测试中 (${testingCount})${searchSuffix}`,
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
            `已关闭 (${closedCount})${searchSuffix}`,
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
      this._logger.info(`Issue ${issue.key} status: "${issue.status}" -> group: ${group}`);
      
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
    const statusLower = status.toLowerCase().trim();
    
    // 未处理：精确匹配或包含关键词
    for (const s of this.PENDING_STATUSES) {
      const sLower = s.toLowerCase();
      if (statusLower === sLower || 
          statusLower.includes(sLower) || 
          sLower.includes(statusLower)) {
        return 'pending';
      }
    }
    
    // 测试中：精确匹配或包含关键词
    for (const s of this.TESTING_STATUSES) {
      const sLower = s.toLowerCase();
      if (statusLower === sLower || 
          statusLower.includes(sLower) || 
          sLower.includes(statusLower)) {
        return 'testing';
      }
    }
    
    // 已关闭：其他所有状态
    return 'closed';
  }

  private createTreeItem(issue: IJiraIssue): JiraIssueTreeItem {
    // 判断颜色状态
    const group = this.getIssueGroup(issue.status);
    const statusLower = issue.status.toLowerCase().trim();
    const isReopened = statusLower === 'reopened' || 
                       statusLower === 'reopen' ||
                       statusLower.includes('重新打开') || 
                       statusLower.includes('重开');
    
    let colorStatus: 'expired' | 'warning' | 'safe' | null = null;
    let colorPrefix = '';
    
    // 1. REOPENED 状态强制标记为黄色
    if (isReopened) {
      colorStatus = 'warning';
      colorPrefix = '🟡 ';
    } 
    // 2. 根据提测日期状态设置颜色（仅未处理状态）
    else if (issue.plannedTestDate && group === 'pending') {
      colorStatus = this.getTestDateColorStatus(issue.plannedTestDate);
      switch (colorStatus) {
        case 'expired':
          colorPrefix = '🔴 ';
          break;
        case 'warning':
          colorPrefix = '🟡 ';
          break;
        case 'safe':
          colorPrefix = '🟢 ';
          break;
      }
    }
    
    // 创建带颜色前缀的标题
    const item = new JiraIssueTreeItem(
      `${colorPrefix}${issue.key}: ${issue.summary}`,
      issue.key,
      vscode.TreeItemCollapsibleState.None
    );

    // 描述信息，包含提测日期（如果有）
    let description = `${issue.type} - ${issue.status}`;
    if (issue.plannedTestDate && group === 'pending') {
      const dateStr = this.formatDate(issue.plannedTestDate);
      description += ` 📅 ${dateStr}`;
    }
    item.description = description;

    item.tooltip = this.createTooltip(issue);
    
    // 设置图标颜色
    if (colorStatus) {
      item.iconPath = this.getColoredIcon(issue.type, colorStatus);
    } else {
      item.iconPath = this.getIconForIssueType(issue.type);
    }
    
    item.contextValue = this.getContextValue(issue);

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

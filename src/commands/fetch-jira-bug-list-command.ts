import * as vscode from 'vscode';
import { JiraService } from '../services/jira-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';

export class FetchJiraBugListCommand {
  constructor(
    private readonly _jiraService: JiraService,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<void> {
    try {
      this._logger.info('Fetching JIRA bug list');

      // 让用户选择查看哪种bug列表
      const listType = await vscode.window.showQuickPick(
        [
          { label: '$(person) 我的Bug', value: 'my' },
          { label: '$(list-unordered) 所有Open Bug', value: 'all' },
        ],
        {
          placeHolder: '选择要查看的Bug列表',
          title: 'JIRA Bug列表',
        }
      );

      if (!listType) {
        return;
      }

      // 显示加载提示
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'JIRA',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: '正在获取Bug列表...' });

          try {
            // 获取bug列表
            const result =
              listType.value === 'my'
                ? await this._jiraService.searchMyBugs(100)
                : await this._jiraService.searchOpenBugs(100);

            if (result.issues.length === 0) {
              await vscode.window.showInformationMessage('没有找到符合条件的Bug');
              return;
            }

            this._logger.info('Bug list fetched', { count: result.issues.length });

            // 显示bug列表
            await this.showBugList(result.issues, listType.value === 'my' ? '我的Bug' : '所有Open Bug');
          } catch (error) {
            this._logger.error('Failed to fetch bug list', error);
            await vscode.window.showErrorMessage(
              `获取Bug列表失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
          }
        }
      );
    } catch (error) {
      this._logger.error('Failed to execute fetch bug list command', error);
      await vscode.window.showErrorMessage(
        `获取Bug列表失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  private async showBugList(bugs: IJiraIssue[], listTitle: string): Promise<void> {
    // 按优先级分组
    const priorityGroups = this.groupByPriority(bugs);

    // 创建QuickPick项
    const items: Array<vscode.QuickPickItem & { bug?: IJiraIssue }> = [];

    // 按优先级排序并添加分组标题
    const priorityOrder = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
    const priorityIcons: Record<string, string> = {
      Highest: '$(arrow-up)$(arrow-up)',
      High: '$(arrow-up)',
      Medium: '$(dash)',
      Low: '$(arrow-down)',
      Lowest: '$(arrow-down)$(arrow-down)',
    };

    for (const priority of priorityOrder) {
      const bugsInPriority = priorityGroups.get(priority);
      if (!bugsInPriority || bugsInPriority.length === 0) {
        continue;
      }

      // 添加分组标题
      items.push({
        label: `${priorityIcons[priority] || '$(circle-outline)'} ${priority}`,
        kind: vscode.QuickPickItemKind.Separator,
      });

      // 添加该优先级的bugs
      for (const bug of bugsInPriority) {
        items.push({
          label: bug.key,
          description: `$(circle-outline) ${bug.status}`,
          detail: `${bug.summary} (更新: ${new Date(bug.updated).toLocaleDateString('zh-CN')})`,
          bug,
        });
      }
    }

    // 显示QuickPick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `选择要处理的Bug (共${bugs.length}个)`,
      title: `JIRA ${listTitle}`,
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected && selected.bug) {
      // 用户选择了一个bug，触发分析
      await this.handleBugSelection(selected.bug);
    }
  }

  private groupByPriority(bugs: IJiraIssue[]): Map<string, IJiraIssue[]> {
    const groups = new Map<string, IJiraIssue[]>();

    for (const bug of bugs) {
      const priority = bug.priority || 'Medium';
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority)!.push(bug);
    }

    return groups;
  }

  private async handleBugSelection(bug: IJiraIssue): Promise<void> {
    this._logger.info('Bug selected', { key: bug.key });

    // 显示bug详情并提供操作选项
    const action = await vscode.window.showQuickPick(
      [
        { label: '$(search) 分析Bug', value: 'analyze' },
        { label: '$(eye) 查看详情', value: 'view' },
        { label: '$(copy) 复制Bug号', value: 'copy' },
      ],
      {
        placeHolder: `${bug.key}: ${bug.summary}`,
        title: 'Bug操作',
      }
    );

    if (!action) {
      return;
    }

    switch (action.value) {
      case 'analyze':
        // 触发bug分析命令
        await vscode.commands.executeCommand('jiraGitlabHelper.analyzeBug', bug);
        break;

      case 'view':
        // 在输出通道显示详细信息
        this.showBugDetails(bug);
        break;

      case 'copy':
        // 复制bug号到剪贴板
        await vscode.env.clipboard.writeText(bug.key);
        await vscode.window.showInformationMessage(`已复制: ${bug.key}`);
        break;
    }
  }

  private showBugDetails(bug: IJiraIssue): void {
    const outputChannel = vscode.window.createOutputChannel('JIRA Bug详情', { log: true });
    outputChannel.clear();
    outputChannel.appendLine(`Bug详情: ${bug.key}`);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');
    outputChannel.appendLine(`标题: ${bug.summary}`);
    outputChannel.appendLine(`类型: ${bug.type}`);
    outputChannel.appendLine(`状态: ${bug.status}`);
    outputChannel.appendLine(`优先级: ${bug.priority}`);
    outputChannel.appendLine(`经办人: ${bug.assignee?.displayName || '未分配'}`);
    outputChannel.appendLine(`报告人: ${bug.reporter?.displayName || '未知'}`);
    outputChannel.appendLine(`创建时间: ${new Date(bug.created).toLocaleString('zh-CN')}`);
    outputChannel.appendLine(`更新时间: ${new Date(bug.updated).toLocaleString('zh-CN')}`);

    if (bug.labels && bug.labels.length > 0) {
      outputChannel.appendLine(`标签: ${bug.labels.join(', ')}`);
    }

    if (bug.components && bug.components.length > 0) {
      outputChannel.appendLine(`组件: ${bug.components.join(', ')}`);
    }

    outputChannel.appendLine('');
    outputChannel.appendLine('描述:');
    outputChannel.appendLine('-'.repeat(80));
    outputChannel.appendLine(bug.description || '(无描述)');
    outputChannel.appendLine('');
    outputChannel.appendLine('='.repeat(80));

    outputChannel.show();
  }
}


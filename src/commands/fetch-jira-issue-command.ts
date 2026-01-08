import * as vscode from 'vscode';
import { JiraService } from '../services/jira-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';

export class FetchJiraIssueCommand {
  private _outputChannel: vscode.OutputChannel | undefined;

  constructor(
    private readonly _jiraService: JiraService,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<IJiraIssue | undefined> {
    try {
      this._logger.info('Fetching JIRA issue...');

      // Prompt for issue key
      const issueKey = await this.promptForIssueKey();
      if (!issueKey) {
        this._logger.info('Fetch JIRA issue cancelled by user');
        return undefined;
      }

      // Show progress
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `正在获取JIRA问题 ${issueKey}...`,
          cancellable: false,
        },
        async () => {
          const issue = await this._jiraService.getIssue(issueKey);

          // Show issue details
          await this.showIssueDetails(issue);

          return issue;
        }
      );
    } catch (error) {
      this._logger.error('Failed to fetch JIRA issue', error);
      void vscode.window.showErrorMessage(`获取JIRA问题失败: ${String(error)}`);
      return undefined;
    }
  }

  private async promptForIssueKey(): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({
      prompt: '请输入JIRA问题Key或完整URL',
      placeHolder: 'PROJ-123 或 https://jira.example.com/browse/PROJ-123',
      validateInput: (value) => {
        if (!value) {
          return 'JIRA问题Key不能为空';
        }
        // 支持 Issue Key 格式：PROJ-123
        if (/^[A-Z]+-\d+$/i.test(value)) {
          return null;
        }
        // 支持完整 URL 格式：https://jira.example.com/browse/PROJ-123
        if (/\/browse\/[A-Z]+-\d+$/i.test(value)) {
        return null;
        }
        return '请输入有效的JIRA问题Key (例如: PROJ-123) 或完整URL';
      },
    });

    if (!input) {
      return undefined;
    }

    // 从输入中提取 Issue Key
    let issueKey = input.trim();
    const urlMatch = issueKey.match(/\/browse\/([A-Z]+-\d+)$/i);
    if (urlMatch) {
      issueKey = urlMatch[1];
    }

    return issueKey;
  }

  private async showIssueDetails(issue: IJiraIssue): Promise<void> {
    const isRequirement = this._jiraService.isRequirementIssue(issue);
    const isBug = this._jiraService.isBugIssue(issue);

    // 显示完整问题描述到输出面板
    this._showInOutputChannel(issue, isRequirement, isBug);

    // 输出完整描述到日志
    this._logger.info('JIRA Issue Details', {
      key: issue.key,
      summary: issue.summary,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      description: issue.description,
    });

    // 自动触发分析（不再显示选择弹窗）
    if (isRequirement) {
      this._logger.info('Auto-triggering requirement analysis');
      await vscode.commands.executeCommand('jiraGitlabHelper.analyzeRequirement', issue);
    } else if (isBug) {
      this._logger.info('Auto-triggering bug analysis');
      await vscode.commands.executeCommand('jiraGitlabHelper.analyzeBug', issue);
    } else {
      // 非需求/Bug类型，显示简单提示
      void vscode.window.showInformationMessage(
        `✅ 已获取 ${issue.key}\n类型: ${issue.type}\n\n详情请查看输出面板`,
        '📋 查看详情'
      ).then(action => {
        if (action === '📋 查看详情') {
          this._outputChannel?.show(true);
        }
      });
    }
  }

  private _showInOutputChannel(issue: IJiraIssue, isRequirement: boolean, isBug: boolean): void {
    if (!this._outputChannel) {
      this._outputChannel = vscode.window.createOutputChannel('JIRA 问题详情');
    }

    this._outputChannel.clear();
    this._outputChannel.appendLine('='.repeat(80));
    this._outputChannel.appendLine(`JIRA 问题: ${issue.key}`);
    this._outputChannel.appendLine('='.repeat(80));
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine(`标题: ${issue.summary}`);
    this._outputChannel.appendLine(`类型: ${issue.type}`);
    this._outputChannel.appendLine(`状态: ${issue.status}`);
    this._outputChannel.appendLine(`优先级: ${issue.priority}`);
    
    if (issue.assignee) {
      this._outputChannel.appendLine(`负责人: ${issue.assignee.displayName} (${issue.assignee.emailAddress || ''})`);
    }
    
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine('-'.repeat(80));
    this._outputChannel.appendLine('描述:');
    this._outputChannel.appendLine('-'.repeat(80));
    this._outputChannel.appendLine(issue.description || '(无描述)');
    this._outputChannel.appendLine('');
    this._outputChannel.appendLine('='.repeat(80));
    this._outputChannel.appendLine('自动分析:');
    this._outputChannel.appendLine('='.repeat(80));

    if (isRequirement) {
      this._outputChannel.appendLine('');
      this._outputChannel.appendLine('✅ 这是需求类型的问题 - 正在自动启动需求分析...');
      this._outputChannel.appendLine('');
      this._outputChannel.appendLine('AI将自动:');
      this._outputChannel.appendLine('  1. 解析需求描述');
      this._outputChannel.appendLine('  2. 生成OpenSpec提案');
      this._outputChannel.appendLine('  3. 拆解任务列表');
      this._outputChannel.appendLine('  4. 生成设计文档');
    } else if (isBug) {
      this._outputChannel.appendLine('');
      this._outputChannel.appendLine('🐛 这是Bug类型的问题 - 正在自动启动Bug分析...');
      this._outputChannel.appendLine('');
      this._outputChannel.appendLine('AI将自动:');
      this._outputChannel.appendLine('  1. 分析Bug描述');
      this._outputChannel.appendLine('  2. 搜索相关代码');
      this._outputChannel.appendLine('  3. 定位可能原因');
      this._outputChannel.appendLine('  4. 提供修复建议');
    } else {
      this._outputChannel.appendLine('');
      this._outputChannel.appendLine('💡 非需求/Bug类型，请手动选择操作');
    }

    this._outputChannel.appendLine('');
    this._outputChannel.show(true);
  }
}

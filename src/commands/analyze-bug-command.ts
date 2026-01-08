import * as vscode from 'vscode';
import { BugAnalysisService } from '../services/bug-analysis-service';
import { JiraService } from '../services/jira-service';
import { GitService } from '../services/git-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';
import { IBugInfo, IBugAnalysis, IBugFixSuggestion } from '../models/bug-analysis';

export class AnalyzeBugCommand {
  constructor(
    private readonly _jiraService: JiraService,
    private readonly _bugAnalysisService: BugAnalysisService,
    private readonly _gitService: GitService,
    private readonly _logger: Logger
  ) {}

  public async execute(issue?: IJiraIssue): Promise<void> {
    try {
      this._logger.info('Starting bug analysis...');

      // Get JIRA issue if not provided
      if (!issue) {
        issue = await this.promptForJiraIssue();
        if (!issue) {
          this._logger.info('Bug analysis cancelled by user');
          return;
        }
      }

      // Verify it's a bug type issue
      if (!this._jiraService.isBugIssue(issue)) {
        void vscode.window.showErrorMessage(
          `问题 ${issue.key} 不是Bug类型 (${issue.type}),无法进行Bug分析`
        );
        return;
      }

      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      // 确认当前分支
      const currentBranch = await this._gitService.getCurrentBranch(workspaceUri);
      const confirmBranch = await vscode.window.showWarningMessage(
        `当前分支: ${currentBranch}\n\n是否在此分支上进行Bug分析和修复？`,
        { modal: true },
        '确认',
        '取消'
      );

      if (confirmBranch !== '确认') {
        void vscode.window.showInformationMessage('已取消Bug分析');
        return;
      }

      // Analyze bug with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `分析Bug ${issue.key}...`,
          cancellable: false,
        },
        async (progress) => {
          // Step 1: Extract bug info
          progress.report({ message: '正在提取Bug信息...' });
          const bugInfo = await this._bugAnalysisService.extractBugInfo(issue!);

          // Step 2: Analyze bug (不需要OpenSpec，直接分析)
          progress.report({ message: '正在搜索相关代码...' });
          const analysis = await this._bugAnalysisService.analyzeBug(bugInfo, workspaceUri);

          // Step 3: Generate fix suggestion (自动生成，不需要用户确认)
          progress.report({ message: '正在生成修复建议...' });
          const fixSuggestion = await this._bugAnalysisService.generateFixSuggestion(
            bugInfo,
            analysis
          );

          // 直接展示完整的分析结果和修复建议
          await this.showCompleteAnalysis(issue!, bugInfo, analysis, fixSuggestion, workspaceUri);

          this._logger.info('Bug analysis completed', { issueKey: issue!.key });
        }
      );
    } catch (error) {
      this._logger.error('Failed to analyze bug', error);
      void vscode.window.showErrorMessage(`Bug分析失败: ${String(error)}`);
    }
  }

  private async promptForJiraIssue(): Promise<IJiraIssue | undefined> {
    const input = await vscode.window.showInputBox({
      prompt: '请输入要分析的JIRA Bug Key或完整URL',
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

    // Fetch issue from JIRA
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在获取JIRA问题 ${issueKey}...`,
        cancellable: false,
      },
      async () => {
        return await this._jiraService.getIssue(issueKey);
      }
    );
  }

  private async showCompleteAnalysis(
    issue: IJiraIssue,
    bugInfo: IBugInfo,
    analysis: IBugAnalysis,
    suggestion: IBugFixSuggestion,
    workspaceUri: vscode.Uri
  ): Promise<void> {
    // 构建完整的分析报告
    const message = [
      `🐛 Bug: ${issue.key} - ${bugInfo.summary}`,
      '',
      `严重程度: ${bugInfo.severity}`,
      `修复类型: ${suggestion.type === 'simple' ? '简单修复' : '复杂修复'}`,
      '',
      '═'.repeat(40),
      '📍 相关代码位置:',
      '═'.repeat(40),
      ...analysis.suggestedLocations
        .slice(0, 5)
        .map((loc, i) => `${i + 1}. ${loc.filePath}:${loc.lineNumber}`),
      '',
      '═'.repeat(40),
      '🔍 根本原因:',
      '═'.repeat(40),
      suggestion.rootCause,
      '',
      '═'.repeat(40),
      '🔧 修复步骤:',
      '═'.repeat(40),
      ...suggestion.fixSteps.map((step, i) => `${i + 1}. ${step}`),
      '',
      suggestion.codeChanges && suggestion.codeChanges.length > 0
        ? `📝 需要修改 ${suggestion.codeChanges.length} 个文件`
        : '',
      '',
      '═'.repeat(40),
      '✅ 测试建议:',
      '═'.repeat(40),
      ...suggestion.testSuggestions.map((test) => `• ${test}`),
      '',
      suggestion.risks.length > 0 ? '⚠️ 风险提示:' : '',
      ...suggestion.risks.map((risk) => `• ${risk}`),
    ]
      .filter(Boolean)
      .join('\n');

    // 准备操作按钮
    const actions = [];
    if (analysis.suggestedLocations.length > 0) {
      actions.push('查看代码位置');
    }
    if (suggestion.type === 'simple' && suggestion.codeChanges) {
      actions.push('应用修复');
    }
    actions.push('复制报告');

    const action = await vscode.window.showInformationMessage(
      '✅ Bug分析完成',
      {
        detail: message,
        modal: true,
      },
      ...actions
    );

    // 处理用户操作
    if (action === '查看代码位置' && analysis.suggestedLocations.length > 0) {
      await this.openSuggestedLocation(analysis.suggestedLocations[0]);
    } else if (action === '应用修复') {
      await this.applyFix(suggestion, workspaceUri);
    } else if (action === '复制报告') {
      const report = message.replace(/═/g, '='); // 替换特殊字符
      await vscode.env.clipboard.writeText(report);
      void vscode.window.showInformationMessage('分析报告已复制到剪贴板');
    }
  }

  private async openSuggestedLocation(location: {
    filePath: string;
    lineNumber: number;
  }): Promise<void> {
    try {
      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        return;
      }

      const fileUri = vscode.Uri.joinPath(workspaceUri, location.filePath);
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document);

      const position = new vscode.Position(location.lineNumber - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    } catch (error) {
      this._logger.error('Failed to open suggested location', error);
      void vscode.window.showErrorMessage('无法打开文件');
    }
  }

  private async applyFix(suggestion: IBugFixSuggestion, workspaceUri: vscode.Uri): Promise<void> {
    try {
      if (!suggestion.codeChanges || suggestion.codeChanges.length === 0) {
        void vscode.window.showWarningMessage('没有可应用的代码变更');
        return;
      }

      for (const change of suggestion.codeChanges) {
        if (change.changeType === 'modify' && change.suggestedCode) {
          const fileUri = vscode.Uri.joinPath(workspaceUri, change.filePath);
          const document = await vscode.workspace.openTextDocument(fileUri);
          const editor = await vscode.window.showTextDocument(document);

          if (change.lineNumber !== undefined) {
            const line = document.lineAt(change.lineNumber - 1);
            await editor.edit((editBuilder) => {
              editBuilder.replace(line.range, change.suggestedCode!);
            });
          }
        }
      }

      void vscode.window.showInformationMessage('修复已应用,请验证代码是否正确');
    } catch (error) {
      this._logger.error('Failed to apply fix', error);
      void vscode.window.showErrorMessage(`应用修复失败: ${String(error)}`);
    }
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }
}

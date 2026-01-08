import * as vscode from 'vscode';
import { CodeReviewService } from '../services/code-review-service';
import { GitService } from '../services/git-service';
import { Logger } from '../utils/logger';

export class HandleCRSuggestionsCommand {
  private _lastMRInput: string = '';

  constructor(
    private readonly _codeReviewService: CodeReviewService,
    private readonly _gitService: GitService,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<void> {
    try {
      this._logger.info('Starting CR suggestions handling...');

      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      // Get MR IID
      const mrIid = await this.promptForMRIid();
      if (!mrIid) {
        this._logger.info('CR suggestions handling cancelled by user');
        return;
      }

      // Validate MR URL and extract project (if URL was provided)
      const mrProjectPath = this.extractProjectPathFromInput(this._lastMRInput);
      
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `处理Code Review建议 (MR !${mrIid})...`,
          cancellable: false,
        },
        async (progress) => {
          // Step 0: Check Git repository and branch
          progress.report({ message: '正在检查Git仓库...' });
          
          // Check if Git repository exists
          const currentBranch = await this._gitService.getCurrentBranch(workspaceUri).catch(() => null);
          if (!currentBranch) {
            throw new Error(
              '当前目录不是Git仓库或没有分支！\n\n' +
              '请先执行以下操作：\n' +
              '1. git init (如果还没有初始化)\n' +
              '2. git remote add origin <your-gitlab-url> (添加GitLab远程仓库)\n' +
              '3. git checkout -b <branch-name> (创建并切换到分支)'
            );
          }

          this._logger.info('Current Git branch', { branch: currentBranch });

          // Step 1: Auto-detect project ID from Git remote
          progress.report({ message: '正在检测项目信息...' });
          const projectId = await this.detectProjectId(workspaceUri);
          
          if (!projectId) {
            throw new Error(
              '无法从Git远程仓库检测项目路径！\n\n' +
              '请确保已配置GitLab远程仓库：\n' +
              'git remote add origin <your-gitlab-url>'
            );
          }

          this._logger.info('Detected GitLab project', { projectId });

          // Step 2: Validate MR project matches current Git project
          let finalProjectId = projectId;
          
          if (mrProjectPath && mrProjectPath !== projectId) {
            const proceed = await vscode.window.showWarningMessage(
              `⚠️ 项目不匹配！\n\n` +
              `MR所在项目: ${mrProjectPath}\n` +
              `当前Git项目: ${projectId}\n\n` +
              `这个MR不属于当前项目，是否继续？`,
              { modal: true },
              '继续处理',
              '取消'
            );

            if (proceed !== '继续处理') {
              void vscode.window.showInformationMessage('已取消处理Code Review建议');
              return;
            }

            // 使用MR链接中的项目ID
            finalProjectId = mrProjectPath;
            this._logger.warn('Using project from MR URL instead of Git remote', {
              gitProject: projectId,
              mrProject: mrProjectPath,
            });
          }

          // Step 3: Get suggestions
          progress.report({ message: '正在获取Code Review建议...' });
          const suggestions = await this._codeReviewService.getCodeSuggestions(mrIid, finalProjectId);

          if (suggestions.length === 0) {
            void vscode.window.showInformationMessage('没有找到Code Review建议');
            return;
          }

          // Step 2: Format suggestions for AI
          progress.report({ message: '正在格式化建议...' });
          
          // Step 3: Show suggestions and prepare for AI interaction
          await this.showSuggestionsForAI(suggestions, mrIid, workspaceUri);

          this._logger.info('CR suggestions displayed for AI interaction', { 
            mrIid, 
            count: suggestions.length 
          });
        }
      );
    } catch (error) {
      this._logger.error('Failed to handle CR suggestions', error);
      void vscode.window.showErrorMessage(`处理Code Review建议失败: ${String(error)}`);
    }
  }

  private async promptForMRIid(): Promise<number | undefined> {
    const input = await vscode.window.showInputBox({
      prompt: '请输入Merge Request IID或链接',
      placeHolder: '123 或 https://gitlab.com/project/-/merge_requests/123 或 !123',
      validateInput: (value) => {
        if (!value) {
          return 'MR IID不能为空';
        }
        
        // 尝试提取IID
        const iid = this.extractMRIid(value);
        if (!iid) {
          return '无法识别的格式。请输入: 数字、MR链接或 !123 格式';
        }
        
        return null;
      },
    });

    if (!input) {
      return undefined;
    }

    // 保存原始输入以便后续提取项目路径
    this._lastMRInput = input.trim();

    return this.extractMRIid(input);
  }

  private extractMRIid(input: string): number | undefined {
    // 去除空白
    const trimmed = input.trim();

    // 格式1: 纯数字 "123"
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }

    // 格式2: !123
    const shortFormat = trimmed.match(/^!(\d+)$/);
    if (shortFormat) {
      return parseInt(shortFormat[1], 10);
    }

    // 格式3: 完整URL
    // https://gitlab.com/group/project/-/merge_requests/123
    // https://gitlab.company.com/group/subgroup/project/-/merge_requests/456
    const urlMatch = trimmed.match(/merge_requests[\/:](\d+)/);
    if (urlMatch) {
      return parseInt(urlMatch[1], 10);
    }

    // 格式4: GitLab短链接
    // group/project!123
    const shortLink = trimmed.match(/!(\d+)$/);
    if (shortLink) {
      return parseInt(shortLink[1], 10);
    }

    return undefined;
  }

  private extractProjectPathFromInput(input: string): string | undefined {
    if (!input) {
      return undefined;
    }

    const trimmed = input.trim();

    // 从完整URL提取项目路径
    // https://gitlab.com/group/project/-/merge_requests/123 → group/project
    // https://gitlab.company.com/group/subgroup/project/-/merge_requests/456 → group/subgroup/project
    const urlMatch = trimmed.match(/https?:\/\/[^\/]+\/(.+?)\/-\/merge_requests\/\d+/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // 从项目短链接提取
    // group/project!123 → group/project
    const shortLinkMatch = trimmed.match(/^(.+?)!(\d+)$/);
    if (shortLinkMatch) {
      return shortLinkMatch[1];
    }

    // 纯数字或!123格式无法提取项目路径
    return undefined;
  }

  private async showSuggestionsForAI(
    suggestions: any[],
    mrIid: number,
    workspaceUri: vscode.Uri
  ): Promise<void> {
    // 创建输出通道显示CR建议
    const outputChannel = vscode.window.createOutputChannel(`GitLab MR !${mrIid} - Code Review`);
    outputChannel.clear();
    outputChannel.show(true);

    // 格式化建议
    outputChannel.appendLine(`📋 GitLab Merge Request !${mrIid} - Code Review 建议`);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');
    outputChannel.appendLine(`共找到 ${suggestions.length} 个Code Review建议`);
    outputChannel.appendLine('');
    outputChannel.appendLine('💡 建议使用方式：');
    outputChannel.appendLine('1. 查看下方的CR建议详情');
    outputChannel.appendLine('2. 在AI窗口（Cmd+L）中询问AI如何修复');
    outputChannel.appendLine('3. 例如："请根据下面的Code Review建议修复代码"');
    outputChannel.appendLine('4. AI会根据建议和代码上下文给出修复方案');
    outputChannel.appendLine('5. 确认后应用修复，然后提交');
    outputChannel.appendLine('');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');

    // 按文件分组
    const groupedByFile = this.groupSuggestionsByFile(suggestions);

    let suggestionIndex = 1;
    for (const [filePath, fileSuggestions] of Object.entries(groupedByFile)) {
      outputChannel.appendLine(`📄 ${filePath} (${fileSuggestions.length}个建议)`);
      outputChannel.appendLine('-'.repeat(80));
      outputChannel.appendLine('');

      for (const suggestion of fileSuggestions) {
        outputChannel.appendLine(`[${suggestionIndex}] ${suggestion.type.toUpperCase()}`);
        outputChannel.appendLine(`位置: 第 ${suggestion.newLine || suggestion.oldLine || '?'} 行`);
        outputChannel.appendLine(`作者: ${suggestion.author}`);
        outputChannel.appendLine('');
        outputChannel.appendLine('建议内容:');
        outputChannel.appendLine(suggestion.body);
        outputChannel.appendLine('');
        outputChannel.appendLine('-'.repeat(40));
        outputChannel.appendLine('');
        suggestionIndex++;
      }

      outputChannel.appendLine('');
    }

    // 生成AI提示词模板
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('🤖 AI提示词模板（可复制到AI窗口）');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');
    outputChannel.appendLine(this.generateAIPrompt(suggestions));
    outputChannel.appendLine('');

    // 提供操作选项
    const action = await vscode.window.showInformationMessage(
      `已获取 ${suggestions.length} 个Code Review建议\n\n建议已显示在输出面板中`,
      '在AI窗口处理',
      '逐个查看文件',
      '复制AI提示词',
      '关闭'
    );

    if (action === '在AI窗口处理') {
      await this.openAIWindowWithPrompt(suggestions);
    } else if (action === '逐个查看文件') {
      await this.openFilesWithSuggestions(suggestions, workspaceUri);
    } else if (action === '复制AI提示词') {
      const aiPrompt = this.generateAIPrompt(suggestions);
      await vscode.env.clipboard.writeText(aiPrompt);
      void vscode.window.showInformationMessage('✅ AI提示词已复制到剪贴板');
    }
  }

  private async openAIWindowWithPrompt(suggestions: any[]): Promise<void> {
    try {
      const aiPrompt = this.generateAIPrompt(suggestions);
      
      // 先将内容复制到剪贴板
      await vscode.env.clipboard.writeText(aiPrompt);
      
      this._logger.info('Opening AI chat window with prompt');

      // 尝试多个可能的命令来打开AI chat
      const commandsToTry = [
        // Cursor AI chat commands
        'aichat.newchataction',
        'workbench.action.chat.open',
        'workbench.panel.chat.view.copilot.focus',
        'github.copilot.chat.open',
        // VSCode命令
        'workbench.action.chat.openInEditor',
        'workbench.action.quickchat.toggle',
      ];

      let commandSucceeded = false;

      for (const command of commandsToTry) {
        try {
          this._logger.debug(`Trying command: ${command}`);
          await vscode.commands.executeCommand(command);
          
          // 等待窗口打开
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // 尝试粘贴
          try {
            await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
          } catch {
            // 如果粘贴失败，尝试另一个粘贴命令
            try {
              await vscode.commands.executeCommand('workbench.action.terminal.paste');
            } catch {
              this._logger.debug('Paste command failed, content is in clipboard');
            }
          }
          
          commandSucceeded = true;
          this._logger.info(`Successfully opened AI chat with command: ${command}`);
          
          void vscode.window.showInformationMessage(
            '✅ AI窗口已打开，提示词已自动粘贴\n\n' +
            '如未自动粘贴，请按 Cmd+V (Mac) 或 Ctrl+V (Windows/Linux) 粘贴\n\n' +
            '然后按 Enter 发送给AI'
          );
          
          break;
        } catch (error) {
          this._logger.debug(`Command ${command} failed:`, error);
          continue;
        }
      }

      if (!commandSucceeded) {
        this._logger.warn('All AI chat commands failed, showing manual instructions');
        
        void vscode.window.showInformationMessage(
          '💡 AI提示词已复制到剪贴板！\n\n' +
          '请手动打开AI窗口：\n' +
          '• Cursor: Cmd+L (Mac) 或 Ctrl+L (Windows/Linux)\n' +
          '• VSCode Copilot: Cmd+I 或 Ctrl+I\n' +
          '• GitHub Copilot Chat: 点击侧边栏Chat图标\n\n' +
          '然后粘贴（Cmd+V / Ctrl+V）并发送',
          '重试'
        ).then(async (action) => {
          if (action === '重试') {
            await this.openAIWindowWithPrompt(suggestions);
          }
        });
      }
    } catch (error) {
      this._logger.error('Failed to open AI window with prompt', error);
      void vscode.window.showErrorMessage(
        `打开AI窗口失败: ${String(error)}\n\n提示词已复制到剪贴板，请手动打开AI窗口并粘贴`
      );
    }
  }

  private groupSuggestionsByFile(suggestions: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const suggestion of suggestions) {
      const file = suggestion.filePath || 'unknown';
      if (!grouped[file]) {
        grouped[file] = [];
      }
      grouped[file].push(suggestion);
    }

    return grouped;
  }

  private generateAIPrompt(suggestions: any[]): string {
    const lines = [
      '请帮我处理以下Code Review建议，并给出具体的代码修改方案：',
      '',
    ];

    const groupedByFile = this.groupSuggestionsByFile(suggestions);

    for (const [filePath, fileSuggestions] of Object.entries(groupedByFile)) {
      lines.push(`## 文件: ${filePath}`);
      lines.push('');

      for (let i = 0; i < fileSuggestions.length; i++) {
        const suggestion = fileSuggestions[i];
        lines.push(`### 建议 ${i + 1}: ${suggestion.type}`);
        lines.push(`位置: 第 ${suggestion.newLine || suggestion.oldLine || '?'} 行`);
        lines.push('');
        lines.push('**Reviewer的建议:**');
        lines.push(suggestion.body);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('请：');
    lines.push('1. 分析每个建议的合理性');
    lines.push('2. 提供具体的代码修改方案');
    lines.push('3. 如果需要，直接给出修改后的代码');

    return lines.join('\n');
  }

  private async openFilesWithSuggestions(
    suggestions: any[],
    workspaceUri: vscode.Uri
  ): Promise<void> {
    const groupedByFile = this.groupSuggestionsByFile(suggestions);
    const files = Object.keys(groupedByFile);

    if (files.length === 0) {
      return;
    }

    // 打开第一个文件
    const firstFile = files[0];
    const firstSuggestion = groupedByFile[firstFile][0];
    
    try {
      const fileUri = vscode.Uri.joinPath(workspaceUri, firstFile);
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document);

      // 定位到建议的行
      if (firstSuggestion.newLine || firstSuggestion.oldLine) {
        const line = (firstSuggestion.newLine || firstSuggestion.oldLine) - 1;
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }

      void vscode.window.showInformationMessage(
        `已打开 ${firstFile}\n\n其他 ${files.length - 1} 个文件可在输出面板查看`
      );
    } catch (error) {
      this._logger.error('Failed to open file', error);
      void vscode.window.showErrorMessage('无法打开文件');
    }
  }

  private async detectProjectId(workspaceUri: vscode.Uri): Promise<string | undefined> {
    try {
      // 获取Git远程仓库URL
      const remoteUrl = await this._gitService.getRemoteUrl(workspaceUri);
      
      if (!remoteUrl) {
        this._logger.warn('No Git remote URL found');
        return undefined;
      }

      this._logger.debug('Git remote URL', { remoteUrl });

      // 从URL提取GitLab项目路径
      const projectPath = this._gitService.extractGitlabProjectPath(remoteUrl);
      
      if (!projectPath) {
        this._logger.warn('Could not extract GitLab project path from URL', { remoteUrl });
        return undefined;
      }

      this._logger.info('Extracted GitLab project path', { projectPath, remoteUrl });
      return projectPath;
    } catch (error) {
      this._logger.error('Failed to detect project ID', error);
      return undefined;
    }
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }
}

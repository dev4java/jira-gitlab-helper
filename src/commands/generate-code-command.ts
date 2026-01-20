import * as vscode from 'vscode';
import { CodeGenerationService } from '../services/code-generation-service';
import { Logger } from '../utils/logger';
import { IOpenSpecProposal } from '../models/requirement-analysis';
import { IJiraIssue } from '../models/jira-issue';
import { ICodeGenerationTask, IGeneratedCode } from '../models/code-generation';

export class GenerateCodeCommand {
  constructor(
    private readonly _codeGenerationService: CodeGenerationService,
    private readonly _logger: Logger
  ) {}

  public async execute(issue?: IJiraIssue, proposal?: IOpenSpecProposal): Promise<void> {
    try {
      this._logger.info('Starting code generation...');

      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      // Get change ID
      const changeId = proposal?.changeId || (await this.promptForChangeId());
      if (!changeId) {
        this._logger.info('Code generation cancelled by user');
        return;
      }

      // Confirm current Git branch before proceeding
      const confirmed = await this.confirmCurrentBranch(workspaceUri);
      if (!confirmed) {
        this._logger.info('Code generation cancelled: user did not confirm branch');
        void vscode.window.showWarningMessage('已取消代码生成。请切换到正确的分支后再试。');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `生成代码 (${changeId})...`,
          cancellable: false,
        },
        async (progress) => {
          // Step 1: Load tasks
          progress.report({ message: '正在加载任务列表...' });
          const tasks = await this._codeGenerationService.loadTasksFromOpenSpec(
            changeId,
            workspaceUri
          );

          if (tasks.length === 0) {
            throw new Error('未找到待执行的任务');
          }

          // Step 2: Analyze project
          progress.report({ message: '正在分析项目结构...' });
          const projectStructure =
            await this._codeGenerationService.analyzeProjectStructure(workspaceUri);

          // Step 3: Select tasks to execute
          const selectedTasks = await this.selectTasksToExecute(tasks);
          if (!selectedTasks || selectedTasks.length === 0) {
            this._logger.info('No tasks selected');
            return;
          }

          // Step 4: Generate code for each task
          const allGeneratedCode: IGeneratedCode[] = [];
          for (let i = 0; i < selectedTasks.length; i++) {
            const task = selectedTasks[i];
            progress.report({
              message: `正在生成代码 (${i + 1}/${selectedTasks.length}): ${task.description}`,
              increment: 100 / selectedTasks.length,
            });

            if (!proposal) {
              throw new Error('需要OpenSpec提案才能生成代码');
            }

            const generatedCode = await this._codeGenerationService.generateCode(
              task,
              projectStructure,
              proposal,
              workspaceUri
            );

            allGeneratedCode.push(...generatedCode);
          }

          // Step 5: Preview changes
          progress.report({ message: '正在准备代码预览...' });
          const diffs = await this._codeGenerationService.generateDiff(
            allGeneratedCode,
            workspaceUri
          );

          // Show preview and ask for confirmation
          const shouldApply = await this.showCodePreview(diffs);
          if (!shouldApply) {
            void vscode.window.showInformationMessage('代码生成已取消');
            return;
          }

          // Step 6: Apply changes
          progress.report({ message: '正在应用代码变更...' });
          await this._codeGenerationService.applyGeneratedCode(allGeneratedCode, workspaceUri);

          void vscode.window
            .showInformationMessage(
              `代码生成完成! 生成了 ${allGeneratedCode.length} 个文件`,
              '查看变更',
              '提交代码'
            )
            .then(async (action) => {
              if (action === '查看变更') {
                await this.showGeneratedFiles(allGeneratedCode, workspaceUri);
              } else if (action === '提交代码') {
                await vscode.commands.executeCommand('jiraGitlabHelper.commitCode', issue);
              }
            });

          this._logger.info('Code generation completed', {
            changeId,
            filesGenerated: allGeneratedCode.length,
          });
        }
      );
    } catch (error) {
      this._logger.error('Failed to generate code', error);
      void vscode.window.showErrorMessage(`生成代码失败: ${String(error)}`);
    }
  }

  private async promptForChangeId(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: '请输入OpenSpec变更ID',
      placeHolder: 'add-feature-name',
      validateInput: (value) => {
        if (!value) {
          return '变更ID不能为空';
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return '变更ID只能包含小写字母、数字和连字符';
        }
        return null;
      },
    });
  }

  private async selectTasksToExecute(tasks: ICodeGenerationTask[]): Promise<ICodeGenerationTask[]> {
    const pendingTasks = tasks.filter((t) => !t.completed);

    if (pendingTasks.length === 0) {
      void vscode.window.showInformationMessage('所有任务已完成');
      return [];
    }

    const items = pendingTasks.map((task) => ({
      label: `${task.id} ${task.description}`,
      description: task.module,
      task,
      picked: true,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: '选择要执行的任务',
    });

    return selected ? selected.map((item) => item.task) : [];
  }

  private async showCodePreview(diffs: any[]): Promise<boolean> {
    const message = [
      `将要修改 ${diffs.length} 个文件:`,
      '',
      ...diffs.map((diff) => {
        const changeCount = diff.diff
          .split('\n')
          .filter((l: string) => l.startsWith('+') || l.startsWith('-')).length;
        return `- ${diff.filePath} (${changeCount} 行变更)`;
      }),
    ].join('\n');

    const action = await vscode.window.showInformationMessage(
      '代码生成预览',
      {
        detail: message,
        modal: true,
      },
      '应用变更'
    );

    return action === '应用变更';
  }

  private async showGeneratedFiles(generatedCode: any[], workspaceUri: vscode.Uri): Promise<void> {
    try {
      for (const code of generatedCode.slice(0, 5)) {
        const fileUri = vscode.Uri.joinPath(workspaceUri, code.filePath);
        await vscode.commands.executeCommand('vscode.open', fileUri);
      }
    } catch (error) {
      this._logger.error('Failed to show generated files', error);
    }
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }

  private async confirmCurrentBranch(_workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      // Get current branch name
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      const git = gitExtension?.getAPI(1);
      
      if (!git) {
        this._logger.warn('Git extension not found');
        // If Git extension is not available, ask user to confirm manually
        const result = await vscode.window.showWarningMessage(
          '无法自动检测Git分支。确定要在当前分支生成代码吗？',
          { modal: true },
          '确定'
        );
        return result === '确定';
      }

      const repo = git.repositories[0];
      if (!repo) {
        this._logger.warn('No Git repository found');
        const result = await vscode.window.showWarningMessage(
          '未找到Git仓库。确定要继续吗？',
          { modal: true },
          '确定'
        );
        return result === '确定';
      }

      const currentBranch = repo.state.HEAD?.name || 'unknown';
      
      // Ask user to confirm
      const result = await vscode.window.showInformationMessage(
        `当前分支: ${currentBranch}\n\n确定要在此分支生成代码吗？`,
        { modal: true },
        '确定'
      );
      
      return result === '确定';
    } catch (error) {
      this._logger.error('Failed to check Git branch', error);
      
      // On error, ask user to confirm manually
      const result = await vscode.window.showWarningMessage(
        '无法检测当前Git分支。确定要继续吗？',
        { modal: true },
        '确定'
      );
      return result === '确定';
    }
  }
}

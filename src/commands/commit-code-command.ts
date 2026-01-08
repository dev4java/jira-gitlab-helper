import * as vscode from 'vscode';
import { GitService } from '../services/git-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';

export class CommitCodeCommand {
  constructor(
    private readonly _gitService: GitService,
    private readonly _logger: Logger
  ) {}

  public async execute(issue?: IJiraIssue): Promise<void> {
    try {
      this._logger.info('Starting code commit...');

      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      // Check for uncommitted changes
      const hasChanges = await this._gitService.hasUncommittedChanges(workspaceUri);
      if (!hasChanges) {
        void vscode.window.showInformationMessage('没有需要提交的代码变更');
        return;
      }

      // Get modified files
      const modifiedFiles = await this._gitService.getModifiedFiles(workspaceUri);

      // Generate commit message
      const commitMessage = await this.generateCommitMessage(issue, modifiedFiles);
      if (!commitMessage) {
        this._logger.info('Code commit cancelled by user');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在提交代码...',
          cancellable: false,
        },
        async () => {
          // Stage files
          await this._gitService.stageFiles(workspaceUri, modifiedFiles);

          // Commit
          await this._gitService.commit(workspaceUri, commitMessage);

          void vscode.window
            .showInformationMessage('代码已提交', '推送到远程', '创建MR')
            .then(async (action) => {
              if (action === '推送到远程') {
                await this._gitService.push(workspaceUri, 'origin', undefined, true);
                void vscode.window.showInformationMessage('代码已推送到远程');
              } else if (action === '创建MR') {
                await vscode.commands.executeCommand('jiraGitlabHelper.createMR', issue);
              }
            });

          this._logger.info('Code committed successfully');
        }
      );
    } catch (error) {
      this._logger.error('Failed to commit code', error);
      void vscode.window.showErrorMessage(`提交代码失败: ${String(error)}`);
    }
  }

  private async generateCommitMessage(
    issue: IJiraIssue | undefined,
    modifiedFiles: string[]
  ): Promise<string | undefined> {
    const defaultMessage = issue
      ? `[${issue.key}] ${issue.summary}`
      : `Update ${modifiedFiles.length} files`;

    return await vscode.window.showInputBox({
      prompt: '请输入提交消息',
      value: defaultMessage,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return '提交消息不能为空';
        }
        return null;
      },
    });
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }
}

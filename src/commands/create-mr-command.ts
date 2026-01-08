import * as vscode from 'vscode';
import { GitlabService } from '../services/gitlab-service';
import { GitService } from '../services/git-service';
import { JiraService } from '../services/jira-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';

export class CreateMRCommand {
  constructor(
    private readonly _gitlabService: GitlabService,
    private readonly _gitService: GitService,
    private readonly _jiraService: JiraService,
    private readonly _logger: Logger
  ) {}

  public async execute(issue?: IJiraIssue): Promise<void> {
    try {
      this._logger.info('Starting MR creation...');

      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      // Get current branch
      const sourceBranch = await this._gitService.getCurrentBranch(workspaceUri);

      // Get JIRA issue if not provided
      if (!issue) {
        issue = await this.getJiraIssueFromBranch(sourceBranch);
      }

      if (!issue) {
        void vscode.window.showErrorMessage('无法确定JIRA问题,请手动指定');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `创建Merge Request...`,
          cancellable: false,
        },
        async () => {
          // Create MR
          const mr = await this._gitlabService.createMergeRequest(
            sourceBranch,
            issue!.key,
            issue!.summary
          );

          void vscode.window
            .showInformationMessage(
              `Merge Request已创建: !${mr.iid}`,
              '在浏览器中打开',
              '处理CR建议'
            )
            .then(async (action) => {
              if (action === '在浏览器中打开') {
                await vscode.env.openExternal(vscode.Uri.parse(mr.webUrl));
              } else if (action === '处理CR建议') {
                // Wait a moment for GitLab CI to run
                await new Promise((resolve) => setTimeout(resolve, 5000));
                await vscode.commands.executeCommand('jiraGitlabHelper.handleCRSuggestions');
              }
            });

          this._logger.info('MR created successfully', { mrIid: mr.iid });
        }
      );
    } catch (error) {
      this._logger.error('Failed to create MR', error);
      void vscode.window.showErrorMessage(`创建Merge Request失败: ${String(error)}`);
    }
  }

  private async getJiraIssueFromBranch(branchName: string): Promise<IJiraIssue | undefined> {
    // Extract JIRA key from branch name (e.g., feature/PROJ-123-description)
    const match = branchName.match(/([A-Z]+-\d+)/);
    if (!match) {
      return undefined;
    }

    const issueKey = match[1];
    try {
      return await this._jiraService.getIssue(issueKey);
    } catch {
      return undefined;
    }
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }
}

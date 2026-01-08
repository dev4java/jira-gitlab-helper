import { GitlabClient, IGitlabClientConfig } from '../integrations/gitlab-client';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';
import {
  IGitlabProject,
  IGitlabBranch,
  IGitlabMergeRequest,
  IGitlabDiscussion,
  ICodeSuggestion,
  ICommitFile,
} from '../models/gitlab-models';

export class GitlabService {
  private _client: GitlabClient | null = null;

  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async getClient(): Promise<GitlabClient> {
    if (!this._client) {
      await this.initializeClient();
    }

    if (!this._client) {
      throw new Error('GitLab客户端未初始化,请先配置GitLab连接');
    }

    return this._client;
  }

  private async initializeClient(): Promise<void> {
    try {
      const config = this._configManager.getGitlabConfig();
      const token = await this._configManager.getGitlabToken();

      if (!config.serverUrl || !token) {
        throw new Error('GitLab配置不完整,请先配置GitLab连接');
      }

      const clientConfig: IGitlabClientConfig = {
        serverUrl: config.serverUrl,
        token,
        projectId: config.defaultProjectId,
      };

      this._client = new GitlabClient(clientConfig, this._logger);
      this._logger.info('GitLab service initialized');
    } catch (error) {
      this._logger.error('Failed to initialize GitLab client', error);
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    const client = await this.getClient();
    return await client.testConnection();
  }

  public async getProject(projectId?: string): Promise<IGitlabProject> {
    const client = await this.getClient();
    return await client.getProject(projectId);
  }

  public async getBranches(projectId?: string): Promise<IGitlabBranch[]> {
    const client = await this.getClient();
    return await client.getBranches(projectId);
  }

  public async createBranchForJiraIssue(
    issueKey: string,
    issueType: string,
    ref?: string,
    projectId?: string
  ): Promise<IGitlabBranch> {
    const client = await this.getClient();
    const project = await client.getProject(projectId);

    const branchPrefix = this.getBranchPrefix(issueType);
    const branchName = `${branchPrefix}/${issueKey.toLowerCase()}`;
    const baseBranch = ref || project.defaultBranch;

    return await client.createBranch(branchName, baseBranch, projectId);
  }

  private getBranchPrefix(issueType: string): string {
    const type = issueType.toLowerCase();
    if (type === 'bug') {
      return 'bugfix';
    }
    return 'feature';
  }

  public async commitFiles(
    branchName: string,
    commitMessage: string,
    files: ICommitFile[],
    projectId?: string
  ): Promise<void> {
    const client = await this.getClient();
    await client.commitFiles(branchName, commitMessage, files, projectId);
  }

  public async createMergeRequest(
    sourceBranch: string,
    jiraIssueKey: string,
    jiraIssueSummary: string,
    projectId?: string
  ): Promise<IGitlabMergeRequest> {
    const config = this._configManager.getGitlabConfig();
    const targetBranch = config.defaultTargetBranch;

    const title = `[${jiraIssueKey}] ${jiraIssueSummary}`;
    const description = this.generateMRDescription(jiraIssueKey, jiraIssueSummary);

    const client = await this.getClient();
    return await client.createMergeRequest(
      sourceBranch,
      targetBranch,
      title,
      description,
      projectId
    );
  }

  private generateMRDescription(jiraIssueKey: string, jiraIssueSummary: string): string {
    const jiraConfig = this._configManager.getJiraConfig();
    const jiraUrl = `${jiraConfig.serverUrl}/browse/${jiraIssueKey}`;

    return [
      `## JIRA问题`,
      ``,
      `[${jiraIssueKey}](${jiraUrl}): ${jiraIssueSummary}`,
      ``,
      `## 变更说明`,
      ``,
      `<!-- 请在此处添加变更说明 -->`,
      ``,
      `## 测试说明`,
      ``,
      `<!-- 请在此处添加测试说明 -->`,
    ].join('\n');
  }

  public async getMergeRequest(mrIid: number, projectId?: string): Promise<IGitlabMergeRequest> {
    const client = await this.getClient();
    return await client.getMergeRequest(mrIid, projectId);
  }

  public async getMergeRequestDiscussions(
    mrIid: number,
    projectId?: string
  ): Promise<IGitlabDiscussion[]> {
    const client = await this.getClient();
    return await client.getMergeRequestDiscussions(mrIid, projectId);
  }

  public async getCodeSuggestions(mrIid: number, projectId?: string): Promise<ICodeSuggestion[]> {
    const discussions = await this.getMergeRequestDiscussions(mrIid, projectId);
    const client = await this.getClient();
    return client.extractCodeSuggestions(discussions);
  }

  public resetClient(): void {
    this._client = null;
    this._logger.info('GitLab client reset');
  }
}

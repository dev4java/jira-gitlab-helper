import { JiraClient, IJiraClientConfig } from '../integrations/jira-client';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';
import { IJiraIssue, IJiraSearchResult, JiraIssueTypeHelper } from '../models/jira-issue';

export class JiraService {
  private _client: JiraClient | null = null;

  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async getClient(): Promise<JiraClient> {
    if (!this._client) {
      await this.initializeClient();
    }

    if (!this._client) {
      throw new Error('JIRA客户端未初始化,请先配置JIRA连接');
    }

    return this._client;
  }

  private async initializeClient(): Promise<void> {
    try {
      const config = this._configManager.getJiraConfig();
      const credential = await this._configManager.getJiraCredential();

      this._logger.info('Initializing JIRA client', {
        serverUrl: config.serverUrl ? '***' : '(empty)',
        username: config.username ? '***' : '(empty)',
        authType: config.authType,
        hasCredential: !!credential,
        credentialLength: credential ? credential.length : 0,
      });

      if (!config.serverUrl || !config.username || !credential) {
        throw new Error('JIRA配置不完整,请先配置JIRA连接');
      }

      const clientConfig: IJiraClientConfig = {
        serverUrl: config.serverUrl,
        username: config.username,
        credential,
        authType: config.authType,
      };

      this._client = new JiraClient(clientConfig, this._logger);
      this._logger.info('JIRA service initialized');
    } catch (error) {
      this._logger.error('Failed to initialize JIRA client', error);
      throw error;
    }
  }

  public async testConnection(): Promise<boolean> {
    const client = await this.getClient();
    return await client.testConnection();
  }

  public async getIssue(issueKey: string): Promise<IJiraIssue> {
    const client = await this.getClient();
    return await client.getIssue(issueKey);
  }

  public async searchMyIssues(): Promise<IJiraSearchResult> {
    const config = this._configManager.getJiraConfig();
    // 查询所有状态的问题（包括已关闭的）
    const jql = `assignee = "${config.username}"`;

    const client = await this.getClient();
    return await client.searchIssues(jql, 0, 100);
  }

  public async searchMyBugs(maxResults = 100): Promise<IJiraSearchResult> {
    const config = this._configManager.getJiraConfig();
    const jql = `assignee = "${config.username}" AND type = Bug AND status != Done ORDER BY priority DESC, updated DESC`;

    const client = await this.getClient();
    return await client.searchIssues(jql, 0, maxResults);
  }

  public async searchOpenBugs(maxResults = 100): Promise<IJiraSearchResult> {
    const jql = `type = Bug AND status in (Open, "In Progress", Reopened) ORDER BY priority DESC, updated DESC`;

    const client = await this.getClient();
    return await client.searchIssues(jql, 0, maxResults);
  }

  public async searchIssues(jql: string, startAt = 0, maxResults = 50): Promise<IJiraSearchResult> {
    const client = await this.getClient();
    return await client.searchIssues(jql, startAt, maxResults);
  }

  public async updateIssueStatus(issueKey: string, statusName: string): Promise<void> {
    const client = await this.getClient();

    // Get available transitions
    const transitions = await client.getIssueTransitions(issueKey);

    // Find transition by name
    const transition = transitions.find((t) => t.name.toLowerCase() === statusName.toLowerCase());

    if (!transition) {
      throw new Error(`找不到状态转换: ${statusName}`);
    }

    await client.updateIssueStatus(issueKey, transition.id);
  }

  public async addComment(issueKey: string, comment: string): Promise<void> {
    const client = await this.getClient();
    await client.addComment(issueKey, comment);
  }

  public async getIssueTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
    const client = await this.getClient();
    return await client.getIssueTransitions(issueKey);
  }

  public isRequirementIssue(issue: IJiraIssue): boolean {
    return JiraIssueTypeHelper.isRequirement(issue.type);
  }

  public isBugIssue(issue: IJiraIssue): boolean {
    return JiraIssueTypeHelper.isBug(issue.type);
  }

  public resetClient(): void {
    this._client = null;
    this._logger.info('JIRA client reset');
  }
}

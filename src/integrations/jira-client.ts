import axios, { AxiosInstance, AxiosError } from 'axios';
import { IJiraIssue, IJiraSearchResult, JiraIssueTypeHelper } from '../models/jira-issue';
import { Logger } from '../utils/logger';

export class JiraConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'JiraConnectionError';
  }
}

export class JiraAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JiraAuthenticationError';
  }
}

export interface IJiraClientConfig {
  serverUrl: string;
  username: string;
  credential: string;
  authType: 'password' | 'apiToken';
}

export class JiraClient {
  private _axiosInstance: AxiosInstance;
  private readonly _logger: Logger;
  private _serverUrl: string;
  private _authHeader: string;
  private _apiVersion: '2' | '3' = '2';

  constructor(config: IJiraClientConfig, logger: Logger) {
    this._logger = logger;
    this._serverUrl = config.serverUrl;
    this._authHeader = this.createAuthHeader(config.username, config.credential);

    // 初始化使用v2
    this._axiosInstance = this.createAxiosInstance('2');

    this._logger.info('JIRA client initialized', { 
      serverUrl: config.serverUrl,
      apiVersion: this._apiVersion
    });
  }

  private createAxiosInstance(apiVersion: '2' | '3'): AxiosInstance {
    return axios.create({
      baseURL: `${this._serverUrl}/rest/api/${apiVersion}`,
      headers: {
        Authorization: this._authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000, // 30秒超时（Jira查询可能需要更长时间）
    });
  }

  private async detectApiVersion(): Promise<'2' | '3'> {
    this._logger.debug('Detecting JIRA API version...');

    // 先尝试v2
    try {
      const v2Instance = axios.create({
        baseURL: `${this._serverUrl}/rest/api/2`,
        headers: {
          Authorization: this._authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });
      await v2Instance.get('/serverInfo');
      this._logger.info('Detected JIRA API version: 2');
      return '2';
    } catch (error) {
      this._logger.debug('API v2 not available, trying v3');
    }

    // 尝试v3
    try {
      const v3Instance = axios.create({
        baseURL: `${this._serverUrl}/rest/api/3`,
        headers: {
          Authorization: this._authHeader,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });
      await v3Instance.get('/serverInfo');
      this._logger.info('Detected JIRA API version: 3');
      return '3';
    } catch (error) {
      this._logger.warn('Could not detect API version, defaulting to v2');
      return '2';
    }
  }

  private createAuthHeader(username: string, credential: string): string {
    const token = Buffer.from(`${username}:${credential}`).toString('base64');
    return `Basic ${token}`;
  }

  public async testConnection(): Promise<boolean> {
    try {
      this._logger.debug('Testing JIRA connection...');
      
      // 自动检测API版本
      const detectedVersion = await this.detectApiVersion();
      if (detectedVersion !== this._apiVersion) {
        this._apiVersion = detectedVersion;
        this._axiosInstance = this.createAxiosInstance(this._apiVersion);
        this._logger.info('Switched to API version', { version: this._apiVersion });
      }

      const response = await this._axiosInstance.get('/myself');
      this._logger.info('JIRA connection test successful', { 
        user: response.data.displayName,
        apiVersion: this._apiVersion
      });
      return true;
    } catch (error) {
      this._logger.error('JIRA connection test failed', error);
      if (this.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new JiraAuthenticationError('JIRA认证失败,请检查用户名和凭据');
        }
        if (error.code === 'ECONNABORTED') {
          throw new JiraConnectionError('连接超时,请检查网络或服务器地址');
        }
        throw new JiraConnectionError(`连接JIRA失败: ${error.message}`, error);
      }
      throw new JiraConnectionError('连接JIRA时发生未知错误');
    }
  }

  public async getIssue(issueKey: string): Promise<IJiraIssue> {
    try {
      this._logger.debug('Fetching JIRA issue', { issueKey, apiVersion: this._apiVersion });

      const response = await this._axiosInstance.get(`/issue/${issueKey}`);

      const issue = this.transformIssue(response.data);
      this._logger.info('JIRA issue fetched successfully', { issueKey, type: issue.type });

      return issue;
    } catch (error) {
      this._logger.error('Failed to fetch JIRA issue', { issueKey, error });

      if (this.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // 404可能是API版本问题，尝试切换版本
          this._logger.info('Got 404, trying to switch API version');
          const newVersion = this._apiVersion === '2' ? '3' : '2';
          this._apiVersion = newVersion;
          this._axiosInstance = this.createAxiosInstance(newVersion);
          this._logger.info('Switched API version, retrying', { version: newVersion });
          
          try {
            // 重试一次
            const retryResponse = await this._axiosInstance.get(`/issue/${issueKey}`);
            const issue = this.transformIssue(retryResponse.data);
            this._logger.info('JIRA issue fetched successfully after API version switch', { 
              issueKey, 
              type: issue.type,
              apiVersion: this._apiVersion
            });
            return issue;
          } catch (retryError) {
            throw new Error(`JIRA问题 ${issueKey} 不存在`);
          }
        }
        if (error.response?.status === 401) {
          throw new JiraAuthenticationError('JIRA认证已过期,请重新配置');
        }
        if (error.code === 'ECONNABORTED') {
          throw new JiraConnectionError('请求超时(10秒),请检查网络连接');
        }
        throw new JiraConnectionError(`获取JIRA问题失败: ${error.message}`, error);
      }

      throw new Error('获取JIRA问题时发生未知错误');
    }
  }

  public async searchIssues(jql: string, startAt = 0, maxResults = 50): Promise<IJiraSearchResult> {
    try {
      this._logger.debug('Searching JIRA issues', { jql, startAt, maxResults });

      const response = await this._axiosInstance.post('/search', {
        jql,
        startAt,
        maxResults,
        fields: ['*all'],
      });

      const result: IJiraSearchResult = {
        issues: response.data.issues.map((issue: unknown) => this.transformIssue(issue)),
        total: response.data.total,
        startAt: response.data.startAt,
        maxResults: response.data.maxResults,
      };

      this._logger.info('JIRA issues searched successfully', {
        total: result.total,
        returned: result.issues.length,
      });

      return result;
    } catch (error: any) {
      this._logger.error('Failed to search JIRA issues', { 
        jql, 
        error: error.message,
        statusCode: error.response?.status,
        serverUrl: this._serverUrl
      });

      if (this.isAxiosError(error)) {
        if (error.response?.status === 400) {
          throw new Error(
            `JQL查询语法错误\n\n` +
            `查询语句: ${jql}\n\n` +
            `请检查JQL语法是否正确。\n` +
            `参考：https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/`
          );
        }
        if (error.response?.status === 401) {
          throw new JiraAuthenticationError(
            `Jira认证失败\n\n` +
            `您的凭据可能已过期或无效。\n\n` +
            `请重新配置：命令面板 -> "Jira: Configure Connection"`
          );
        }
        if (error.response?.status === 403) {
          throw new JiraConnectionError(
            `Jira权限不足\n\n` +
            `您没有执行此查询的权限。\n\n` +
            `请确保您的账户有相应项目的访问权限。`
          );
        }
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          throw new JiraConnectionError(
            `Jira请求超时\n\n` +
            `服务器: ${this._serverUrl}\n\n` +
            `可能的原因：\n` +
            `1. 网络连接不稳定\n` +
            `2. Jira服务器响应缓慢\n` +
            `3. 查询数据量过大\n\n` +
            `建议：缩小查询范围或检查网络连接`
          );
        }
        throw new JiraConnectionError(`搜索JIRA问题失败: ${error.message}`, error);
      }

      throw new Error('搜索JIRA问题时发生未知错误');
    }
  }

  public async updateIssueStatus(issueKey: string, transitionId: string): Promise<void> {
    try {
      this._logger.debug('Updating JIRA issue status', { issueKey, transitionId });

      await this._axiosInstance.post(`/issue/${issueKey}/transitions`, {
        transition: {
          id: transitionId,
        },
      });

      this._logger.info('JIRA issue status updated successfully', { issueKey, transitionId });
    } catch (error) {
      this._logger.error('Failed to update JIRA issue status', { issueKey, transitionId, error });

      if (this.isAxiosError(error)) {
        throw new JiraConnectionError(`更新JIRA问题状态失败: ${error.message}`, error);
      }

      throw new Error('更新JIRA问题状态时发生未知错误');
    }
  }

  public async getIssueTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
    try {
      this._logger.debug('Fetching JIRA issue transitions', { issueKey });

      const response = await this._axiosInstance.get(`/issue/${issueKey}/transitions`);

      const transitions = response.data.transitions.map((t: { id: string; name: string }) => ({
        id: t.id,
        name: t.name,
      }));

      this._logger.info('JIRA issue transitions fetched successfully', {
        issueKey,
        count: transitions.length,
      });

      return transitions;
    } catch (error) {
      this._logger.error('Failed to fetch JIRA issue transitions', { issueKey, error });

      if (this.isAxiosError(error)) {
        throw new JiraConnectionError(`获取JIRA问题状态转换失败: ${error.message}`, error);
      }

      throw new Error('获取JIRA问题状态转换时发生未知错误');
    }
  }

  public async addComment(issueKey: string, comment: string): Promise<void> {
    try {
      this._logger.debug('Adding comment to JIRA issue', { issueKey });

      await this._axiosInstance.post(`/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment,
                },
              ],
            },
          ],
        },
      });

      this._logger.info('Comment added to JIRA issue successfully', { issueKey });
    } catch (error) {
      this._logger.error('Failed to add comment to JIRA issue', { issueKey, error });

      if (this.isAxiosError(error)) {
        throw new JiraConnectionError(`添加JIRA评论失败: ${error.message}`, error);
      }

      throw new Error('添加JIRA评论时发生未知错误');
    }
  }

  private transformIssue(data: any): IJiraIssue {
    const fields = data.fields || {};

    // Extract custom fields
    const customFields: Record<string, unknown> = {};
    let plannedTestDate: string | undefined;
    
    // 遍历所有字段，找出自定义字段
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('customfield_')) {
        customFields[key] = value;
        
        // 尝试找到计划提测日期字段（常见的命名）
        if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          // 这可能是日期字段
          if (!plannedTestDate) {
            plannedTestDate = value;
          }
        }
      }
    }

    return {
      key: data.key,
      id: data.id,
      summary: fields.summary || '',
      description: this.extractDescription(fields.description),
      type: JiraIssueTypeHelper.fromString(fields.issuetype?.name || 'Task'),
      status: fields.status?.name || '',
      assignee: fields.assignee
        ? {
            displayName: fields.assignee.displayName,
            emailAddress: fields.assignee.emailAddress,
          }
        : undefined,
      reporter: fields.reporter
        ? {
            displayName: fields.reporter.displayName,
            emailAddress: fields.reporter.emailAddress,
          }
        : undefined,
      priority: fields.priority?.name || 'Medium',
      created: fields.created,
      updated: fields.updated,
      labels: fields.labels || [],
      components: (fields.components || []).map((c: { name: string }) => c.name),
      customFields,
      plannedTestDate: plannedTestDate || fields.duedate,
      dueDate: fields.duedate,
    };
  }

  private extractDescription(description: any): string {
    if (!description) {
      return '';
    }

    if (typeof description === 'string') {
      return description;
    }

    // Handle Atlassian Document Format
    if (description.type === 'doc' && description.content) {
      return this.extractTextFromADF(description.content);
    }

    return JSON.stringify(description);
  }

  private extractTextFromADF(content: any[]): string {
    let text = '';

    for (const node of content) {
      if (node.type === 'paragraph' && node.content) {
        for (const child of node.content) {
          if (child.type === 'text' && child.text) {
            text += child.text;
          }
        }
        text += '\n';
      } else if (node.type === 'text' && node.text) {
        text += node.text;
      }
    }

    return text.trim();
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }
}

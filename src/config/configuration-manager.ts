import * as vscode from 'vscode';

export interface IJiraConfig {
  serverUrl: string;
  username: string;
  authType: 'password' | 'apiToken';
}

export interface IGitlabConfig {
  serverUrl: string;
  defaultProjectId: string;
  defaultTargetBranch: string;
}

export interface IConfluenceConfig {
  serverUrl: string;
  username: string;
  authType: 'password' | 'apiToken';
  enabled: boolean;
}

export interface IAIConfig {
  provider: 'mcp' | 'openai' | 'custom';
  endpoint?: string;
  model?: string;
}

export interface IGeneralConfig {
  autoCreateBranch: boolean;
  autoCommit: boolean;
  debugMode: boolean;
}

export class ConfigurationManager {
  private static readonly SECRET_KEYS = {
    JIRA_PASSWORD: 'jiraGitlabHelper.jira.password',
    JIRA_API_TOKEN: 'jiraGitlabHelper.jira.apiToken',
    GITLAB_TOKEN: 'jiraGitlabHelper.gitlab.token',
    CONFLUENCE_PASSWORD: 'jiraGitlabHelper.confluence.password',
    CONFLUENCE_API_TOKEN: 'jiraGitlabHelper.confluence.apiToken',
    AI_API_KEY: 'jiraGitlabHelper.ai.apiKey',
  };

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public getJiraConfig(): IJiraConfig {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper.jira');

    return {
      serverUrl: config.get<string>('serverUrl', ''),
      username: config.get<string>('username', ''),
      authType: config.get<'password' | 'apiToken'>('authType', 'apiToken'),
    };
  }

  public async getJiraCredential(): Promise<string> {
    const config = this.getJiraConfig();
    const secretKey =
      config.authType === 'password'
        ? ConfigurationManager.SECRET_KEYS.JIRA_PASSWORD
        : ConfigurationManager.SECRET_KEYS.JIRA_API_TOKEN;

    const credential = await this._context.secrets.get(secretKey);
    return credential ?? '';
  }

  public async setJiraCredential(value: string): Promise<void> {
    const config = this.getJiraConfig();
    const secretKey =
      config.authType === 'password'
        ? ConfigurationManager.SECRET_KEYS.JIRA_PASSWORD
        : ConfigurationManager.SECRET_KEYS.JIRA_API_TOKEN;

    await this._context.secrets.store(secretKey, value);
  }

  public getGitlabConfig(): IGitlabConfig {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper.gitlab');

    return {
      serverUrl: config.get<string>('serverUrl', ''),
      defaultProjectId: config.get<string>('defaultProjectId', ''),
      defaultTargetBranch: config.get<string>('defaultTargetBranch', 'main'),
    };
  }

  public async getGitlabToken(): Promise<string> {
    const token = await this._context.secrets.get(ConfigurationManager.SECRET_KEYS.GITLAB_TOKEN);
    return token ?? '';
  }

  public async setGitlabToken(value: string): Promise<void> {
    await this._context.secrets.store(ConfigurationManager.SECRET_KEYS.GITLAB_TOKEN, value);
  }

  public getConfluenceConfig(): IConfluenceConfig {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper.confluence');

    return {
      serverUrl: config.get<string>('serverUrl', ''),
      username: config.get<string>('username', ''),
      authType: config.get<'password' | 'apiToken'>('authType', 'apiToken'),
      enabled: config.get<boolean>('enabled', false),
    };
  }

  public async getConfluenceCredential(): Promise<string> {
    const config = this.getConfluenceConfig();
    const secretKey =
      config.authType === 'password'
        ? ConfigurationManager.SECRET_KEYS.CONFLUENCE_PASSWORD
        : ConfigurationManager.SECRET_KEYS.CONFLUENCE_API_TOKEN;

    const credential = await this._context.secrets.get(secretKey);
    return credential ?? '';
  }

  public async setConfluenceCredential(value: string): Promise<void> {
    const config = this.getConfluenceConfig();
    const secretKey =
      config.authType === 'password'
        ? ConfigurationManager.SECRET_KEYS.CONFLUENCE_PASSWORD
        : ConfigurationManager.SECRET_KEYS.CONFLUENCE_API_TOKEN;

    await this._context.secrets.store(secretKey, value);
  }

  public getAIConfig(): IAIConfig {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper.ai');

    return {
      provider: config.get<'mcp' | 'openai' | 'custom'>('provider', 'mcp'),
      endpoint: config.get<string>('endpoint'),
      model: config.get<string>('model'),
    };
  }

  public async getAIApiKey(): Promise<string> {
    const apiKey = await this._context.secrets.get(ConfigurationManager.SECRET_KEYS.AI_API_KEY);
    return apiKey ?? '';
  }

  public async setAIApiKey(value: string): Promise<void> {
    await this._context.secrets.store(ConfigurationManager.SECRET_KEYS.AI_API_KEY, value);
  }

  public getGeneralConfig(): IGeneralConfig {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper.general');

    return {
      autoCreateBranch: config.get<boolean>('autoCreateBranch', true),
      autoCommit: config.get<boolean>('autoCommit', false),
      debugMode: config.get<boolean>('debugMode', false),
    };
  }

  public async validateJiraConfig(): Promise<boolean> {
    const config = this.getJiraConfig();
    const credential = await this.getJiraCredential();

    return !!(config.serverUrl && config.username && credential);
  }

  public async validateGitlabConfig(): Promise<boolean> {
    const config = this.getGitlabConfig();
    const token = await this.getGitlabToken();

    return !!(config.serverUrl && token);
  }
}

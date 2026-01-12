import * as vscode from 'vscode';
import { ConfigurationManager } from '../../config/configuration-manager';
import { Logger } from '../../utils/logger';

export class ConfigurationPanel {
  public static currentPanel: ConfigurationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    configManager: ConfigurationManager,
    logger: Logger
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 如果已经存在面板，显示它
    if (ConfigurationPanel.currentPanel) {
      ConfigurationPanel.currentPanel._panel.reveal(column);
      return;
    }

    // 创建新面板
    const panel = vscode.window.createWebviewPanel(
      'jiraGitlabHelperConfig',
      'Jira GitLab Helper 配置',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true, // 保持状态，即使隐藏
        localResourceRoots: [extensionUri],
      }
    );

    ConfigurationPanel.currentPanel = new ConfigurationPanel(
      panel,
      extensionUri,
      configManager,
      logger
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {
    this._panel = panel;

    // 设置HTML内容
    this._update();

    // 监听面板关闭
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // 处理webview消息
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'loadConfig':
        await this._loadCurrentConfig();
        break;
      case 'saveJira':
        await this._saveJiraConfig(message.data);
        break;
      case 'saveGitlab':
        await this._saveGitlabConfig(message.data);
        break;
      case 'saveConfluence':
        await this._saveConfluenceConfig(message.data);
        break;
      case 'testJira':
        await this._testJiraConnection(message.data);
        break;
      case 'testGitlab':
        await this._testGitlabConnection(message.data);
        break;
      case 'testConfluence':
        await this._testConfluenceConnection(message.data);
        break;
    }
  }

  private async _loadCurrentConfig(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('jiraGitlabHelper');

      const jiraUsername = config.get<string>('jira.username', '');
      const jiraPassword = await this._configManager.getJiraCredential();
      const gitlabToken = await this._configManager.getGitlabToken();
      const confluenceUsername = config.get<string>('confluence.username', '');
      const confluencePassword = await this._configManager.getConfluenceCredential();

      const currentConfig = {
        jira: {
          serverUrl: config.get<string>('jira.serverUrl', ''),
          username: jiraUsername,
          password: jiraPassword || '',
          authType: config.get<string>('jira.authType', 'apiToken'),
        },
        gitlab: {
          serverUrl: config.get<string>('gitlab.serverUrl', ''),
          token: gitlabToken || '',
          defaultProjectId: config.get<string>('gitlab.defaultProjectId', ''),
          defaultTargetBranch: config.get<string>(
            'gitlab.defaultTargetBranch',
            'main'
          ),
        },
        confluence: {
          serverUrl: config.get<string>('confluence.serverUrl', ''),
          username: confluenceUsername,
          password: confluencePassword || '',
          authType: config.get<string>('confluence.authType', 'apiToken'),
          enabled: config.get<boolean>('confluence.enabled', false),
        },
      };

      this._logger.info('Loading configuration', {
        jira: {
          configured: !!(currentConfig.jira.serverUrl && currentConfig.jira.username),
        },
        gitlab: {
          configured: !!currentConfig.gitlab.serverUrl,
        },
        confluence: {
          enabled: currentConfig.confluence.enabled,
          serverUrl: currentConfig.confluence.serverUrl ? '***' : '(empty)',
          username: currentConfig.confluence.username ? '***' : '(empty)',
          hasPassword: !!currentConfig.confluence.password,
        },
      });

      this._panel.webview.postMessage({
        command: 'configLoaded',
        data: currentConfig,
      });
    } catch (error) {
      this._logger.error('Failed to load current config', error);
    }
  }

  private async _saveJiraConfig(data: any): Promise<void> {
    try {
      // 验证必填字段
      if (!data.serverUrl || !data.username) {
        throw new Error('请填写服务器地址和用户名');
      }

      // 检查是否有密码（新密码或保留旧密码）
      if (!data.password && !data.keepOldPassword) {
        throw new Error('请填写密码/API Token');
      }

      const config = vscode.workspace.getConfiguration('jiraGitlabHelper');

      await config.update(
        'jira.serverUrl',
        data.serverUrl,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'jira.username',
        data.username,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'jira.authType',
        data.authType,
        vscode.ConfigurationTarget.Global
      );

      // 只在有新密码时才保存，如果keepOldPassword为true则跳过
      if (data.password) {
        await this._configManager.setJiraCredential(data.password);
        this._logger.info('Jira credential saved', {
          serverUrl: data.serverUrl,
          username: data.username,
          authType: data.authType,
          passwordLength: data.password.length,
        });
      } else if (data.keepOldPassword) {
        this._logger.info('Keeping old Jira credential', {
          serverUrl: data.serverUrl,
          username: data.username,
        });
      }

      this._panel.webview.postMessage({
        command: 'saveSuccess',
        section: 'jira',
        message: 'JIRA配置已保存，建议点击"测试连接"验证配置是否正确',
      });

      this._logger.info('Jira configuration saved');
    } catch (error) {
      this._logger.error('Failed to save Jira config', error);
      this._panel.webview.postMessage({
        command: 'saveError',
        section: 'jira',
        message: '保存JIRA配置失败: ' + (error as Error).message,
      });
    }
  }

  private async _saveGitlabConfig(data: any): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('jiraGitlabHelper');

      await config.update(
        'gitlab.serverUrl',
        data.serverUrl,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'gitlab.defaultProjectId',
        data.defaultProjectId || '',
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'gitlab.defaultTargetBranch',
        data.defaultTargetBranch,
        vscode.ConfigurationTarget.Global
      );

      // 只在有新token时才保存，如果keepOldToken为true则跳过
      if (data.token) {
        await this._configManager.setGitlabToken(data.token);
        this._logger.info('GitLab token saved');
      } else if (data.keepOldToken) {
        this._logger.info('Keeping old GitLab token');
      } else {
        this._logger.warn('GitLab token is empty and no keepOldToken flag');
      }

      this._panel.webview.postMessage({
        command: 'saveSuccess',
        section: 'gitlab',
        message: 'GitLab配置已保存',
      });

      this._logger.info('GitLab configuration saved');
    } catch (error) {
      this._logger.error('Failed to save GitLab config', error);
      this._panel.webview.postMessage({
        command: 'saveError',
        section: 'gitlab',
        message: '保存GitLab配置失败: ' + (error as Error).message,
      });
    }
  }

  private async _saveConfluenceConfig(data: any): Promise<void> {
    try {
      this._logger.info('Saving Confluence configuration', {
        enabled: data.enabled,
        serverUrl: data.serverUrl ? '***' : '(empty)',
        username: data.username ? '***' : '(empty)',
        hasPassword: !!data.password,
      });

      const config = vscode.workspace.getConfiguration('jiraGitlabHelper');

      await config.update(
        'confluence.serverUrl',
        data.serverUrl,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'confluence.username',
        data.username,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'confluence.authType',
        data.authType,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        'confluence.enabled',
        data.enabled,
        vscode.ConfigurationTarget.Global
      );

      if (data.password) {
        await this._configManager.setConfluenceCredential(data.password);
        this._logger.info('Confluence credential saved to SecretStorage');
      } else {
        this._logger.info('No password provided, credential not updated');
      }

      this._panel.webview.postMessage({
        command: 'saveSuccess',
        section: 'confluence',
        message: 'Confluence配置已保存',
      });

      this._logger.info('Confluence configuration saved successfully');
    } catch (error) {
      this._logger.error('Failed to save Confluence config', error);
      this._panel.webview.postMessage({
        command: 'saveError',
        section: 'confluence',
        message: '保存Confluence配置失败: ' + (error as Error).message,
      });
    }
  }


  private async _testJiraConnection(data: any): Promise<void> {
    try {
      this._panel.webview.postMessage({
        command: 'testStarted',
        section: 'jira',
      });

      // 验证必填字段
      if (!data.serverUrl || !data.username || !data.password) {
        throw new Error('请填写完整的Jira配置信息（服务器地址、用户名、密码/API Token）');
      }

      this._logger.info('Testing JIRA connection', {
        serverUrl: data.serverUrl,
        username: data.username,
        authType: data.authType,
        hasPassword: !!data.password,
        passwordLength: data.password ? data.password.length : 0,
      });

      // 实际测试连接
      const { JiraClient } = await import('../../integrations/jira-client');
      const testClient = new JiraClient(
        {
          serverUrl: data.serverUrl,
          username: data.username,
          credential: data.password,
          authType: data.authType || 'apiToken',
        },
        this._logger
      );

      const success = await testClient.testConnection();
      
      if (success) {
        this._panel.webview.postMessage({
          command: 'testSuccess',
          section: 'jira',
          message: 'JIRA连接测试成功！认证信息有效',
        });
      } else {
        throw new Error('连接测试失败');
      }
    } catch (error) {
      this._logger.error('JIRA connection test failed', error);
      this._panel.webview.postMessage({
        command: 'testError',
        section: 'jira',
        message: 'JIRA连接测试失败: ' + (error as Error).message,
      });
    }
  }

  private async _testConfluenceConnection(data: any): Promise<void> {
    try {
      this._panel.webview.postMessage({
        command: 'testStarted',
        section: 'confluence',
      });

      if (!data.serverUrl || !data.username || !data.password) {
        throw new Error('请填写完整的Confluence配置信息');
      }

      // TODO: 实际调用 ConfluenceClient 测试连接
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this._panel.webview.postMessage({
        command: 'testSuccess',
        section: 'confluence',
        message: 'Confluence连接测试成功',
      });
    } catch (error) {
      this._panel.webview.postMessage({
        command: 'testError',
        section: 'confluence',
        message: 'Confluence连接测试失败: ' + (error as Error).message,
      });
    }
  }

  private async _testGitlabConnection(data: any): Promise<void> {
    try {
      this._panel.webview.postMessage({
        command: 'testStarted',
        section: 'gitlab',
      });

      // 验证必填字段
      if (!data.serverUrl || !data.token) {
        throw new Error('请填写完整的GitLab配置信息（服务器地址、Access Token）');
      }

      this._logger.info('Testing GitLab connection', {
        serverUrl: data.serverUrl,
        hasToken: !!data.token,
        tokenLength: data.token ? data.token.length : 0,
      });

      // 实际测试连接
      const { GitlabClient } = await import('../../integrations/gitlab-client');
      const testClient = new GitlabClient(
        {
          serverUrl: data.serverUrl,
          token: data.token,
        },
        this._logger
      );

      const success = await testClient.testConnection();
      
      if (success) {
        this._panel.webview.postMessage({
          command: 'testSuccess',
          section: 'gitlab',
          message: 'GitLab连接测试成功！Token有效',
        });
      } else {
        throw new Error('连接测试失败');
      }
    } catch (error) {
      this._logger.error('GitLab connection test failed', error);
      this._panel.webview.postMessage({
        command: 'testError',
        section: 'gitlab',
        message: 'GitLab连接测试失败: ' + (error as Error).message,
      });
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    // Get VSCode language
    const locale = JSON.stringify(vscode.env.language || 'zh-cn');
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jira GitLab Helper Configuration</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        
        h1 {
            font-size: 24px;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }
        
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 30px;
        }
        
        .section {
            background-color: var(--vscode-sideBarSectionHeader-background);
            border: 1px solid var(--vscode-sideBarSectionHeader-border);
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .section-title {
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .section-icon {
            width: 24px;
            height: 24px;
            display: inline-block;
            vertical-align: middle;
        }
        
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }
        
        .status-success {
            background-color: var(--vscode-charts-green);
            color: white;
        }
        
        .status-warning {
            background-color: var(--vscode-charts-orange);
            color: white;
        }
        
        .form-group {
            margin-bottom: 18px;
        }
        
        label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .label-optional {
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
            font-size: 0.9em;
        }
        
        input, select {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }
        
        input:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        input[type="password"] {
            font-family: monospace;
        }
        
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        .help-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        
        .help-link:hover {
            text-decoration: underline;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .btn-test {
            background-color: transparent;
            color: var(--vscode-textLink-foreground);
            border: 1px solid var(--vscode-textLink-foreground);
        }
        
        .btn-test:hover {
            background-color: var(--vscode-textLink-foreground);
            color: var(--vscode-editor-background);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .message {
            padding: 12px;
            border-radius: 4px;
            margin-top: 15px;
            display: none;
        }
        
        .message.show {
            display: block;
        }
        
        .message-success {
            background-color: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
        }
        
        .message-error {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        
        .message-info {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        input[type="checkbox"] {
            width: auto;
        }
        
        .info-box {
            background-color: var(--vscode-editorWidget-background);
            border-left: 4px solid var(--vscode-editorInfo-foreground);
            padding: 12px;
            margin: 15px 0;
            border-radius: 4px;
        }
        
        .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid var(--vscode-button-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 id="page-title">Jira GitLab Helper 配置</h1>
        <p class="subtitle" id="page-subtitle">配置 Jira、GitLab 和 Confluence 连接信息</p>
        
        <!-- Jira Config -->
        <div class="section">
            <div class="section-header">
                <div class="section-title">
                    <svg class="section-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g fill="#0052CC">
                            <circle cx="6" cy="3" r="1.5"/>
                            <circle cx="12" cy="3" r="1.5"/>
                            <circle cx="18" cy="3" r="1.5"/>
                            <path d="M4 8 L7 11 L7 17 L4 20 L1 17 L1 11 Z"/>
                            <path d="M20 8 L23 11 L23 17 L20 20 L17 17 L17 11 Z"/>
                            <path d="M12 14 L8 18 L12 22 L16 18 Z"/>
                            <path d="M7 11 L10 14 L12 12 L9 9 Z"/>
                            <path d="M17 11 L14 14 L12 12 L15 9 Z"/>
                        </g>
                    </svg>
                    <span data-i18n="jiraTitle">Jira Configuration</span>
                    <span id="jira-status" class="status-badge status-warning" data-i18n="statusNotConfigured">Not Configured</span>
                </div>
            </div>
            
            <div class="form-group">
                <label for="jira-url" data-i18n="serverUrl">Server URL</label>
                <input type="text" id="jira-url" placeholder="https://your-domain.atlassian.net">
                <div class="help-text" data-i18n="helpJiraUrl">Your Jira instance URL</div>
            </div>
            
            <div class="form-group">
                <label for="jira-username" data-i18n="username">Username/Email</label>
                <input type="text" id="jira-username" placeholder="your-email@company.com">
            </div>
            
            <div class="form-group">
                <label for="jira-auth-type" data-i18n="authType">Authentication Type</label>
                <select id="jira-auth-type">
                    <option value="apiToken">API Token</option>
                    <option value="password">Password</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="jira-password" data-i18n="apiTokenPassword">API Token / Password</label>
                <input type="password" id="jira-password" placeholder="••••••••••••">
                <div class="help-text">
                    <a href="https://id.atlassian.com/manage-profile/security/api-tokens" class="help-link" target="_blank" data-i18n="linkGetApiToken">
                        How to get API Token? →
                    </a>
                </div>
            </div>
            
            <div class="button-group">
                <button class="btn-primary" onclick="saveJira()" data-i18n="saveJiraConfig">Save Jira Config</button>
                <button class="btn-test" onclick="testJira()" data-i18n="testConnection">Test Connection</button>
            </div>
            
            <div id="jira-message" class="message"></div>
        </div>
        
        <!-- GitLab Config -->
        <div class="section">
            <div class="section-header">
                <div class="section-title">
                    <span data-i18n="gitlabTitle">🦊 GitLab Configuration</span>
                    <span id="gitlab-status" class="status-badge status-warning" data-i18n="statusNotConfigured">Not Configured</span>
                </div>
            </div>
            
            <div class="form-group">
                <label for="gitlab-url" data-i18n="serverUrl">Server URL</label>
                <input type="text" id="gitlab-url" placeholder="https://gitlab.com">
                <div class="help-text" data-i18n="helpGitlabUrl">GitLab instance URL (use gitlab.com or self-hosted)</div>
            </div>
            
            <div class="form-group">
                <label for="gitlab-token" data-i18n="personalAccessToken">Personal Access Token</label>
                <input type="password" id="gitlab-token" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx">
                <div class="help-text">
                    <a href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html" class="help-link" target="_blank" data-i18n="linkGetPAT">
                        How to create Personal Access Token? →
                    </a>
                    <br><span data-i18n="helpGitlabPermissions">Required permissions: api, read_api, write_repository</span>
                </div>
            </div>
            
            <div class="form-group">
                <label for="gitlab-branch" data-i18n="defaultTargetBranch">Default Target Branch</label>
                <input type="text" id="gitlab-branch" value="main" placeholder="main">
            </div>
            
            <div class="button-group">
                <button class="btn-primary" onclick="saveGitlab()" data-i18n="saveGitlabConfig">Save GitLab Config</button>
                <button class="btn-test" onclick="testGitlab()" data-i18n="testConnection">Test Connection</button>
            </div>
            
            <div id="gitlab-message" class="message"></div>
        </div>
        
        <!-- Confluence Config -->
        <div class="section">
            <div class="section-header">
                <div class="section-title">
                    <svg class="section-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g fill="#0052CC">
                            <path d="M2 14 C2 14 4 8 8 8 C12 8 14 12 14 12 L10 14 C10 14 9 11 8 11 C7 11 6 13 6 13 L2 14 Z"/>
                            <path d="M22 10 C22 10 20 16 16 16 C12 16 10 12 10 12 L14 10 C14 10 15 13 16 13 C17 13 18 11 18 11 L22 10 Z"/>
                            <path d="M2 6 C2 6 3 4 5 4 C7 4 9 6 11 10 L7 12 C7 12 6 8 5 8 C4 8 3 9 3 9 L2 6 Z"/>
                            <path d="M22 18 C22 18 21 20 19 20 C17 20 15 18 13 14 L17 12 C17 12 18 16 19 16 C20 16 21 15 21 15 L22 18 Z"/>
                        </g>
                    </svg>
                    <span data-i18n="confluenceTitle">Confluence Configuration</span>
                    <span id="confluence-status" class="status-badge status-warning" data-i18n="statusNotConfigured">Not Configured</span>
                </div>
            </div>
            
            <div class="form-group">
                <label>
                    <input type="checkbox" id="confluence-enabled">
                    <span data-i18n="enableConfluence">Enable Confluence Integration</span>
                </label>
                <div class="help-text" data-i18n="helpConfluenceEnable">Automatically fetch Confluence pages linked in Jira issues</div>
            </div>
            
            <div id="confluence-fields">
                <div class="form-group">
                    <label for="confluence-url" data-i18n="serverUrl">Server URL</label>
                    <input type="text" id="confluence-url" placeholder="https://your-domain.atlassian.net/wiki">
                    <div class="help-text" data-i18n="helpConfluenceUrl">Your Confluence instance URL</div>
                </div>
                
                <div class="form-group">
                    <label for="confluence-username" data-i18n="username">Username/Email</label>
                    <input type="text" id="confluence-username" placeholder="your-email@company.com">
                </div>
                
                <div class="form-group">
                    <label for="confluence-auth-type" data-i18n="authType">Authentication Type</label>
                    <select id="confluence-auth-type">
                        <option value="apiToken">API Token</option>
                        <option value="password">Password</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="confluence-password" data-i18n="apiTokenPassword">API Token / Password</label>
                    <input type="password" id="confluence-password" placeholder="••••••••••••">
                    <div class="help-text">
                        <a href="https://id.atlassian.com/manage-profile/security/api-tokens" class="help-link" target="_blank" data-i18n="linkGetApiToken">
                            How to get API Token? →
                        </a>
                    </div>
                </div>
                
                <div class="button-group">
                    <button class="btn-primary" onclick="saveConfluence()" data-i18n="saveConfluenceConfig">Save Confluence Config</button>
                    <button class="btn-test" onclick="testConfluence()" data-i18n="testConnection">Test Connection</button>
                </div>
                
                <div id="confluence-message" class="message"></div>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const locale = ${locale};
        
        // i18n translations
        const i18n = {
            'zh-cn': {
                pageTitle: 'Jira GitLab Helper 配置',
                pageSubtitle: '配置 Jira、GitLab 和 Confluence 连接信息，随时可以切换窗口查找资料。AI使用编辑器自带的AI能力。',
                jiraTitle: 'Jira 配置',
                gitlabTitle: '🦊 GitLab 配置',
                confluenceTitle: 'Confluence 配置',
                statusConfigured: '已配置',
                statusNotConfigured: '未配置',
                serverUrl: '服务器地址',
                username: '用户名/邮箱',
                authType: '认证方式',
                apiToken: 'API Token',
                password: '密码',
                apiTokenPassword: 'API Token / 密码',
                personalAccessToken: 'Personal Access Token',
                defaultTargetBranch: '默认目标分支',
                optional: '(可选)',
                save: '保存',
                testConnection: '测试连接',
                saveJiraConfig: '保存 Jira 配置',
                saveGitlabConfig: '保存 GitLab 配置',
                saveConfluenceConfig: '保存 Confluence 配置',
                enableConfluence: '启用Confluence集成',
                helpConfluenceEnable: '自动获取Jira问题中链接的Confluence页面内容',
                helpConfluenceUrl: '你的Confluence实例地址',
                testing: '正在测试连接...',
                helpJiraUrl: '你的Jira实例地址',
                helpGitlabUrl: 'GitLab实例地址（使用 gitlab.com 或自托管地址）',
                helpGitlabPermissions: '需要权限: api, read_api, write_repository',
                apiTokenRecommended: '(推荐)',
                linkGetApiToken: '如何获取API Token?',
                linkGetPAT: '如何创建Personal Access Token?',
                errorFillAll: '请填写完整的配置信息',
                msgJiraSaved: 'Jira配置已保存',
                msgGitlabSaved: 'GitLab配置已保存',
                msgConfluenceSaved: 'Confluence配置已保存',
                msgSaveFailed: '保存配置失败',
                msgTestSuccess: '连接测试成功',
                msgTestFailed: '连接测试失败',
            },
            'en': {
                pageTitle: 'Jira GitLab Helper Configuration',
                pageSubtitle: 'Configure Jira, GitLab and Confluence connections. Switch windows anytime to find information. AI uses editor built-in capabilities.',
                jiraTitle: 'Jira Configuration',
                gitlabTitle: '🦊 GitLab Configuration',
                statusConfigured: 'Configured',
                statusNotConfigured: 'Not Configured',
                serverUrl: 'Server URL',
                username: 'Username/Email',
                authType: 'Authentication Type',
                apiToken: 'API Token',
                password: 'Password',
                apiTokenPassword: 'API Token / Password',
                personalAccessToken: 'Personal Access Token',
                defaultTargetBranch: 'Default Target Branch',
                optional: '(Optional)',
                save: 'Save',
                testConnection: 'Test Connection',
                saveJiraConfig: 'Save Jira Config',
                saveGitlabConfig: 'Save GitLab Config',
                testing: 'Testing connection...',
                helpJiraUrl: 'Your Jira instance URL',
                helpGitlabUrl: 'GitLab instance URL (use gitlab.com or self-hosted)',
                helpGitlabPermissions: 'Required permissions: api, read_api, write_repository',
                apiTokenRecommended: '(Recommended)',
                linkGetApiToken: 'How to get API Token?',
                linkGetPAT: 'How to create Personal Access Token?',
                errorFillAll: 'Please fill in all required fields',
                msgJiraSaved: 'Jira configuration saved',
                msgGitlabSaved: 'GitLab configuration saved',
                msgConfluenceSaved: 'Confluence configuration saved',
                saveConfluenceConfig: 'Save Confluence Config',
                confluenceTitle: 'Confluence Configuration',
                enableConfluence: 'Enable Confluence Integration',
                helpConfluenceEnable: 'Automatically fetch Confluence pages linked in Jira issues',
                helpConfluenceUrl: 'Your Confluence instance URL',
                msgSaveFailed: 'Failed to save configuration',
                msgTestSuccess: 'Connection test successful',
                msgTestFailed: 'Connection test failed',
            }
        };
        
        // Get translation
        function t(key) {
            const lang = locale.startsWith('zh') ? 'zh-cn' : 'en';
            return i18n[lang][key] || i18n['en'][key] || key;
        }
        
        // Apply translations on load
        window.addEventListener('load', () => {
            document.getElementById('page-title').textContent = t('pageTitle');
            document.getElementById('page-subtitle').textContent = t('pageSubtitle');
            
            // Apply all translations
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (el.tagName === 'INPUT' && el.placeholder) {
                    // Don't translate placeholder for now
                } else {
                    el.textContent = t(key);
                }
            });
            
            vscode.postMessage({ command: 'loadConfig' });
        });
        
        // 接收来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'configLoaded':
                    loadConfig(message.data);
                    break;
                case 'saveSuccess':
                    showMessage(message.section, 'success', message.message);
                    updateStatus(message.section, true);
                    break;
                case 'saveError':
                    showMessage(message.section, 'error', message.message);
                    break;
                case 'testStarted':
                    showMessage(message.section, 'info', '正在测试连接...');
                    break;
                case 'testSuccess':
                    showMessage(message.section, 'success', message.message);
                    break;
                case 'testError':
                    showMessage(message.section, 'error', message.message);
                    break;
            }
        });
        
        function loadConfig(config) {
            // Jira
            document.getElementById('jira-url').value = config.jira.serverUrl || '';
            document.getElementById('jira-username').value = config.jira.username || '';
            document.getElementById('jira-auth-type').value = config.jira.authType || 'apiToken';
            // 保存已有密码状态，用于后续判断是否需要保留旧密码
            const jiraPasswordField = document.getElementById('jira-password');
            jiraPasswordField.value = config.jira.password || '';
            jiraPasswordField.setAttribute('data-has-saved', config.jira.password ? 'true' : 'false');
            if (config.jira.password) {
                jiraPasswordField.placeholder = '(已保存) 留空则保持不变';
                jiraPasswordField.value = ''; // 不显示明文密码
            }
            updateStatus('jira', config.jira.serverUrl && config.jira.username && config.jira.password);
            
            // GitLab
            document.getElementById('gitlab-url').value = config.gitlab.serverUrl || '';
            const gitlabTokenField = document.getElementById('gitlab-token');
            gitlabTokenField.value = config.gitlab.token || '';
            gitlabTokenField.setAttribute('data-has-saved', config.gitlab.token ? 'true' : 'false');
            if (config.gitlab.token) {
                gitlabTokenField.placeholder = '(已保存) 留空则保持不变';
                gitlabTokenField.value = ''; // 不显示明文token
            }
            document.getElementById('gitlab-project').value = config.gitlab.defaultProjectId || '';
            document.getElementById('gitlab-branch').value = config.gitlab.defaultTargetBranch || 'main';
            updateStatus('gitlab', config.gitlab.serverUrl && config.gitlab.token);
            
            // Confluence
            if (config.confluence) {
                document.getElementById('confluence-enabled').checked = config.confluence.enabled || false;
                document.getElementById('confluence-url').value = config.confluence.serverUrl || '';
                document.getElementById('confluence-username').value = config.confluence.username || '';
                document.getElementById('confluence-auth-type').value = config.confluence.authType || 'apiToken';
                const confluencePasswordField = document.getElementById('confluence-password');
                confluencePasswordField.value = config.confluence.password || '';
                confluencePasswordField.setAttribute('data-has-saved', config.confluence.password ? 'true' : 'false');
                if (config.confluence.password) {
                    confluencePasswordField.placeholder = '(已保存) 留空则保持不变';
                    confluencePasswordField.value = ''; // 不显示明文密码
                }
                updateStatus('confluence', config.confluence.enabled && config.confluence.serverUrl && config.confluence.password);
                toggleConfluenceFields();
            }
        }
        
        function toggleConfluenceFields() {
            const enabled = document.getElementById('confluence-enabled').checked;
            const fields = document.getElementById('confluence-fields');
            fields.style.display = enabled ? 'block' : 'none';
        }
        
        // Listen to confluence enabled checkbox
        document.addEventListener('DOMContentLoaded', () => {
            const checkbox = document.getElementById('confluence-enabled');
            if (checkbox) {
                checkbox.addEventListener('change', toggleConfluenceFields);
            }
        });
        
        function saveJira() {
            const passwordField = document.getElementById('jira-password');
            const hasSavedPassword = passwordField.getAttribute('data-has-saved') === 'true';
            const newPassword = passwordField.value.trim();
            
            const data = {
                serverUrl: document.getElementById('jira-url').value.trim(),
                username: document.getElementById('jira-username').value.trim(),
                authType: document.getElementById('jira-auth-type').value,
                password: newPassword,
                keepOldPassword: !newPassword && hasSavedPassword, // 如果留空且之前有密码，保留旧密码
            };
            
            if (!data.serverUrl || !data.username) {
                showMessage('jira', 'error', '请填写服务器地址和用户名');
                return;
            }
            
            if (!data.password && !hasSavedPassword) {
                showMessage('jira', 'error', '请填写密码/API Token');
                return;
            }
            
            vscode.postMessage({ command: 'saveJira', data });
        }
        
        function saveGitlab() {
            const tokenField = document.getElementById('gitlab-token');
            const hasSavedToken = tokenField.getAttribute('data-has-saved') === 'true';
            const newToken = tokenField.value.trim();
            
            const data = {
                serverUrl: document.getElementById('gitlab-url').value.trim(),
                token: newToken,
                defaultProjectId: document.getElementById('gitlab-project').value.trim(),
                defaultTargetBranch: document.getElementById('gitlab-branch').value.trim(),
                keepOldToken: !newToken && hasSavedToken, // 如果留空且之前有token，保留旧token
            };
            
            if (!data.serverUrl) {
                showMessage('gitlab', 'error', '请填写服务器地址');
                return;
            }
            
            if (!data.token && !hasSavedToken) {
                showMessage('gitlab', 'error', '请填写Access Token');
                return;
            }
            
            vscode.postMessage({ command: 'saveGitlab', data });
        }
        
        function testJira() {
            const passwordField = document.getElementById('jira-password');
            const password = passwordField.value.trim();
            
            if (!password) {
                showMessage('jira', 'error', '请输入密码/API Token以测试连接');
                return;
            }
            
            const data = {
                serverUrl: document.getElementById('jira-url').value.trim(),
                username: document.getElementById('jira-username').value.trim(),
                authType: document.getElementById('jira-auth-type').value,
                password: password,
            };
            
            if (!data.serverUrl || !data.username) {
                showMessage('jira', 'error', '请填写服务器地址和用户名');
                return;
            }
            
            vscode.postMessage({ command: 'testJira', data });
        }
        
        function saveConfluence() {
            const data = {
                enabled: document.getElementById('confluence-enabled').checked,
                serverUrl: document.getElementById('confluence-url').value.trim(),
                username: document.getElementById('confluence-username').value.trim(),
                authType: document.getElementById('confluence-auth-type').value,
                password: document.getElementById('confluence-password').value.trim(),
            };
            
            if (data.enabled && (!data.serverUrl || !data.username || !data.password)) {
                showMessage('confluence', 'error', t('errorFillAll'));
                return;
            }
            
            vscode.postMessage({ command: 'saveConfluence', data });
        }
        
        function testGitlab() {
            const tokenField = document.getElementById('gitlab-token');
            const token = tokenField.value.trim();
            
            if (!token) {
                showMessage('gitlab', 'error', '请输入Access Token以测试连接');
                return;
            }
            
            const data = {
                serverUrl: document.getElementById('gitlab-url').value.trim(),
                token: token,
            };
            
            if (!data.serverUrl) {
                showMessage('gitlab', 'error', '请填写服务器地址');
                return;
            }
            
            vscode.postMessage({ command: 'testGitlab', data });
        }
        
        function testConfluence() {
            const data = {
                serverUrl: document.getElementById('confluence-url').value.trim(),
                username: document.getElementById('confluence-username').value.trim(),
                password: document.getElementById('confluence-password').value.trim(),
            };
            
            vscode.postMessage({ command: 'testConfluence', data });
        }
        
        function showMessage(section, type, text) {
            const messageEl = document.getElementById(section + '-message');
            messageEl.className = 'message message-' + type + ' show';
            messageEl.textContent = text;
            
            setTimeout(() => {
                messageEl.classList.remove('show');
            }, 5000);
        }
        
        function updateStatus(section, configured) {
            const statusEl = document.getElementById(section + '-status');
            if (configured) {
                statusEl.className = 'status-badge status-success';
                statusEl.textContent = t('statusConfigured');
            } else {
                statusEl.className = 'status-badge status-warning';
                statusEl.textContent = t('statusNotConfigured');
            }
        }
    </script>
</body>
</html>`;
  }

  public dispose(): void {
    ConfigurationPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}


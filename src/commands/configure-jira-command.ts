import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';

export class ConfigureJiraCommand {
  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<void> {
    try {
      this._logger.info('Starting JIRA configuration...');

      // Step 1: Server URL
      const serverUrl = await this.promptForServerUrl();
      if (!serverUrl) {
        this._logger.info('JIRA configuration cancelled by user');
        return;
      }

      // Step 2: Username
      const username = await this.promptForUsername();
      if (!username) {
        this._logger.info('JIRA configuration cancelled by user');
        return;
      }

      // Step 3: Auth Type
      const authType = await this.promptForAuthType();
      if (!authType) {
        this._logger.info('JIRA configuration cancelled by user');
        return;
      }

      // Step 4: Credential
      const credential = await this.promptForCredential(authType);
      if (!credential) {
        this._logger.info('JIRA configuration cancelled by user');
        return;
      }

      // Save configuration
      const config = vscode.workspace.getConfiguration('jiraGitlabHelper.jira');
      await config.update('serverUrl', serverUrl, vscode.ConfigurationTarget.Global);
      await config.update('username', username, vscode.ConfigurationTarget.Global);
      await config.update('authType', authType, vscode.ConfigurationTarget.Global);
      await this._configManager.setJiraCredential(credential);

      // Validate configuration
      const isValid = await this.validateConfiguration(serverUrl, username, credential, authType);

      if (isValid) {
        void vscode.window.showInformationMessage('JIRA配置已保存并验证成功!');
        this._logger.info('JIRA configuration saved and validated successfully');
      } else {
        void vscode.window.showWarningMessage(
          'JIRA配置已保存,但连接验证失败。请检查配置是否正确。'
        );
        this._logger.warn('JIRA configuration saved but validation failed');
      }
    } catch (error) {
      this._logger.error('Failed to configure JIRA', error);
      void vscode.window.showErrorMessage(`配置JIRA失败: ${String(error)}`);
    }
  }

  private async promptForServerUrl(): Promise<string | undefined> {
    const currentUrl = this._configManager.getJiraConfig().serverUrl;

    return await vscode.window.showInputBox({
      prompt: '请输入JIRA服务器地址',
      placeHolder: 'https://your-company.atlassian.net',
      value: currentUrl,
      validateInput: (value) => {
        if (!value) {
          return 'JIRA服务器地址不能为空';
        }
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return '请输入有效的URL (http:// 或 https://)';
        }
        return null;
      },
    });
  }

  private async promptForUsername(): Promise<string | undefined> {
    const currentUsername = this._configManager.getJiraConfig().username;

    return await vscode.window.showInputBox({
      prompt: '请输入JIRA用户名',
      placeHolder: 'your.name@company.com',
      value: currentUsername,
      validateInput: (value) => {
        if (!value) {
          return 'JIRA用户名不能为空';
        }
        return null;
      },
    });
  }

  private async promptForAuthType(): Promise<'password' | 'apiToken' | undefined> {
    const result = await vscode.window.showQuickPick(
      [
        {
          label: 'API Token',
          description: '推荐使用API Token (更安全)',
          value: 'apiToken' as const,
        },
        {
          label: '密码',
          description: '使用账号密码',
          value: 'password' as const,
        },
      ],
      {
        placeHolder: '选择JIRA认证方式',
      }
    );

    return result?.value;
  }

  private async promptForCredential(
    authType: 'password' | 'apiToken'
  ): Promise<string | undefined> {
    const prompt =
      authType === 'apiToken' ? '请输入JIRA API Token (从JIRA个人设置中生成)' : '请输入JIRA密码';

    return await vscode.window.showInputBox({
      prompt,
      password: true,
      validateInput: (value) => {
        if (!value) {
          return '凭据不能为空';
        }
        return null;
      },
    });
  }

  private async validateConfiguration(
    _serverUrl: string,
    _username: string,
    _credential: string,
    _authType: 'password' | 'apiToken'
  ): Promise<boolean> {
    // TODO: Implement actual JIRA API validation
    // For now, just return true
    // This will be implemented when JIRA client is added
    return true;
  }
}

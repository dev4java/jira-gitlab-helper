import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';

export class ConfigureGitlabCommand {
  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<void> {
    try {
      this._logger.info('Starting GitLab configuration...');

      // Step 1: Server URL
      const serverUrl = await this.promptForServerUrl();
      if (!serverUrl) {
        this._logger.info('GitLab configuration cancelled by user');
        return;
      }

      // Step 2: Personal Access Token
      const token = await this.promptForToken();
      if (!token) {
        this._logger.info('GitLab configuration cancelled by user');
        return;
      }

      // Step 3: Default Project ID (optional)
      const projectId = await this.promptForProjectId();

      // Step 4: Default Target Branch
      const targetBranch = await this.promptForTargetBranch();

      // Save configuration
      const config = vscode.workspace.getConfiguration('jiraGitlabHelper.gitlab');
      await config.update('serverUrl', serverUrl, vscode.ConfigurationTarget.Global);
      if (projectId) {
        await config.update('defaultProjectId', projectId, vscode.ConfigurationTarget.Global);
      }
      if (targetBranch) {
        await config.update('defaultTargetBranch', targetBranch, vscode.ConfigurationTarget.Global);
      }
      await this._configManager.setGitlabToken(token);

      // Validate configuration
      const isValid = await this.validateConfiguration(serverUrl, token);

      if (isValid) {
        void vscode.window.showInformationMessage('GitLab配置已保存并验证成功!');
        this._logger.info('GitLab configuration saved and validated successfully');
      } else {
        void vscode.window.showWarningMessage(
          'GitLab配置已保存,但连接验证失败。请检查配置是否正确。'
        );
        this._logger.warn('GitLab configuration saved but validation failed');
      }
    } catch (error) {
      this._logger.error('Failed to configure GitLab', error);
      void vscode.window.showErrorMessage(`配置GitLab失败: ${String(error)}`);
    }
  }

  private async promptForServerUrl(): Promise<string | undefined> {
    const currentUrl = this._configManager.getGitlabConfig().serverUrl;

    return await vscode.window.showInputBox({
      prompt: '请输入GitLab服务器地址',
      placeHolder: 'https://gitlab.com',
      value: currentUrl || 'https://gitlab.com',
      validateInput: (value) => {
        if (!value) {
          return 'GitLab服务器地址不能为空';
        }
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return '请输入有效的URL (http:// 或 https://)';
        }
        return null;
      },
    });
  }

  private async promptForToken(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: '请输入GitLab Personal Access Token',
      placeHolder: 'glpat-xxxxxxxxxxxxxxxxxxxx',
      password: true,
      validateInput: (value) => {
        if (!value) {
          return 'Personal Access Token不能为空';
        }
        return null;
      },
    });
  }

  private async promptForProjectId(): Promise<string | undefined> {
    const currentProjectId = this._configManager.getGitlabConfig().defaultProjectId;

    return await vscode.window.showInputBox({
      prompt: '请输入默认GitLab项目ID (可选,可以后续指定)',
      placeHolder: '12345',
      value: currentProjectId,
      validateInput: (value) => {
        if (value && !/^\d+$/.test(value)) {
          return '项目ID必须是数字';
        }
        return null;
      },
    });
  }

  private async promptForTargetBranch(): Promise<string | undefined> {
    const currentBranch = this._configManager.getGitlabConfig().defaultTargetBranch;

    return await vscode.window.showInputBox({
      prompt: '请输入默认目标分支',
      placeHolder: 'main',
      value: currentBranch || 'main',
    });
  }

  private async validateConfiguration(_serverUrl: string, _token: string): Promise<boolean> {
    // TODO: Implement actual GitLab API validation
    // For now, just return true
    // This will be implemented when GitLab client is added
    return true;
  }
}

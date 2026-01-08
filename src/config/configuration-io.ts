import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Logger } from '../utils/logger';

export interface IExportableConfig {
  jira?: {
    serverUrl: string;
    username: string;
    authType: 'password' | 'apiToken';
  };
  gitlab?: {
    serverUrl: string;
    defaultProjectId?: string;
    defaultTargetBranch: string;
  };
  ai?: {
    provider: 'mcp' | 'openai' | 'custom';
    endpoint?: string;
    model?: string;
  };
  general?: {
    autoCreateBranch: boolean;
    autoCommit: boolean;
  };
}

export class ConfigurationIO {
  constructor(private readonly _logger: Logger) {}

  public async exportConfiguration(): Promise<void> {
    try {
      // Get current configuration (excluding secrets)
      const config = this.getCurrentConfig();

      // Prompt for export location
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('jira-gitlab-helper-config.json'),
        filters: {
          'JSON files': ['json'],
          'All files': ['*'],
        },
      });

      if (!uri) {
        this._logger.info('Configuration export cancelled by user');
        return;
      }

      // Write configuration to file
      await fs.writeFile(uri.fsPath, JSON.stringify(config, null, 2), 'utf-8');

      void vscode.window.showInformationMessage(`配置已导出到: ${uri.fsPath}`);
      this._logger.info(`Configuration exported to: ${uri.fsPath}`);
    } catch (error) {
      this._logger.error('Failed to export configuration', error);
      void vscode.window.showErrorMessage(`导出配置失败: ${String(error)}`);
    }
  }

  public async importConfiguration(): Promise<void> {
    try {
      // Prompt for import file
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          'JSON files': ['json'],
          'All files': ['*'],
        },
      });

      if (!uris || uris.length === 0) {
        this._logger.info('Configuration import cancelled by user');
        return;
      }

      const uri = uris[0];

      // Read configuration file
      const content = await fs.readFile(uri.fsPath, 'utf-8');
      const config: IExportableConfig = JSON.parse(content);

      // Validate configuration
      if (!this.validateImportedConfig(config)) {
        throw new Error('Invalid configuration file format');
      }

      // Apply configuration
      await this.applyConfig(config);

      void vscode.window.showInformationMessage('配置已导入成功! 请输入JIRA和GitLab的凭据。');
      this._logger.info(`Configuration imported from: ${uri.fsPath}`);
    } catch (error) {
      this._logger.error('Failed to import configuration', error);
      void vscode.window.showErrorMessage(`导入配置失败: ${String(error)}`);
    }
  }

  private getCurrentConfig(): IExportableConfig {
    const config: IExportableConfig = {};

    // JIRA configuration
    const jiraConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.jira');
    const serverUrl = jiraConfig.get<string>('serverUrl');
    if (serverUrl) {
      config.jira = {
        serverUrl,
        username: jiraConfig.get<string>('username', ''),
        authType: jiraConfig.get<'password' | 'apiToken'>('authType', 'apiToken'),
      };
    }

    // GitLab configuration
    const gitlabConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.gitlab');
    const gitlabUrl = gitlabConfig.get<string>('serverUrl');
    if (gitlabUrl) {
      config.gitlab = {
        serverUrl: gitlabUrl,
        defaultProjectId: gitlabConfig.get<string>('defaultProjectId'),
        defaultTargetBranch: gitlabConfig.get<string>('defaultTargetBranch', 'main'),
      };
    }

    // AI configuration
    const aiConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.ai');
    config.ai = {
      provider: aiConfig.get<'mcp' | 'openai' | 'custom'>('provider', 'mcp'),
      endpoint: aiConfig.get<string>('endpoint'),
      model: aiConfig.get<string>('model'),
    };

    // General configuration
    const generalConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.general');
    config.general = {
      autoCreateBranch: generalConfig.get<boolean>('autoCreateBranch', true),
      autoCommit: generalConfig.get<boolean>('autoCommit', false),
    };

    return config;
  }

  private validateImportedConfig(config: IExportableConfig): boolean {
    // Basic validation
    if (typeof config !== 'object') {
      return false;
    }

    // Validate JIRA config if present
    if (config.jira) {
      if (!config.jira.serverUrl || !config.jira.username) {
        return false;
      }
    }

    // Validate GitLab config if present
    if (config.gitlab) {
      if (!config.gitlab.serverUrl) {
        return false;
      }
    }

    return true;
  }

  private async applyConfig(config: IExportableConfig): Promise<void> {
    // Apply JIRA configuration
    if (config.jira) {
      const jiraConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.jira');
      await jiraConfig.update(
        'serverUrl',
        config.jira.serverUrl,
        vscode.ConfigurationTarget.Global
      );
      await jiraConfig.update('username', config.jira.username, vscode.ConfigurationTarget.Global);
      await jiraConfig.update('authType', config.jira.authType, vscode.ConfigurationTarget.Global);
    }

    // Apply GitLab configuration
    if (config.gitlab) {
      const gitlabConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.gitlab');
      await gitlabConfig.update(
        'serverUrl',
        config.gitlab.serverUrl,
        vscode.ConfigurationTarget.Global
      );
      if (config.gitlab.defaultProjectId) {
        await gitlabConfig.update(
          'defaultProjectId',
          config.gitlab.defaultProjectId,
          vscode.ConfigurationTarget.Global
        );
      }
      await gitlabConfig.update(
        'defaultTargetBranch',
        config.gitlab.defaultTargetBranch,
        vscode.ConfigurationTarget.Global
      );
    }

    // Apply AI configuration
    if (config.ai) {
      const aiConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.ai');
      await aiConfig.update('provider', config.ai.provider, vscode.ConfigurationTarget.Global);
      if (config.ai.endpoint) {
        await aiConfig.update('endpoint', config.ai.endpoint, vscode.ConfigurationTarget.Global);
      }
      if (config.ai.model) {
        await aiConfig.update('model', config.ai.model, vscode.ConfigurationTarget.Global);
      }
    }

    // Apply general configuration
    if (config.general) {
      const generalConfig = vscode.workspace.getConfiguration('jiraGitlabHelper.general');
      await generalConfig.update(
        'autoCreateBranch',
        config.general.autoCreateBranch,
        vscode.ConfigurationTarget.Global
      );
      await generalConfig.update(
        'autoCommit',
        config.general.autoCommit,
        vscode.ConfigurationTarget.Global
      );
    }
  }
}

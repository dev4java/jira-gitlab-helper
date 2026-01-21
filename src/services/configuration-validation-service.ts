import * as vscode from 'vscode';
import { ConfigurationManager } from '../config/configuration-manager';
import { JiraService } from './jira-service';
import { GitlabService } from './gitlab-service';
import { Logger } from '../utils/logger';

export interface ValidationResult {
  isValid: boolean;
  service: 'jira' | 'gitlab';
  message: string;
  errorType?: 'config' | 'auth' | 'network' | 'permission';
}

/**
 * 配置验证服务 - 检查Jira和GitLab连接状态
 */
export class ConfigurationValidationService {
  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _jiraService: JiraService,
    private readonly _gitlabService: GitlabService,
    private readonly _logger: Logger
  ) {}

  /**
   * 验证Jira连接
   */
  public async validateJiraConnection(): Promise<ValidationResult> {
    try {
      this._logger.debug('开始验证Jira连接...');
      
      const config = this._configManager.getJiraConfig();
      
      // 检查基本配置
      if (!config.serverUrl) {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira服务器URL未配置',
          errorType: 'config'
        };
      }
      
      if (!config.username) {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira用户名未配置',
          errorType: 'config'
        };
      }
      
      const credential = await this._configManager.getJiraCredential();
      if (!credential) {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira密码/Token未配置',
          errorType: 'config'
        };
      }
      
      // 测试连接
      const isConnected = await this._jiraService.testConnection();
      
      if (isConnected) {
        this._logger.info('✅ Jira连接验证成功');
        return {
          isValid: true,
          service: 'jira',
          message: 'Jira连接正常'
        };
      } else {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira连接测试失败',
          errorType: 'network'
        };
      }
    } catch (error: any) {
      this._logger.error('Jira连接验证失败', error);
      
      // 根据错误类型分类
      if (error.message.includes('401') || error.message.includes('认证')) {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira认证失败，请检查用户名和密码/Token',
          errorType: 'auth'
        };
      } else if (error.message.includes('403') || error.message.includes('权限')) {
        return {
          isValid: false,
          service: 'jira',
          message: 'Jira权限不足',
          errorType: 'permission'
        };
      } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
        return {
          isValid: false,
          service: 'jira',
          message: `Jira服务器无法访问: ${error.message}`,
          errorType: 'network'
        };
      }
      
      return {
        isValid: false,
        service: 'jira',
        message: `Jira连接错误: ${error.message}`,
        errorType: 'network'
      };
    }
  }

  /**
   * 验证GitLab连接
   */
  public async validateGitlabConnection(projectId?: string): Promise<ValidationResult> {
    try {
      this._logger.debug('开始验证GitLab连接...');
      
      const config = this._configManager.getGitlabConfig();
      
      // 检查基本配置
      if (!config.serverUrl) {
        return {
          isValid: false,
          service: 'gitlab',
          message: 'GitLab服务器URL未配置',
          errorType: 'config'
        };
      }
      
      const token = await this._configManager.getGitlabToken();
      if (!token) {
        return {
          isValid: false,
          service: 'gitlab',
          message: 'GitLab Access Token未配置',
          errorType: 'config'
        };
      }
      
      // 测试连接
      const isConnected = await this._gitlabService.testConnection();
      
      if (!isConnected) {
        return {
          isValid: false,
          service: 'gitlab',
          message: 'GitLab连接测试失败',
          errorType: 'network'
        };
      }
      
      // 如果提供了projectId，验证项目访问权限
      if (projectId) {
        try {
          await this._gitlabService.getMergeRequests(projectId);
          this._logger.info(`✅ GitLab项目访问验证成功: ${projectId}`);
        } catch (error: any) {
          if (error.message.includes('404')) {
            return {
              isValid: false,
              service: 'gitlab',
              message: `GitLab项目不存在或无权访问: ${projectId}`,
              errorType: 'permission'
            };
          }
          throw error; // 其他错误继续抛出
        }
      }
      
      this._logger.info('✅ GitLab连接验证成功');
      return {
        isValid: true,
        service: 'gitlab',
        message: 'GitLab连接正常'
      };
    } catch (error: any) {
      this._logger.error('GitLab连接验证失败', error);
      
      // 根据错误类型分类
      if (error.message.includes('401') || error.message.includes('认证')) {
        return {
          isValid: false,
          service: 'gitlab',
          message: 'GitLab认证失败，请检查Access Token',
          errorType: 'auth'
        };
      } else if (error.message.includes('403') || error.message.includes('权限')) {
        return {
          isValid: false,
          service: 'gitlab',
          message: 'GitLab权限不足，请检查Token权限',
          errorType: 'permission'
        };
      } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
        return {
          isValid: false,
          service: 'gitlab',
          message: `GitLab服务器无法访问: ${error.message}`,
          errorType: 'network'
        };
      }
      
      return {
        isValid: false,
        service: 'gitlab',
        message: `GitLab连接错误: ${error.message}`,
        errorType: 'network'
      };
    }
  }

  /**
   * 验证所有配置
   */
  public async validateAll(): Promise<{ jira: ValidationResult; gitlab: ValidationResult }> {
    const [jira, gitlab] = await Promise.all([
      this.validateJiraConnection(),
      this.validateGitlabConnection()
    ]);
    
    return { jira, gitlab };
  }

  /**
   * 显示验证结果给用户
   */
  public async showValidationResults(results: { jira: ValidationResult; gitlab: ValidationResult }): Promise<void> {
    const messages: string[] = [];
    
    if (!results.jira.isValid) {
      messages.push(`❌ Jira: ${results.jira.message}`);
    }
    
    if (!results.gitlab.isValid) {
      messages.push(`❌ GitLab: ${results.gitlab.message}`);
    }
    
    if (messages.length === 0) {
      void vscode.window.showInformationMessage('✅ Jira和GitLab连接正常');
    } else {
      const action = await vscode.window.showWarningMessage(
        '部分服务连接异常：\n\n' + messages.join('\n'),
        { modal: false },
        '配置Jira',
        'GitLab配置'
      );
      
      if (action === '配置Jira') {
        await vscode.commands.executeCommand('jiraGitlabHelper.configureJira');
      } else if (action === 'GitLab配置') {
        await vscode.commands.executeCommand('jiraGitlabHelper.configureGitlab');
      }
    }
  }
}

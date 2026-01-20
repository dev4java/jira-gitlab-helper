import * as vscode from 'vscode';
import { IGitlabMergeRequest } from '../../models/gitlab-models';
import { Logger } from '../../utils/logger';
import { GitConfigParser } from '../../utils/git-utils';
import { ConfigurationManager } from '../../config/configuration-manager';
import { GitlabService } from '../../services/gitlab-service';

export class GitlabMrViewProvider implements vscode.TreeDataProvider<MrTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<MrTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _mergeRequests: IGitlabMergeRequest[] = [];
  private _logger: Logger;
  private _gitlabService: GitlabService;
  private _configManager: ConfigurationManager;

  constructor(gitlabService: GitlabService, configManager: ConfigurationManager, logger: Logger) {
    this._gitlabService = gitlabService;
    this._configManager = configManager;
    this._logger = logger;
  }

  public refresh(): void {
    this._logger.info('Refreshing GitLab MR list...');
    this._onDidChangeTreeData.fire();
  }

  public async getTreeItem(element: MrTreeItem): Promise<vscode.TreeItem> {
    return element;
  }

  public async getChildren(element?: MrTreeItem): Promise<MrTreeItem[]> {
    if (element) {
      // 暂不支持子节点
      return [];
    }

    try {
      // 检查GitLab配置
      const config = this._configManager.getGitlabConfig();
      const token = await this._configManager.getGitlabToken();
      
      // 检查基本配置
      if (!config.serverUrl || !token) {
        this._logger.debug('GitLab服务器或Token未配置');
        
        // 检查当前工作区是否是GitLab项目
        const isGitlab = await GitConfigParser.isGitlabProject();
        if (!isGitlab) {
          // 不是GitLab项目，不显示任何提示
          this._logger.debug('当前工作区不是GitLab项目，不显示MR列表');
          return [];
        }
        
        // 是GitLab项目但未配置，提示配置
        return [this.createMessageItem('请先配置GitLab连接（服务器地址和Token）')];
      }

      // 尝试获取项目ID：优先使用配置的，其次自动从Git配置中获取
      let projectId: string | null = config.defaultProjectId;
      if (!projectId) {
        this._logger.debug('未配置defaultProjectId，尝试从当前工作区Git配置自动获取');
        projectId = await GitConfigParser.getGitlabProjectIdFromWorkspace();
        
        if (!projectId) {
          // 无法获取项目ID，检查是否是GitLab项目
          const isGitlab = await GitConfigParser.isGitlabProject();
          if (!isGitlab) {
            // 不是GitLab项目，不显示提示
            this._logger.debug('当前工作区不是GitLab项目');
            return [];
          }
          
          // 是GitLab项目但无法解析项目ID
          return [this.createMessageItem('无法自动获取项目ID，请在配置中手动设置')];
        }
        
        this._logger.info(`自动从Git配置获取到项目ID: ${projectId}`);
      } else {
        this._logger.info(`使用配置的项目ID: ${projectId}`);
      }

      // 获取MR列表 - 包括当前用户创建的和分配给当前用户审核的（已在GitlabClient中合并去重）
      this._mergeRequests = await this._gitlabService.getMergeRequests(projectId);

      if (this._mergeRequests.length === 0) {
        return [this.createMessageItem('暂无相关的Merge Request')];
      }

      // 直接显示所有MR
      return this._mergeRequests.map(mr => this.createMrItem(mr));
    } catch (error) {
      this._logger.error('加载GitLab MR列表失败', error);
      
      // 检查是否是404错误（项目不存在或无权限）
      const errorMessage = String(error);
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        this._logger.warn('项目ID可能不正确或无权限访问，请检查配置');
        return [
          this.createMessageItem('项目未找到或无权限'),
          this.createMessageItem('请在设置中配置正确的项目ID')
        ];
      }
      
      // 连接错误或其他错误，只显示简单提示
      this._logger.warn('GitLab连接失败，请检查网络和配置');
      return [this.createMessageItem('GitLab连接失败，请检查日志')];
    }
  }

  private createMessageItem(message: string): MrTreeItem {
    const item = new MrTreeItem(message, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'message';
    return item;
  }

  private createMrItem(mr: IGitlabMergeRequest): MrTreeItem {
    const item = new MrTreeItem(
      `!${mr.iid}: ${mr.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    item.description = `${mr.sourceBranch} → ${mr.targetBranch}`;
    item.tooltip = this.createTooltip(mr);
    item.iconPath = new vscode.ThemeIcon('git-merge', this.getStateColor(mr.state));
    item.contextValue = 'mergeRequest';

    // 点击打开MR详情
    item.command = {
      command: 'vscode.open',
      title: '打开MR',
      arguments: [vscode.Uri.parse(mr.webUrl)],
    };

    return item;
  }

  private getStateColor(state: string): vscode.ThemeColor {
    switch (state.toLowerCase()) {
      case 'opened':
        return new vscode.ThemeColor('terminal.ansiGreen');
      case 'merged':
        return new vscode.ThemeColor('terminal.ansiBlue');
      case 'closed':
        return new vscode.ThemeColor('errorForeground');
      default:
        return new vscode.ThemeColor('foreground');
    }
  }

  private createTooltip(mr: IGitlabMergeRequest): string {
    const lines = [
      `MR: !${mr.iid}`,
      `标题: ${mr.title}`,
      `状态: ${mr.state}`,
      `作者: ${mr.author.name}`,
      `分支: ${mr.sourceBranch} → ${mr.targetBranch}`,
      `创建时间: ${this.formatDate(mr.createdAt)}`,
      `更新时间: ${this.formatDate(mr.updatedAt)}`,
      '',
      '点击在浏览器中打开',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return '今天';
    } else if (diffInDays === 1) {
      return '昨天';
    } else if (diffInDays < 7) {
      return `${diffInDays}天前`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks}周前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }
}

class MrTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

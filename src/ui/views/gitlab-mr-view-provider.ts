import * as vscode from 'vscode';
import { IGitlabMergeRequest } from '../../models/gitlab-models';
import { Logger } from '../../utils/logger';
import { ConfigurationManager } from '../../config/configuration-manager';
import { GitlabService } from '../../services/gitlab-service';
import { GitlabConnectionError } from '../../integrations/gitlab-client';

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
      
      if (!config.serverUrl || !token || !config.defaultProjectId) {
        this._logger.warn('GitLab未配置，无法加载MR列表');
        return [this.createMessageItem('请先配置GitLab连接')];
      }

      // 获取MR列表 - 包括当前用户创建的和分配给当前用户审核的（已在GitlabClient中合并去重）
      this._mergeRequests = await this._gitlabService.getMergeRequests(config.defaultProjectId);

      if (this._mergeRequests.length === 0) {
        return [this.createMessageItem('暂无相关的Merge Request')];
      }

      // 直接显示所有MR
      return this._mergeRequests.map(mr => this.createMrItem(mr));
    } catch (error) {
      this._logger.error('Failed to load GitLab MR list', error);
      if (error instanceof GitlabConnectionError) {
        return [this.createMessageItem(`加载失败: ${error.message}`)];
      }
      return [this.createMessageItem('加载GitLab MR列表失败')];
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

import { Gitlab } from '@gitbeaker/node';
import { Logger } from '../utils/logger';
import {
  IGitlabProject,
  IGitlabBranch,
  IGitlabMergeRequest,
  IGitlabDiscussion,
  ICodeSuggestion,
  ICommitFile,
} from '../models/gitlab-models';

export class GitlabConnectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GitlabConnectionError';
  }
}

export class GitlabAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitlabAuthenticationError';
  }
}

export interface IGitlabClientConfig {
  serverUrl: string;
  token: string;
  projectId?: string;
}

export class GitlabClient {
  private readonly _api: InstanceType<typeof Gitlab>;
  private readonly _logger: Logger;
  private readonly _projectId?: string;

  constructor(config: IGitlabClientConfig, logger: Logger) {
    this._logger = logger;
    this._projectId = config.projectId;

    this._api = new Gitlab({
      host: config.serverUrl,
      token: config.token,
    });

    this._logger.info('GitLab client initialized', { serverUrl: config.serverUrl });
  }

  public async testConnection(): Promise<boolean> {
    try {
      this._logger.debug('Testing GitLab connection...');
      const user = await this._api.Users.current();
      this._logger.info('GitLab connection test successful', { user: user.username });
      return true;
    } catch (error) {
      this._logger.error('GitLab connection test failed', error);
      if (this.isGitlabError(error) && error.response?.status === 401) {
        throw new GitlabAuthenticationError('GitLab认证失败,请检查Personal Access Token');
      }
      throw new GitlabConnectionError(`连接GitLab失败: ${String(error)}`);
    }
  }

  public async getProject(projectId?: string): Promise<IGitlabProject> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Fetching GitLab project', { projectId: id });
      const project = await this._api.Projects.show(id);

      return {
        id: project.id,
        name: project.name,
        path: project.path,
        pathWithNamespace: project.path_with_namespace,
        httpUrlToRepo: project.http_url_to_repo,
        defaultBranch: project.default_branch || 'main',
      };
    } catch (error) {
      this._logger.error('Failed to fetch GitLab project', error);
      throw new GitlabConnectionError(`获取GitLab项目失败: ${String(error)}`);
    }
  }

  public async getBranches(projectId?: string): Promise<IGitlabBranch[]> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Fetching GitLab branches', { projectId: id });
      const branches = await this._api.Branches.all(id);

      return branches.map((b: any) => ({
        name: String(b.name || ''),
        commit: {
          id: String(b.commit?.id || ''),
          shortId: String(b.commit?.short_id || ''),
          message: String(b.commit?.message || ''),
        },
        protected: Boolean(b.protected),
      }));
    } catch (error) {
      this._logger.error('Failed to fetch GitLab branches', error);
      throw new GitlabConnectionError(`获取Git分支失败: ${String(error)}`);
    }
  }

  public async createBranch(
    branchName: string,
    ref: string,
    projectId?: string
  ): Promise<IGitlabBranch> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Creating GitLab branch', { projectId: id, branchName, ref });
      const branch = await this._api.Branches.create(id, branchName, ref);

      this._logger.info('GitLab branch created successfully', { branchName });

      return {
        name: String(branch.name || ''),
        commit: {
          id: String(branch.commit?.id || ''),
          shortId: String(branch.commit?.short_id || ''),
          message: String(branch.commit?.message || ''),
        },
        protected: Boolean(branch.protected),
      };
    } catch (error) {
      this._logger.error('Failed to create GitLab branch', error);
      throw new GitlabConnectionError(`创建Git分支失败: ${String(error)}`);
    }
  }

  public async commitFiles(
    branchName: string,
    commitMessage: string,
    files: ICommitFile[],
    projectId?: string
  ): Promise<void> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Committing files to GitLab', {
        projectId: id,
        branchName,
        fileCount: files.length,
      });

      await this._api.Commits.create(id, branchName, commitMessage, files);

      this._logger.info('Files committed successfully', { branchName, fileCount: files.length });
    } catch (error) {
      this._logger.error('Failed to commit files', error);
      throw new GitlabConnectionError(`提交文件失败: ${String(error)}`);
    }
  }

  public async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string,
    projectId?: string
  ): Promise<IGitlabMergeRequest> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Creating GitLab merge request', {
        projectId: id,
        sourceBranch,
        targetBranch,
      });

      const mr = await this._api.MergeRequests.create(id, sourceBranch, targetBranch, title, {
        description,
      });

      this._logger.info('Merge request created successfully', { mrIid: mr.iid });

      return this.transformMergeRequest(mr);
    } catch (error) {
      this._logger.error('Failed to create merge request', error);
      throw new GitlabConnectionError(`创建Merge Request失败: ${String(error)}`);
    }
  }

  public async getMergeRequest(mrIid: number, projectId?: string): Promise<IGitlabMergeRequest> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Fetching GitLab merge request', { projectId: id, mrIid });
      const mr = await this._api.MergeRequests.show(id, mrIid);
      return this.transformMergeRequest(mr);
    } catch (error) {
      this._logger.error('Failed to fetch merge request', error);
      throw new GitlabConnectionError(`获取Merge Request失败: ${String(error)}`);
    }
  }

  public async getMergeRequestDiscussions(
    mrIid: number,
    projectId?: string
  ): Promise<IGitlabDiscussion[]> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Fetching merge request discussions', { projectId: id, mrIid });
      const discussions = await this._api.MergeRequestDiscussions.all(id, mrIid);

      return discussions.map((d: any) => ({
        id: d.id,
        resolved: d.resolved,
        notes: d.notes.map((n: any) => ({
          id: n.id,
          body: n.body,
          author: {
            id: n.author.id,
            name: n.author.name,
            username: n.author.username,
          },
          createdAt: n.created_at,
          resolvable: n.resolvable,
          resolved: n.resolved,
          position: n.position
            ? {
                baseSha: n.position.base_sha,
                startSha: n.position.start_sha,
                headSha: n.position.head_sha,
                oldPath: n.position.old_path,
                newPath: n.position.new_path,
                positionType: n.position.position_type,
                oldLine: n.position.old_line,
                newLine: n.position.new_line,
              }
            : undefined,
        })),
      }));
    } catch (error) {
      this._logger.error('Failed to fetch merge request discussions', error);
      throw new GitlabConnectionError(`获取MR讨论失败: ${String(error)}`);
    }
  }

  public extractCodeSuggestions(discussions: IGitlabDiscussion[]): ICodeSuggestion[] {
    const suggestions: ICodeSuggestion[] = [];

    for (const discussion of discussions) {
      // 如果整个讨论已解决，跳过
      if (discussion.resolved) {
        continue;
      }

      for (const note of discussion.notes) {
        // 只提取未解决的代码建议（检查note级别的resolved状态）
        if (note.position && !note.resolved) {
          suggestions.push({
            id: `${discussion.id}-${note.id}`,
            filePath: note.position.newPath || note.position.oldPath,
            oldLine: note.position.oldLine,
            newLine: note.position.newLine,
            body: note.body,
            author: note.author.name,
            createdAt: note.createdAt,
            resolved: note.resolved,
            type: this.classifySuggestionType(note.body),
          });
        }
      }
    }

    return suggestions;
  }

  private classifySuggestionType(body: string): 'error' | 'warning' | 'suggestion' {
    const lowerBody = body.toLowerCase();

    if (lowerBody.includes('error') || lowerBody.includes('错误') || lowerBody.includes('必须')) {
      return 'error';
    }

    if (lowerBody.includes('warning') || lowerBody.includes('警告') || lowerBody.includes('建议')) {
      return 'warning';
    }

    return 'suggestion';
  }

  /**
   * 获取当前用户相关的MR列表
   * @param projectId 项目ID
   * @returns MR列表
   */
  public async getMyMergeRequests(projectId?: string): Promise<IGitlabMergeRequest[]> {
    const id = projectId || this._projectId;
    if (!id) {
      throw new Error('未指定项目ID');
    }

    try {
      this._logger.debug('Fetching user merge requests', { projectId: id });
      
      // 获取当前用户信息
      const currentUser = await this._api.Users.current();
      
      // 获取当前用户创建的MR
      const createdByMe = await this._api.MergeRequests.all({
        projectId: id,
        authorId: currentUser.id,
        state: 'opened',
        orderBy: 'updated_at',
        sort: 'desc',
      });
      
      // 获取需要当前用户审核的MR（作为reviewer或assignee）
      const assignedToMe = await this._api.MergeRequests.all({
        projectId: id,
        state: 'opened',
        reviewerId: currentUser.id,
        orderBy: 'updated_at',
        sort: 'desc',
      });
      
      // 合并并去重
      const mrMap = new Map<number, any>();
      [...createdByMe, ...assignedToMe].forEach((mr: any) => {
        mrMap.set(mr.iid, mr);
      });
      
      const mergeRequests = Array.from(mrMap.values()).map(mr => this.transformMergeRequest(mr));
      
      this._logger.info(`Found ${mergeRequests.length} merge requests for current user`);
      return mergeRequests;
    } catch (error) {
      this._logger.error('Failed to fetch user merge requests', error);
      throw new GitlabConnectionError(`获取MR列表失败: ${String(error)}`);
    }
  }

  private transformMergeRequest(mr: any): IGitlabMergeRequest {
    return {
      iid: mr.iid,
      id: mr.id,
      title: mr.title,
      description: mr.description || '',
      state: mr.state,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      author: {
        id: mr.author.id,
        name: mr.author.name,
        username: mr.author.username,
      },
      webUrl: mr.web_url,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
    };
  }

  private isGitlabError(error: unknown): error is { response?: { status?: number } } {
    return typeof error === 'object' && error !== null && 'response' in error;
  }
}

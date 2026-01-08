import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import * as child_process from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(child_process.exec);

export class GitService {
  constructor(private readonly _logger: Logger) {}

  public async getCurrentBranch(workspaceUri: vscode.Uri): Promise<string> {
    try {
      const { stdout } = await execAsync('git branch --show-current', {
        cwd: workspaceUri.fsPath,
      });
      return stdout.trim();
    } catch (error) {
      this._logger.error('Failed to get current branch', error);
      throw new Error(`获取当前分支失败: ${String(error)}`);
    }
  }

  public async checkoutBranch(
    workspaceUri: vscode.Uri,
    branchName: string,
    create = false
  ): Promise<void> {
    try {
      const command = create ? `git checkout -b ${branchName}` : `git checkout ${branchName}`;
      await execAsync(command, {
        cwd: workspaceUri.fsPath,
      });
      this._logger.info('Checked out branch', { branchName, create });
    } catch (error) {
      this._logger.error('Failed to checkout branch', error);
      throw new Error(`切换分支失败: ${String(error)}`);
    }
  }

  public async branchExists(workspaceUri: vscode.Uri, branchName: string): Promise<boolean> {
    try {
      await execAsync(`git rev-parse --verify ${branchName}`, {
        cwd: workspaceUri.fsPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async getModifiedFiles(workspaceUri: vscode.Uri): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: workspaceUri.fsPath,
      });

      return stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.substring(3));
    } catch (error) {
      this._logger.error('Failed to get modified files', error);
      throw new Error(`获取修改文件失败: ${String(error)}`);
    }
  }

  public async stageFiles(workspaceUri: vscode.Uri, files: string[]): Promise<void> {
    try {
      if (files.length === 0) {
        return;
      }

      const fileList = files.map((f) => `"${f}"`).join(' ');
      await execAsync(`git add ${fileList}`, {
        cwd: workspaceUri.fsPath,
      });

      this._logger.info('Staged files', { count: files.length });
    } catch (error) {
      this._logger.error('Failed to stage files', error);
      throw new Error(`暂存文件失败: ${String(error)}`);
    }
  }

  public async commit(workspaceUri: vscode.Uri, message: string): Promise<void> {
    try {
      await execAsync(`git commit -m "${message}"`, {
        cwd: workspaceUri.fsPath,
      });
      this._logger.info('Committed changes', { message });
    } catch (error) {
      this._logger.error('Failed to commit changes', error);
      throw new Error(`提交变更失败: ${String(error)}`);
    }
  }

  public async push(
    workspaceUri: vscode.Uri,
    remote = 'origin',
    branch?: string,
    setUpstream = false
  ): Promise<void> {
    try {
      const currentBranch = branch || (await this.getCurrentBranch(workspaceUri));
      const upstreamFlag = setUpstream ? '-u' : '';
      const command = `git push ${upstreamFlag} ${remote} ${currentBranch}`;

      await execAsync(command, {
        cwd: workspaceUri.fsPath,
      });

      this._logger.info('Pushed to remote', { remote, branch: currentBranch });
    } catch (error) {
      this._logger.error('Failed to push to remote', error);
      throw new Error(`推送到远程失败: ${String(error)}`);
    }
  }

  public async pull(workspaceUri: vscode.Uri, remote = 'origin', branch?: string): Promise<void> {
    try {
      const targetBranch = branch || (await this.getCurrentBranch(workspaceUri));
      await execAsync(`git pull ${remote} ${targetBranch}`, {
        cwd: workspaceUri.fsPath,
      });
      this._logger.info('Pulled from remote', { remote, branch: targetBranch });
    } catch (error) {
      this._logger.error('Failed to pull from remote', error);
      throw new Error(`从远程拉取失败: ${String(error)}`);
    }
  }

  public async hasUncommittedChanges(workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: workspaceUri.fsPath,
      });
      return stdout.trim().length > 0;
    } catch (error) {
      this._logger.error('Failed to check uncommitted changes', error);
      return false;
    }
  }

  public async getRemoteUrl(workspaceUri: vscode.Uri, remote = 'origin'): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`git remote get-url ${remote}`, {
        cwd: workspaceUri.fsPath,
      });
      return stdout.trim();
    } catch (error) {
      this._logger.error('Failed to get remote URL', error);
      return undefined;
    }
  }

  public extractGitlabProjectPath(remoteUrl: string): string | undefined {
    try {
      // 去除 .git 后缀
      let url = remoteUrl.replace(/\.git$/, '');

      // 处理 HTTPS URL: https://gitlab.com/group/project
      const httpsMatch = url.match(/https?:\/\/[^\/]+\/(.+)$/);
      if (httpsMatch) {
        return httpsMatch[1];
      }

      // 处理 SSH URL: git@gitlab.com:group/project
      const sshMatch = url.match(/git@[^:]+:(.+)$/);
      if (sshMatch) {
        return sshMatch[1];
      }

      return undefined;
    } catch (error) {
      this._logger.error('Failed to extract GitLab project path', error);
      return undefined;
    }
  }
}

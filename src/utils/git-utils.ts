import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 从当前工作区的Git配置中自动提取GitLab项目信息
 */
export class GitConfigParser {
  /**
   * 尝试从当前工作区获取GitLab项目ID
   * @returns GitLab项目ID（格式：group/project 或 数字ID），如果不是GitLab项目返回null
   */
  public static async getGitlabProjectIdFromWorkspace(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // 尝试第一个工作区文件夹
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const gitConfigPath = path.join(workspacePath, '.git', 'config');

    // 检查.git/config是否存在
    if (!fs.existsSync(gitConfigPath)) {
      return null;
    }

    try {
      const configContent = fs.readFileSync(gitConfigPath, 'utf-8');
      return this.parseGitlabProjectId(configContent);
    } catch (error) {
      console.error('Failed to read git config:', error);
      return null;
    }
  }

  /**
   * 检查当前工作区是否是GitLab项目
   * @returns 如果是GitLab项目返回true，否则返回false
   */
  public static async isGitlabProject(): Promise<boolean> {
    const projectId = await this.getGitlabProjectIdFromWorkspace();
    return projectId !== null;
  }

  /**
   * 从Git配置内容中解析GitLab项目ID
   * @param configContent .git/config文件内容
   * @returns GitLab项目ID或null
   */
  private static parseGitlabProjectId(configContent: string): string | null {
    // 匹配 remote "origin" 部分的URL
    // 示例格式：
    // [remote "origin"]
    //   url = git@gitlab.com:username/project.git
    //   url = https://gitlab.com/username/project.git
    //   url = git@gitlab.your-company.com:group/subgroup/project.git
    
    const urlMatch = configContent.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
    if (!urlMatch || !urlMatch[1]) {
      return null;
    }

    const remoteUrl = urlMatch[1].trim();
    
    // 检查是否是GitLab URL（包含gitlab关键字）
    if (!remoteUrl.toLowerCase().includes('gitlab')) {
      return null;
    }

    // 解析不同格式的GitLab URL
    let projectPath: string | null = null;

    // SSH格式: git@gitlab.com:username/project.git
    const sshMatch = remoteUrl.match(/git@[^:]+:(.+?)(?:\.git)?$/);
    if (sshMatch) {
      projectPath = sshMatch[1];
    }

    // HTTPS格式: https://gitlab.com/username/project.git
    const httpsMatch = remoteUrl.match(/https?:\/\/[^\/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      projectPath = httpsMatch[1];
    }

    if (projectPath) {
      // 对项目路径进行URL编码（GitLab API要求）
      // 例如：group/project -> group%2Fproject
      return encodeURIComponent(projectPath);
    }

    return null;
  }

  /**
   * 从Git配置中提取GitLab服务器地址
   * @returns GitLab服务器地址或null
   */
  public static async getGitlabServerUrl(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const gitConfigPath = path.join(workspacePath, '.git', 'config');

    if (!fs.existsSync(gitConfigPath)) {
      return null;
    }

    try {
      const configContent = fs.readFileSync(gitConfigPath, 'utf-8');
      const urlMatch = configContent.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
      
      if (!urlMatch || !urlMatch[1]) {
        return null;
      }

      const remoteUrl = urlMatch[1].trim();
      
      if (!remoteUrl.toLowerCase().includes('gitlab')) {
        return null;
      }

      // SSH格式: git@gitlab.com:... -> https://gitlab.com
      const sshMatch = remoteUrl.match(/git@([^:]+):/);
      if (sshMatch) {
        return `https://${sshMatch[1]}`;
      }

      // HTTPS格式: https://gitlab.com/... -> https://gitlab.com
      const httpsMatch = remoteUrl.match(/(https?:\/\/[^\/]+)/);
      if (httpsMatch) {
        return httpsMatch[1];
      }

      return null;
    } catch (error) {
      console.error('Failed to read git config:', error);
      return null;
    }
  }
}

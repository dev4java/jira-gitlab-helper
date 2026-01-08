import * as vscode from 'vscode';
import { GitlabService } from '../services/gitlab-service';

export class GitlabChatParticipant {
  private readonly _participant: vscode.ChatParticipant;

  constructor(_gitlabService: GitlabService) {
    this._participant = vscode.chat.createChatParticipant('gitlab', this._handleChat.bind(this));
    this._participant.iconPath = new vscode.ThemeIcon('git-merge');
  }

  private async _handleChat(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    try {
      const input = request.prompt.trim();
      
      if (!input) {
        return await this._showHelp(stream);
      }

      const parts = input.split(/\s+/);
      const command = parts[0].toLowerCase();

      if (command === 'mr' || command === '创建') {
        return await this._handleMR(stream);
      } else if (command === 'projects' || command === '项目') {
        return await this._handleProjects(stream);
      } else if (command === 'branches' || command === '分支') {
        return await this._handleBranches(stream);
      } else {
        return await this._showHelp(stream);
      }
    } catch (error) {
      stream.markdown(`❌ 错误: ${(error as Error).message}\n`);
      return {};
    }
  }

  private async _showHelp(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.markdown('## 🦊 GitLab 助手\n\n');
    stream.markdown('我可以帮你操作GitLab:\n\n');
    stream.markdown('**命令**:\n');
    stream.markdown('- `mr` - 创建Merge Request\n');
    stream.markdown('- `projects` - 查看项目列表\n');
    stream.markdown('- `branches` - 查看分支列表\n\n');
    stream.markdown('💡 试试: `@gitlab projects`\n');
    return {};
  }

  private async _handleMR(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.markdown('🔀 创建Merge Request\n\n');
    stream.markdown('由于需要选择项目、填写标题等信息，\n');
    stream.markdown('请使用命令面板: `Jira GitLab Helper: 创建Merge Request`\n\n');
    
    stream.button({
      command: 'jiraGitlabHelper.createMR',
      title: '打开创建MR',
    });

    return {};
  }

  private async _handleProjects(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.markdown('## 📦 GitLab 项目\n\n');
    stream.markdown('请在扩展配置中设置默认项目ID。\n\n');
    stream.markdown('或者使用命令面板查看更多项目信息。\n');
    return {};
  }

  private async _handleBranches(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.markdown('📋 查看分支列表\n\n');
    stream.markdown('请先选择项目ID，然后使用命令面板操作。\n');
    return {};
  }

  public dispose(): void {
    this._participant.dispose();
  }
}


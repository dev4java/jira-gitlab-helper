import * as vscode from 'vscode';
import { JiraService } from '../services/jira-service';
import { RequirementAnalysisService } from '../services/requirement-analysis-service';

export class JiraChatParticipant {
  private readonly _participant: vscode.ChatParticipant;

  constructor(
    private readonly _jiraService: JiraService,
    private readonly _requirementService: RequirementAnalysisService
  ) {
    this._participant = vscode.chat.createChatParticipant('jira', this._handleChat.bind(this));
    this._participant.iconPath = new vscode.ThemeIcon('notebook');
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

      // Parse command: fetch PROJ-123, analyze PROJ-123, bug PROJ-123, list bugs
      const parts = input.split(/\s+/);
      const command = parts[0].toLowerCase();
      const issueKeyOrSubCmd = parts[1];

      if (command === 'fetch' || command === '获取') {
        return await this._handleFetch(issueKeyOrSubCmd, stream);
      } else if (command === 'analyze' || command === '分析') {
        return await this._handleAnalyze(issueKeyOrSubCmd, stream);
      } else if (command === 'bug') {
        return await this._handleBug(issueKeyOrSubCmd, stream);
      } else if (command === 'list' || command === '列表') {
        if (issueKeyOrSubCmd === 'bugs' || issueKeyOrSubCmd === 'bug') {
          return await this._handleListBugs(stream);
        } else {
          stream.markdown('❌ 未知的列表类型。试试: `@jira list bugs`\n');
          return {};
        }
      } else {
        // 直接把输入当作issue key
        return await this._handleFetch(input, stream);
      }
    } catch (error) {
      stream.markdown(`❌ 错误: ${(error as Error).message}\n`);
      return {};
    }
  }

  private async _showHelp(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.markdown('## 🎫 Jira 助手\n\n');
    stream.markdown('我可以帮你快速操作Jira:\n\n');
    stream.markdown('**直接输入问题Key**:\n');
    stream.markdown('```\n@jira PROJ-123\n```\n\n');
    stream.markdown('**使用命令**:\n');
    stream.markdown('- `fetch PROJ-123` - 获取问题详情\n');
    stream.markdown('- `analyze PROJ-123` - 分析需求\n');
    stream.markdown('- `bug PROJ-123` - 分析Bug\n');
    stream.markdown('- `list bugs` - 查看Bug列表\n\n');
    stream.markdown('💡 试试: `@jira list bugs`\n');
    return {};
  }

  private async _handleFetch(issueKey: string, stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    if (!issueKey) {
      stream.markdown('❌ 请提供问题Key，例如: `@jira PROJ-123`\n');
      return {};
    }

    stream.progress('正在获取...');
    const issue = await this._jiraService.getIssue(issueKey);

    stream.markdown(`## 📋 ${issue.key}: ${issue.summary}\n\n`);
    stream.markdown(`- **类型**: ${issue.type}\n`);
    stream.markdown(`- **状态**: ${issue.status}\n`);
    stream.markdown(`- **优先级**: ${issue.priority}\n`);
    
    if (issue.assignee) {
      stream.markdown(`- **负责人**: ${issue.assignee.displayName}\n`);
    }
    stream.markdown('\n');
    
    if (issue.description) {
      stream.markdown(`**描述**:\n${issue.description.slice(0, 300)}${issue.description.length > 300 ? '...' : ''}\n\n`);
    }

    const isRequirement = this._jiraService.isRequirementIssue(issue);
    const isBug = this._jiraService.isBugIssue(issue);

    if (isRequirement) {
      stream.markdown('💡 这是需求，可以用: `@jira analyze ' + issueKey + '`\n');
    } else if (isBug) {
      stream.markdown('🐛 这是Bug，可以用: `@jira bug ' + issueKey + '`\n');
    }

    return {};
  }

  private async _handleAnalyze(issueKey: string, stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    if (!issueKey) {
      stream.markdown('❌ 请提供问题Key\n');
      return {};
    }

    stream.progress('AI分析中...');
    
    const issue = await this._jiraService.getIssue(issueKey);
    
    if (!this._jiraService.isRequirementIssue(issue)) {
      stream.markdown('⚠️ 这不是需求类型。如果是Bug请用: `@jira bug ' + issueKey + '`\n');
      return {};
    }

    stream.markdown(`🔍 分析需求: **${issue.summary}**\n\n`);

    const analysis = await this._requirementService.analyzeRequirement(issue);

    stream.markdown(`✅ 分析完成！\n\n`);
    stream.markdown(`**功能**: ${analysis.suggestedChangeId}\n`);
    stream.markdown(`**复杂度**: ${analysis.estimatedComplexity}\n\n`);
    
    if (analysis.acceptanceCriteria.length > 0) {
      stream.markdown(`**验收标准**:\n`);
      analysis.acceptanceCriteria.slice(0, 3).forEach((criteria, i) => {
        stream.markdown(`${i + 1}. ${criteria}\n`);
      });
      stream.markdown('\n');
    }
    
    stream.markdown(`💡 接下来用命令面板生成OpenSpec: \`Jira GitLab Helper: 分析需求\`\n`);

    return {};
  }

  private async _handleBug(issueKey: string, stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    if (!issueKey) {
      stream.markdown('❌ 请提供Bug的Key\n');
      return {};
    }

    stream.progress('分析Bug...');
    
    const issue = await this._jiraService.getIssue(issueKey);
    
    if (!this._jiraService.isBugIssue(issue)) {
      stream.markdown('⚠️ 这不是Bug类型\n');
      return {};
    }

    stream.markdown(`🐛 Bug: **${issue.summary}**\n\n`);
    stream.markdown(`**描述**: ${issue.description || '无'}\n\n`);
    stream.markdown(`💡 接下来:\n`);
    stream.markdown(`1. 命令面板 → \`Jira GitLab Helper: 分析Bug\` - AI深度分析\n`);
    stream.markdown(`2. 搜索相关代码和日志\n`);
    stream.markdown(`3. 查看最近的代码变更\n`);

    return {};
  }

  private async _handleListBugs(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
    stream.progress('加载Bug列表...');
    
    try {
      const result = await this._jiraService.searchMyBugs(50);
      
      if (result.issues.length === 0) {
        stream.markdown('✅ 太棒了！你没有待处理的Bug。\n');
        return {};
      }

      stream.markdown(`## 🐛 我的Bug列表 (${result.total}个)\n\n`);

      // 按优先级分组
      const byPriority: Record<string, typeof result.issues> = {
        'Highest': [],
        'High': [],
        'Medium': [],
        'Low': [],
        'Lowest': []
      };

      for (const bug of result.issues) {
        const priority = bug.priority || 'Medium';
        if (byPriority[priority]) {
          byPriority[priority].push(bug);
        } else {
          byPriority[priority] = [bug];
        }
      }

      // 显示每个优先级的bugs
      const priorityIcons: Record<string, string> = {
        'Highest': '🔴🔴',
        'High': '🔴',
        'Medium': '🟡',
        'Low': '🟢',
        'Lowest': '⚪'
      };

      let shownCount = 0;
      const maxShow = 20;

      for (const priority of ['Highest', 'High', 'Medium', 'Low', 'Lowest']) {
        const bugs = byPriority[priority];
        if (!bugs || bugs.length === 0) continue;

        stream.markdown(`### ${priorityIcons[priority]} ${priority} (${bugs.length})\n\n`);

        for (const bug of bugs) {
          if (shownCount >= maxShow) break;
          
          const statusIcon = bug.status === 'In Progress' ? '🔄' : '🆕';
          stream.markdown(`${statusIcon} **[${bug.key}](${bug.key})** - ${bug.summary}\n`);
          stream.markdown(`   状态: ${bug.status} | 更新: ${new Date(bug.updated).toLocaleDateString('zh-CN')}\n\n`);
          
          shownCount++;
        }

        if (shownCount >= maxShow) {
          stream.markdown(`\n... 还有 ${result.total - shownCount} 个Bug\n\n`);
          break;
        }
      }

      stream.markdown('\n💡 点击Bug号码或复制后用 `@jira bug PROJ-123` 进行分析\n');
      stream.markdown('💡 或使用命令: `Jira GitLab Helper: 获取Bug列表` 查看完整列表并操作\n');

      return {};
    } catch (error) {
      stream.markdown(`❌ 获取Bug列表失败: ${(error as Error).message}\n`);
      return {};
    }
  }

  public dispose(): void {
    this._participant.dispose();
  }
}


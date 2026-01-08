import * as vscode from 'vscode';
import { RequirementAnalysisService } from '../services/requirement-analysis-service';
import { JiraService } from '../services/jira-service';
import { GitService } from '../services/git-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';

export class AnalyzeRequirementCommand {
  constructor(
    private readonly _jiraService: JiraService,
    private readonly _requirementAnalysisService: RequirementAnalysisService,
    private readonly _gitService: GitService,
    private readonly _logger: Logger
  ) {}

  public async execute(issue?: IJiraIssue): Promise<void> {
    try {
      this._logger.info('Starting requirement analysis...');

      // Get JIRA issue if not provided
      if (!issue) {
        issue = await this.promptForJiraIssue();
        if (!issue) {
          this._logger.info('Requirement analysis cancelled by user');
          return;
        }
      }

      // Verify it's a requirement type issue
      if (!this._jiraService.isRequirementIssue(issue)) {
        void vscode.window.showErrorMessage(
          `问题 ${issue.key} 不是需求类型 (${issue.type}),无法进行需求分析`
        );
        return;
      }

      // 确认当前分支
      const workspaceUri = this.getWorkspaceUri();
      if (!workspaceUri) {
        throw new Error('未找到工作区');
      }

      const currentBranch = await this._gitService.getCurrentBranch(workspaceUri);
      const confirmBranch = await vscode.window.showWarningMessage(
        `当前分支: ${currentBranch}\n\n是否在此分支上进行需求分析和代码生成？`,
        { modal: true },
        '确认',
        '取消'
      );

      if (confirmBranch !== '确认') {
        void vscode.window.showInformationMessage('已取消需求分析');
        return;
      }

      // Analyze requirement with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `分析需求 ${issue.key}...`,
          cancellable: false,
        },
        async (progress) => {
          // Step 0: Check if OpenSpec CLI is installed
          progress.report({ message: '检查OpenSpec环境...' });
          let isOpenSpecInstalled = await this._requirementAnalysisService.isOpenSpecInstalled();
          
          if (!isOpenSpecInstalled) {
            this._logger.info('OpenSpec CLI not installed, prompting user to install');
            
            // 询问用户是否要安装OpenSpec
            const installChoice = await vscode.window.showWarningMessage(
              '未检测到OpenSpec CLI工具\n\n' +
              'OpenSpec用于生成规范化的需求文档和规格说明。\n\n' +
              '• 如果安装：将生成完整的OpenSpec文档\n' +
              '• 如果跳过：只进行AI需求分析（基础功能）\n\n' +
              '是否现在安装OpenSpec？',
              { modal: true },
              '安装OpenSpec',
              '跳过（仅AI分析）',
              '取消'
            );

            if (installChoice === '取消') {
              void vscode.window.showInformationMessage('已取消需求分析');
              return;
            } else if (installChoice === '安装OpenSpec') {
              // 提供安装指引
              const installMethod = await this.promptOpenSpecInstallation();
              
              if (installMethod === 'installed') {
                // 重新检测
                this._requirementAnalysisService.resetOpenSpecCache();
                isOpenSpecInstalled = await this._requirementAnalysisService.isOpenSpecInstalled();
                
                if (isOpenSpecInstalled) {
                  void vscode.window.showInformationMessage('✅ OpenSpec安装成功！');
                } else {
                  void vscode.window.showWarningMessage(
                    '未检测到OpenSpec，将继续执行基础分析。\n\n' +
                    '如果已安装，请重启Cursor或重新加载窗口。'
                  );
                }
              } else if (installMethod === 'cancelled') {
                void vscode.window.showInformationMessage('已取消需求分析');
                return;
              }
              // 如果是 'skip'，继续执行基础分析
            }
            // 如果选择"跳过"，isOpenSpecInstalled保持false，继续执行
          }

          // Step 1: Check if OpenSpec already exists (only if OpenSpec is installed)
          if (isOpenSpecInstalled) {
            progress.report({ message: '检查是否已有OpenSpec...' });
            const existingProposal = await this.checkExistingProposal(issue!, workspaceUri);
            
            if (existingProposal) {
            this._logger.info('Found existing OpenSpec proposal', { 
              changeId: existingProposal.changeId 
            });
            
            const action = await vscode.window.showInformationMessage(
              `发现已存在的OpenSpec提案\n\n变更ID: ${existingProposal.changeId}\n\n是否使用已有的提案？`,
              { modal: true },
              '使用已有提案',
              '重新生成',
              '查看提案'
            );

            if (action === '查看提案') {
              await this.openProposalFiles(existingProposal.proposalDir);
              // 再次询问
              const nextAction = await vscode.window.showInformationMessage(
                '提案已打开，是否继续使用？',
                '使用此提案',
                '重新生成'
              );
              
              if (nextAction === '使用此提案') {
                void vscode.window.showInformationMessage(
                  `使用已有OpenSpec提案: ${existingProposal.changeId}`,
                  '开始实施'
                ).then(async (action) => {
                  if (action === '开始实施') {
                    await vscode.commands.executeCommand('jiraGitlabHelper.generateCode', issue, existingProposal.proposal);
                  }
                });
                return;
              } else if (nextAction !== '重新生成') {
                return; // 取消
              }
            } else if (action === '使用已有提案') {
              void vscode.window.showInformationMessage(
                `使用已有OpenSpec提案: ${existingProposal.changeId}`,
                '查看提案',
                '开始实施'
              ).then(async (action) => {
                if (action === '查看提案') {
                  await this.openProposalFiles(existingProposal.proposalDir);
                } else if (action === '开始实施') {
                  await vscode.commands.executeCommand('jiraGitlabHelper.generateCode', issue, existingProposal.proposal);
                }
              });
              return;
            } else if (action !== '重新生成') {
              return; // 取消
            }
            
              // 如果选择"重新生成"，继续下面的流程
              this._logger.info('User chose to regenerate OpenSpec');
            }
          }

          // Step 2: Analyze requirement
          progress.report({ message: '正在分析需求内容...' });
          const analysis = await this._requirementAnalysisService.analyzeRequirement(issue!);

          // Show analysis results
          const proceed = await this.showAnalysisResults(issue!, analysis);
          if (!proceed) {
            return;
          }

          // If OpenSpec is not installed, stop here
          if (!isOpenSpecInstalled) {
            void vscode.window.showInformationMessage(
              `需求分析完成: ${issue!.key}\n\n建议功能: ${analysis.suggestedChangeId}\n复杂度: ${analysis.estimatedComplexity}\n\n提示: 安装OpenSpec CLI以生成完整的规格文档`
            );
            this._logger.info('Requirement analysis completed (without OpenSpec)', {
              issueKey: issue!.key,
            });
            return;
          }

          // Step 3: Generate OpenSpec proposal
          progress.report({ message: '正在生成OpenSpec提案...' });

          const proposal = await this._requirementAnalysisService.generateOpenSpecProposal(
            issue!,
            analysis,
            workspaceUri
          );

          // Step 4: Create OpenSpec files
          progress.report({ message: '正在创建OpenSpec文件...' });
          const proposalDir = await this._requirementAnalysisService.createOpenSpecFiles(
            proposal,
            workspaceUri
          );

          // Show success message
          void vscode.window
            .showInformationMessage(
              `OpenSpec提案已创建: ${proposal.changeId}`,
              '查看提案',
              '开始实施'
            )
            .then(async (action) => {
              if (action === '查看提案') {
                await this.openProposalFiles(proposalDir);
              } else if (action === '开始实施') {
                await vscode.commands.executeCommand('jiraGitlabHelper.generateCode', issue, proposal);
              }
            });

          this._logger.info('Requirement analysis completed', {
            issueKey: issue!.key,
            changeId: proposal.changeId,
          });
        }
      );
    } catch (error) {
      this._logger.error('Failed to analyze requirement', error);
      void vscode.window.showErrorMessage(`需求分析失败: ${String(error)}`);
    }
  }

  private async promptForJiraIssue(): Promise<IJiraIssue | undefined> {
    const input = await vscode.window.showInputBox({
      prompt: '请输入要分析的JIRA需求Key或完整URL',
      placeHolder: 'PROJ-123 或 https://jira.example.com/browse/PROJ-123',
      validateInput: (value) => {
        if (!value) {
          return 'JIRA问题Key不能为空';
        }
        // 支持 Issue Key 格式：PROJ-123
        if (/^[A-Z]+-\d+$/i.test(value)) {
          return null;
        }
        // 支持完整 URL 格式：https://jira.example.com/browse/PROJ-123
        if (/\/browse\/[A-Z]+-\d+$/i.test(value)) {
        return null;
        }
        return '请输入有效的JIRA问题Key (例如: PROJ-123) 或完整URL';
      },
    });

    if (!input) {
      return undefined;
    }

    // 从输入中提取 Issue Key
    let issueKey = input.trim();
    const urlMatch = issueKey.match(/\/browse\/([A-Z]+-\d+)$/i);
    if (urlMatch) {
      issueKey = urlMatch[1];
    }

    // Fetch issue from JIRA
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在获取JIRA问题 ${issueKey}...`,
        cancellable: false,
      },
      async () => {
        return await this._jiraService.getIssue(issueKey);
      }
    );
  }

  private async showAnalysisResults(issue: IJiraIssue, analysis: any): Promise<boolean> {
    const message = [
      `需求: ${issue.key} - ${issue.summary}`,
      ``,
      `复杂度: ${analysis.estimatedComplexity}`,
      `需要设计文档: ${analysis.needsDesignDoc ? '是' : '否'}`,
      ``,
      `建议的变更ID: ${analysis.suggestedChangeId}`,
    ].join('\n');

    const action = await vscode.window.showInformationMessage(
      '需求分析完成',
      {
        detail: message,
        modal: true,
      },
      '继续生成OpenSpec提案'
    );

    return action === '继续生成OpenSpec提案';
  }

  private async openProposalFiles(proposalDir: string): Promise<void> {
    try {
      const proposalFile = vscode.Uri.file(`${proposalDir}/proposal.md`);
      const tasksFile = vscode.Uri.file(`${proposalDir}/tasks.md`);

      await vscode.commands.executeCommand('vscode.open', proposalFile);
      await vscode.commands.executeCommand('vscode.open', tasksFile);
    } catch (error) {
      this._logger.error('Failed to open proposal files', error);
    }
  }

  private async checkExistingProposal(
    issue: IJiraIssue,
    workspaceUri: vscode.Uri
  ): Promise<{ changeId: string; proposalDir: string; proposal: any } | null> {
    try {
      const fs = require('fs/promises');
      const path = require('path');
      
      const openspecDir = path.join(workspaceUri.fsPath, 'openspec', 'changes');
      
      // 检查openspec/changes目录是否存在
      try {
        await fs.access(openspecDir);
      } catch {
        return null;
      }

      // 读取所有变更目录
      const changes = await fs.readdir(openspecDir);
      
      // 查找与当前issue相关的变更
      const issueKey = issue.key.toLowerCase();
      const matchingChanges = changes.filter((change: string) => 
        change.toLowerCase().includes(issueKey) && change !== 'archive'
      );

      if (matchingChanges.length === 0) {
        return null;
      }

      // 如果有多个匹配，选择最新的
      const changeId = matchingChanges[matchingChanges.length - 1];
      const proposalDir = path.join(openspecDir, changeId);
      
      // 验证必要文件存在
      const proposalFile = path.join(proposalDir, 'proposal.md');
      try {
        await fs.access(proposalFile);
      } catch {
        return null;
      }

      // 尝试加载proposal内容
      try {
        await fs.readFile(proposalFile, 'utf-8');
        // 简单验证文件可读即可，实际的proposal会在需要时重新构建
        const proposal = {
          changeId: changeId,
          // 这里保持简单，实际使用时会重新加载完整的proposal
        };

        return {
          changeId,
          proposalDir,
          proposal,
        };
      } catch (error) {
        this._logger.warn('Failed to load existing proposal', error);
        return null;
      }
    } catch (error) {
      this._logger.error('Error checking existing proposal', error);
      return null;
    }
  }

  private async promptOpenSpecInstallation(): Promise<'installed' | 'skip' | 'cancelled'> {
    const installOption = await vscode.window.showInformationMessage(
      '📦 安装 OpenSpec CLI\n\n' +
      'OpenSpec是一个规范化的需求和规格管理工具。\n\n' +
      '请选择安装方式：',
      { modal: true },
      '在终端中安装',
      '查看安装指南',
      '稍后安装'
    );

    if (!installOption || installOption === '稍后安装') {
      return 'skip';
    }

    if (installOption === '查看安装指南') {
      // 显示安装指南
      await vscode.window.showInformationMessage(
        '📝 OpenSpec 安装指南\n\n' +
        '方法1 - 使用npm (推荐):\n' +
        '  npm install -g openspec\n\n' +
        '方法2 - 使用yarn:\n' +
        '  yarn global add openspec\n\n' +
        '方法3 - 使用pnpm:\n' +
        '  pnpm add -g openspec\n\n' +
        '安装完成后，请重新加载窗口或重启Cursor。',
        { modal: true },
        '打开终端',
        '复制命令',
        '关闭'
      ).then(async (action) => {
        if (action === '打开终端') {
          const terminal = vscode.window.createTerminal('OpenSpec 安装');
          terminal.show();
          terminal.sendText('# 执行以下命令安装 OpenSpec:');
          terminal.sendText('npm install -g openspec');
        } else if (action === '复制命令') {
          await vscode.env.clipboard.writeText('npm install -g openspec');
          void vscode.window.showInformationMessage('✅ 命令已复制到剪贴板');
        }
      });
      
      return 'skip';
    }

    if (installOption === '在终端中安装') {
      // 在终端中执行安装命令
      const terminal = vscode.window.createTerminal('OpenSpec 安装');
      terminal.show();
      terminal.sendText('npm install -g openspec');
      
      const result = await vscode.window.showInformationMessage(
        '正在安装 OpenSpec...\n\n' +
        '请等待安装完成（通常需要1-2分钟）。\n\n' +
        '安装完成后请点击"已完成"按钮。',
        { modal: true },
        '已完成',
        '取消'
      );

      if (result === '已完成') {
        return 'installed';
      } else {
        return 'cancelled';
      }
    }

    return 'skip';
  }

  private getWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
  }
}

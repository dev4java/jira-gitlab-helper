import * as vscode from 'vscode';
import { RequirementAnalysisService } from '../services/requirement-analysis-service';
import { JiraService } from '../services/jira-service';
import { GitService } from '../services/git-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';
import { IRequirementAnalysis } from '../models/requirement-analysis';

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
        '确认'
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
          // Step 0: 检查OpenSpec环境
          progress.report({ message: '检查OpenSpec环境...' });
          
          // 1. 先检查项目是否已有OpenSpec目录结构
          const hasOpenSpecDir = await this._requirementAnalysisService.hasOpenSpecDirectory(workspaceUri);
          const isOpenSpecInitialized = hasOpenSpecDir && await this._requirementAnalysisService.isOpenSpecInitialized(workspaceUri);
          
          let isOpenSpecInstalled = false;
          
          if (isOpenSpecInitialized) {
            // 项目已有OpenSpec目录且已初始化，直接使用
            this._logger.info('Project has initialized OpenSpec directory, using it directly');
            isOpenSpecInstalled = true; // 标记为已安装，可以生成OpenSpec文档
          } else if (hasOpenSpecDir) {
            // 有目录但未初始化
            this._logger.info('Project has OpenSpec directory but not initialized');
            const initChoice = await vscode.window.showWarningMessage(
              '检测到openspec目录但未初始化\n\n' +
              '需要初始化OpenSpec项目才能生成规范化的需求文档。\n\n' +
              '是否初始化？',
              { modal: true },
              '初始化',
              '跳过（仅AI分析）'
            );
            
            if (!initChoice) {
              void vscode.window.showInformationMessage('已取消需求分析');
              return;
            } else if (initChoice === '初始化') {
              // 检查CLI是否安装
              isOpenSpecInstalled = await this._requirementAnalysisService.isOpenSpecInstalled();
              if (!isOpenSpecInstalled) {
                await vscode.window.showWarningMessage(
                  '需要先安装OpenSpec CLI才能初始化项目\n\n' +
                  '请运行：npm install -g openspec\n' +
                  '然后在项目目录运行：openspec init',
                  { modal: true },
                  '好的'
                );
                void vscode.window.showInformationMessage('已取消需求分析');
                return;
              }
              // TODO: 这里可以自动运行 openspec init
              void vscode.window.showInformationMessage('请在终端运行: openspec init');
            }
            // 选择跳过，继续基础分析
          } else {
            // 2. 项目没有OpenSpec目录，检查CLI是否安装
            this._logger.info('No OpenSpec directory, checking CLI installation');
            isOpenSpecInstalled = await this._requirementAnalysisService.isOpenSpecInstalled();
            
            if (!isOpenSpecInstalled) {
              // 3. CLI未安装，提示安装
              this._logger.info('OpenSpec CLI not installed, prompting user to install');
              
              const installChoice = await vscode.window.showWarningMessage(
                '未检测到OpenSpec CLI工具\n\n' +
                'OpenSpec用于生成规范化的需求文档和规格说明。\n\n' +
                '• 如果安装：将生成完整的OpenSpec文档（推荐）\n' +
                '• 如果跳过：只进行AI需求分析，不生成OpenSpec文档\n\n' +
                '注意：跳过OpenSpec不影响基础的AI分析和代码生成功能。\n\n' +
                '是否现在安装OpenSpec？',
                { modal: true },
                '安装OpenSpec',
                '跳过（仅AI分析）'
              );

              if (!installChoice) {
                void vscode.window.showInformationMessage('已取消需求分析');
                return;
              } else if (installChoice === '安装OpenSpec') {
                const installMethod = await this.promptOpenSpecInstallation();
                
                if (installMethod === 'installed') {
                  this._logger.info('Re-checking OpenSpec installation after user confirmation');
                  this._requirementAnalysisService.resetOpenSpecCache();
                  isOpenSpecInstalled = await this._requirementAnalysisService.isOpenSpecInstalled();
                  
                  if (isOpenSpecInstalled) {
                    void vscode.window.showInformationMessage('✅ OpenSpec CLI 安装成功！现在将生成完整的需求规格文档。');
                    this._logger.info('OpenSpec installation verified successfully');
                  } else {
                    const retryChoice = await vscode.window.showWarningMessage(
                      '⚠️ 未检测到OpenSpec CLI\n\n' +
                      '可能的原因：\n' +
                      '• 安装尚未完成或失败\n' +
                      '• 需要重新加载窗口\n' +
                      '• 环境变量未生效\n\n' +
                      '您可以：',
                      { modal: true },
                      '继续基础分析',
                      '重新加载窗口'
                    );
                    
                    if (retryChoice === '重新加载窗口') {
                      await vscode.commands.executeCommand('workbench.action.reloadWindow');
                      return;
                    } else if (!retryChoice) {
                      void vscode.window.showInformationMessage('已取消需求分析');
                      return;
                    }
                    this._logger.info('User chose to continue with basic analysis without OpenSpec');
                  }
                } else if (installMethod === 'cancelled') {
                  void vscode.window.showInformationMessage('已取消需求分析');
                  return;
                }
                if (installMethod === 'skip') {
                  this._logger.info('User skipped OpenSpec installation, continuing with basic analysis');
                }
              } else if (installChoice === '跳过（仅AI分析）') {
                this._logger.info('User chose to skip OpenSpec and use basic AI analysis only');
              }
            } else {
              // 4. CLI已安装但项目未初始化
              this._logger.info('OpenSpec CLI installed but project not initialized');
              const initChoice = await vscode.window.showInformationMessage(
                '检测到OpenSpec CLI但项目未初始化\n\n' +
                '是否初始化OpenSpec项目？',
                { modal: true },
                '初始化',
                '跳过（仅AI分析）'
              );
              
              if (!initChoice) {
                void vscode.window.showInformationMessage('已取消需求分析');
                return;
              } else if (initChoice === '初始化') {
                // TODO: 自动运行 openspec init
                void vscode.window.showInformationMessage('请在终端运行: openspec init');
                // 提示用户初始化后可能需要重新执行
              }
              // 选择跳过，继续基础分析
            }
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

          // If OpenSpec is not installed, save analysis to markdown and show to user
          if (!isOpenSpecInstalled) {
            this._logger.info('Requirement analysis completed without OpenSpec', {
              issueKey: issue!.key,
              changeId: analysis.suggestedChangeId,
              complexity: analysis.estimatedComplexity,
            });
            
            // Generate markdown content
            const analysisText = this.formatAnalysisForDisplay(issue!, analysis);
            
            // Create markdown file in workspace
            const workspaceUri = this.getWorkspaceUri();
            if (workspaceUri) {
              try {
                const analysisFileName = `${issue!.key}-需求分析.md`;
                const analysisFilePath = vscode.Uri.joinPath(workspaceUri, analysisFileName);
                
                // Write to file
                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(analysisFilePath, encoder.encode(analysisText));
                
                // Open the file
                const doc = await vscode.workspace.openTextDocument(analysisFilePath);
                await vscode.window.showTextDocument(doc, { preview: false });
                
                this._logger.info('Analysis saved to file', { path: analysisFilePath.fsPath });
              } catch (error) {
                this._logger.error('Failed to save analysis file', error);
                // Fallback: open in untitled document
                const doc = await vscode.workspace.openTextDocument({
                  content: analysisText,
                  language: 'markdown',
                });
                await vscode.window.showTextDocument(doc, { preview: false });
              }
            } else {
              // No workspace, open in untitled document
              const doc = await vscode.workspace.openTextDocument({
                content: analysisText,
                language: 'markdown',
              });
              await vscode.window.showTextDocument(doc, { preview: false });
            }
            
            // Show confirmation dialog
            const nextAction = await vscode.window.showInformationMessage(
              `✅ 需求分析完成: ${issue!.key}\n\n` +
              `建议功能: ${analysis.suggestedChangeId}\n` +
              `复杂度: ${analysis.estimatedComplexity}\n\n` +
              `分析结果已保存为Markdown文档并已打开。\n` +
              `您可以查看分析内容后继续进行代码生成。`,
              { modal: true },
              '继续生成代码'
            );
            
            if (nextAction === '继续生成代码') {
              // Use analysis results to generate code
              await vscode.commands.executeCommand('jiraGitlabHelper.generateCode', issue, analysis);
            }
            
            return;
          }

          // Show analysis results and ask for confirmation (only when OpenSpec is installed)
          const proceed = await this.showAnalysisResults(issue!, analysis);
          if (!proceed) {
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
        '复制命令',
        '打开终端'
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
        '已完成'
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

  private formatAnalysisForDisplay(issue: IJiraIssue, analysis: IRequirementAnalysis): string {
    const lines: string[] = [
      `# 需求分析报告: ${issue.key}`,
      '',
      `**标题**: ${issue.summary}`,
      `**类型**: ${issue.type}`,
      `**状态**: ${issue.status}`,
      `**优先级**: ${issue.priority}`,
      '',
      '---',
      '',
      `## 目标`,
      '',
      analysis.goal,
      '',
      '## 需求描述',
      '',
      analysis.description || issue.description,
      '',
      '## 建议功能模块',
      '',
      `**Change ID**: ${analysis.suggestedChangeId}`,
      `**复杂度**: ${analysis.estimatedComplexity}`,
      `**是否需要设计文档**: ${analysis.needsDesignDoc ? '是' : '否'}`,
      '',
      '## 验收标准',
      '',
    ];

    if (analysis.acceptanceCriteria && analysis.acceptanceCriteria.length > 0) {
      analysis.acceptanceCriteria.forEach((criterion: string, index: number) => {
        lines.push(`${index + 1}. ${criterion}`);
      });
    } else {
      lines.push('暂无验收标准');
    }

    lines.push('', '## 技术约束', '');

    if (analysis.technicalConstraints && analysis.technicalConstraints.length > 0) {
      analysis.technicalConstraints.forEach((constraint: string, index: number) => {
        lines.push(`${index + 1}. ${constraint}`);
      });
    } else {
      lines.push('暂无技术约束');
    }

    lines.push('', '## 依赖项', '');

    if (analysis.dependencies && analysis.dependencies.length > 0) {
      analysis.dependencies.forEach((dep: string) => {
        lines.push(`- ${dep}`);
      });
    } else {
      lines.push('无依赖项');
    }

    lines.push('', '## 影响的功能', '');

    if (analysis.affectedCapabilities && analysis.affectedCapabilities.length > 0) {
      analysis.affectedCapabilities.forEach((capability: string) => {
        lines.push(`- ${capability}`);
      });
    } else {
      lines.push('无影响的功能');
    }

    lines.push('', '---', '', '_此分析由 Jira GitLab Helper 基于 AI 生成_', '', '💡 **提示**: 安装 OpenSpec CLI 可以生成更详细的任务列表和规格文档。');

    return lines.join('\n');
  }
}

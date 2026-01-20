import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIService } from './ai-service';
import { OpenSpecGenerator } from './openspec-generator';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';
import { IRequirementAnalysis, IOpenSpecProposal } from '../models/requirement-analysis';
import { ConfluenceService } from './confluence-service';

export class RequirementAnalysisService {
  constructor(
    private readonly _aiService: AIService,
    private readonly _openspecGenerator: OpenSpecGenerator,
    private readonly _logger: Logger,
    private readonly _confluenceService?: ConfluenceService
  ) {}

  public async isOpenSpecInstalled(): Promise<boolean> {
    return await this._openspecGenerator.isOpenSpecInstalled();
  }

  public resetOpenSpecCache(): void {
    this._openspecGenerator.resetInstallationCache();
  }

  /**
   * 检查项目是否已有OpenSpec目录结构
   * @param workspaceUri 工作区URI
   * @returns 是否存在openspec目录
   */
  public async hasOpenSpecDirectory(workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      const openspecPath = path.join(workspaceUri.fsPath, 'openspec');
      const stats = await fs.stat(openspecPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 检查OpenSpec项目是否已初始化（存在关键文件）
   * @param workspaceUri 工作区URI
   * @returns 是否已初始化
   */
  public async isOpenSpecInitialized(workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      const projectMdPath = path.join(workspaceUri.fsPath, 'openspec', 'project.md');
      await fs.access(projectMdPath);
      return true;
    } catch {
      return false;
    }
  }

  public async analyzeRequirement(issue: IJiraIssue): Promise<IRequirementAnalysis> {
    try {
      this._logger.info('Analyzing requirement', { issueKey: issue.key });

      // 检测并获取Confluence内容
      let confluenceContent = '';
      if (this._confluenceService && issue.description) {
        try {
          const pages = await this._confluenceService.fetchConfluenceLinksContent(issue.description);
          if (pages.size > 0) {
            this._logger.info('Found Confluence pages in issue', { 
              issueKey: issue.key, 
              pageCount: pages.size 
            });
            confluenceContent = this._confluenceService.formatAllPagesContent(pages);
          }
        } catch (error) {
          this._logger.warn('Failed to fetch Confluence content, continuing without it', error);
          // 继续分析，不因为Confluence获取失败而中断
        }
      }

      const requirementText = this.formatRequirementText(issue, confluenceContent);
      const analysisJson = await this._aiService.analyzeRequirement(requirementText);

      // Parse AI response
      const analysis = this.parseAnalysisResponse(analysisJson, issue);

      this._logger.info('Requirement analysis completed', {
        issueKey: issue.key,
        complexity: analysis.estimatedComplexity,
        hasConfluenceContent: confluenceContent.length > 0,
      });

      return analysis;
    } catch (error) {
      this._logger.error('Failed to analyze requirement', error);
      throw new Error(`需求分析失败: ${String(error)}`);
    }
  }

  public async generateOpenSpecProposal(
    issue: IJiraIssue,
    analysis: IRequirementAnalysis,
    workspaceUri: vscode.Uri
  ): Promise<IOpenSpecProposal> {
    try {
      this._logger.info('Generating OpenSpec proposal', { issueKey: issue.key });

      const projectContext = await this.loadProjectContext(workspaceUri);
      const proposalJson = await this._aiService.generateOpenSpecProposal(
        JSON.stringify(analysis),
        projectContext
      );

      // Parse and enhance proposal
      const proposal = this.parseProposalResponse(proposalJson, issue, analysis);

      this._logger.info('OpenSpec proposal generated', { changeId: proposal.changeId });

      return proposal;
    } catch (error) {
      this._logger.error('Failed to generate OpenSpec proposal', error);
      throw new Error(`生成OpenSpec提案失败: ${String(error)}`);
    }
  }

  public async createOpenSpecFiles(
    proposal: IOpenSpecProposal,
    workspaceUri: vscode.Uri
  ): Promise<string> {
    try {
      const proposalDir = await this._openspecGenerator.generateProposal(proposal, workspaceUri);

      // Validate the generated proposal
      const isValid = await this._openspecGenerator.validateProposal(
        proposal.changeId,
        workspaceUri
      );

      if (!isValid) {
        this._logger.warn('Generated proposal failed validation', { changeId: proposal.changeId });
      }

      return proposalDir;
    } catch (error) {
      this._logger.error('Failed to create OpenSpec files', error);
      throw new Error(`创建OpenSpec文件失败: ${String(error)}`);
    }
  }

  private formatRequirementText(issue: IJiraIssue, confluenceContent?: string): string {
    const parts = [
      `JIRA问题: ${issue.key}`,
      `标题: ${issue.summary}`,
      `类型: ${issue.type}`,
      `优先级: ${issue.priority}`,
      '',
      '描述:',
      issue.description || '(无描述)',
      '',
      issue.labels && issue.labels.length > 0 ? `标签: ${issue.labels.join(', ')}` : '',
      issue.components && issue.components.length > 0 ? `组件: ${issue.components.join(', ')}` : '',
    ];

    // 添加Confluence内容
    if (confluenceContent) {
      parts.push('', confluenceContent);
    }

    return parts.filter(Boolean).join('\n');
  }

  private parseAnalysisResponse(analysisJson: string, issue: IJiraIssue): IRequirementAnalysis {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(analysisJson);

      return {
        goal: parsed.goal || issue.summary,
        description: parsed.description || issue.description,
        acceptanceCriteria: parsed.acceptanceCriteria || [],
        technicalConstraints: parsed.technicalConstraints || [],
        dependencies: parsed.dependencies || [],
        affectedCapabilities: parsed.affectedCapabilities || [],
        estimatedComplexity: parsed.estimatedComplexity || 'medium',
        needsDesignDoc: parsed.needsDesignDoc || false,
        suggestedChangeId: parsed.suggestedChangeId || this.generateChangeId(issue),
      };
    } catch {
      // Fallback if AI response is not valid JSON
      return {
        goal: issue.summary,
        description: issue.description,
        acceptanceCriteria: [],
        technicalConstraints: [],
        dependencies: [],
        affectedCapabilities: [],
        estimatedComplexity: 'medium',
        needsDesignDoc: false,
        suggestedChangeId: this.generateChangeId(issue),
      };
    }
  }

  private parseProposalResponse(
    proposalJson: string,
    issue: IJiraIssue,
    analysis: IRequirementAnalysis
  ): IOpenSpecProposal {
    try {
      const parsed = JSON.parse(proposalJson);
      
      // 验证parsed有必要的字段
      if (!parsed.capabilities || parsed.capabilities.length === 0) {
        this._logger.warn('AI返回的proposal缺少capabilities，使用fallback');
        return this.createFallbackProposal(issue, analysis);
      }
      
      return parsed;
    } catch (error) {
      this._logger.warn('解析AI返回的proposal失败，使用fallback', error);
      return this.createFallbackProposal(issue, analysis);
    }
  }

  private createFallbackProposal(issue: IJiraIssue, analysis: IRequirementAnalysis): IOpenSpecProposal {
    // 创建一个基本但完整的proposal结构
    const capabilityName = this.extractCapabilityName(issue.summary);
    
    return {
      changeId: analysis.suggestedChangeId,
      why: `实现JIRA问题 ${issue.key}: ${issue.summary}\n\n${analysis.description || ''}`,
      whatChanges: [
        analysis.goal || issue.summary,
        ...(analysis.acceptanceCriteria.slice(0, 3)),
      ],
      impact: {
        affectedSpecs: analysis.affectedCapabilities.length > 0 
          ? analysis.affectedCapabilities 
          : [`specs/${capabilityName}/spec.md`],
        affectedCode: [],
      },
      capabilities: [
        {
          name: capabilityName,
          specs: [
            {
              requirement: analysis.goal || issue.summary,
              description: analysis.description || issue.description || '待补充详细描述',
              scenarios: analysis.acceptanceCriteria.length > 0
                ? analysis.acceptanceCriteria.slice(0, 3).map((criteria, index) => ({
                    title: `验收场景 ${index + 1}`,
                    when: `用户执行相关操作`,
                    then: criteria,
                    and: [],
                  }))
                : [
                    {
                      title: '基本功能验证',
                      when: '用户使用此功能',
                      then: '系统应正常响应并满足需求',
                      and: [],
                    },
                  ],
            },
          ],
        },
      ],
      tasks: analysis.acceptanceCriteria.length > 0
        ? analysis.acceptanceCriteria.map((criteria, index) => ({
            id: `task-${index + 1}`,
            description: criteria,
            module: capabilityName,
            estimatedTime: '待评估',
            dependencies: [],
          }))
        : [
            {
              id: 'task-1',
              description: `实现${issue.summary}`,
              module: capabilityName,
              estimatedTime: '待评估',
              dependencies: [],
            },
          ],
    };
  }

  private extractCapabilityName(summary: string): string {
    // 从summary中提取一个合理的capability名称
    const name = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    
    return name || 'feature-implementation';
  }

  private generateChangeId(issue: IJiraIssue): string {
    // Generate a change ID from JIRA issue key and summary
    const summary = issue.summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    return `add-${issue.key.toLowerCase()}-${summary}`;
  }

  private async loadProjectContext(workspaceUri: vscode.Uri): Promise<string> {
    try {
      const projectMdPath = path.join(workspaceUri.fsPath, 'openspec', 'project.md');
      const content = await fs.readFile(projectMdPath, 'utf-8');
      return content;
    } catch {
      return '# Project Context\n\nNo project context available.';
    }
  }
}

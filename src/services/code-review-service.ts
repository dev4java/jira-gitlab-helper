import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitlabService } from './gitlab-service';
import { AIService } from './ai-service';
import { Logger } from '../utils/logger';
import { ICodeSuggestion } from '../models/gitlab-models';

export interface IClassifiedSuggestion extends ICodeSuggestion {
  category: 'simple' | 'complex' | 'manual';
  canAutoApply: boolean;
  confidence: number;
}

export class CodeReviewService {
  constructor(
    private readonly _gitlabService: GitlabService,
    private readonly _aiService: AIService,
    private readonly _logger: Logger
  ) {}

  public async getCodeSuggestions(mrIid: number, projectId?: string): Promise<ICodeSuggestion[]> {
    try {
      this._logger.info('Getting code suggestions', { mrIid });
      const suggestions = await this._gitlabService.getCodeSuggestions(mrIid, projectId);
      this._logger.info('Code suggestions retrieved', { count: suggestions.length });
      return suggestions;
    } catch (error) {
      this._logger.error('Failed to get code suggestions', error);
      throw new Error(`获取Code Review建议失败: ${String(error)}`);
    }
  }

  public async classifySuggestions(
    suggestions: ICodeSuggestion[]
  ): Promise<IClassifiedSuggestion[]> {
    try {
      this._logger.info('Classifying suggestions', { count: suggestions.length });

      const classified: IClassifiedSuggestion[] = [];

      for (const suggestion of suggestions) {
        const classification = this.classifySuggestion(suggestion);
        classified.push({
          ...suggestion,
          ...classification,
        });
      }

      this._logger.info('Suggestions classified', {
        simple: classified.filter((s) => s.category === 'simple').length,
        complex: classified.filter((s) => s.category === 'complex').length,
        manual: classified.filter((s) => s.category === 'manual').length,
      });

      return classified;
    } catch (error) {
      this._logger.error('Failed to classify suggestions', error);
      throw new Error(`分类建议失败: ${String(error)}`);
    }
  }

  private classifySuggestion(suggestion: ICodeSuggestion): {
    category: 'simple' | 'complex' | 'manual';
    canAutoApply: boolean;
    confidence: number;
  } {
    const body = suggestion.body.toLowerCase();

    // Simple formatting issues
    if (
      body.includes('格式') ||
      body.includes('formatting') ||
      body.includes('indentation') ||
      body.includes('缩进') ||
      body.includes('空格') ||
      body.includes('换行')
    ) {
      return {
        category: 'simple',
        canAutoApply: true,
        confidence: 0.9,
      };
    }

    // Simple naming issues
    if (
      body.includes('命名') ||
      body.includes('rename') ||
      body.includes('variable name') ||
      body.includes('变量名')
    ) {
      return {
        category: 'simple',
        canAutoApply: false, // Requires context
        confidence: 0.7,
      };
    }

    // Logic changes - complex
    if (
      body.includes('逻辑') ||
      body.includes('logic') ||
      body.includes('algorithm') ||
      body.includes('算法') ||
      body.includes('重构') ||
      body.includes('refactor')
    ) {
      return {
        category: 'complex',
        canAutoApply: false,
        confidence: 0.8,
      };
    }

    // Security or performance - manual review
    if (
      body.includes('安全') ||
      body.includes('security') ||
      body.includes('性能') ||
      body.includes('performance') ||
      body.includes('漏洞') ||
      body.includes('vulnerability')
    ) {
      return {
        category: 'manual',
        canAutoApply: false,
        confidence: 0.95,
      };
    }

    // Default to complex
    return {
      category: 'complex',
      canAutoApply: false,
      confidence: 0.5,
    };
  }

  public async applySimpleSuggestion(
    suggestion: IClassifiedSuggestion,
    workspaceUri: vscode.Uri
  ): Promise<boolean> {
    try {
      this._logger.info('Applying simple suggestion', { id: suggestion.id });

      if (!suggestion.canAutoApply) {
        this._logger.warn('Suggestion cannot be auto-applied', { id: suggestion.id });
        return false;
      }

      const filePath = path.join(workspaceUri.fsPath, suggestion.filePath);

      // Read file
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Apply suggestion based on line number
      if (suggestion.newLine && suggestion.newLine <= lines.length) {
        // Use AI to generate the fix
        const client = await this._aiService.getClient();
        const context = `文件: ${suggestion.filePath}
行号: ${suggestion.newLine}
原代码: ${lines[suggestion.newLine - 1]}
建议: ${suggestion.body}

请提供修复后的代码(仅返回修复后的单行代码,不要额外说明)。`;

        const response = await client.chat(
          [{ role: 'user', content: context }],
          '你是一个代码修复专家。'
        );

        const fixedLine = response.content.trim();

        // Apply fix
        lines[suggestion.newLine - 1] = fixedLine;
        await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

        this._logger.info('Simple suggestion applied', { id: suggestion.id });
        return true;
      }

      return false;
    } catch (error) {
      this._logger.error('Failed to apply simple suggestion', error);
      return false;
    }
  }

  public async applyBatchSuggestions(
    suggestions: IClassifiedSuggestion[],
    workspaceUri: vscode.Uri
  ): Promise<{ applied: number; failed: number }> {
    try {
      this._logger.info('Applying batch suggestions', { count: suggestions.length });

      let applied = 0;
      let failed = 0;

      for (const suggestion of suggestions) {
        if (suggestion.canAutoApply) {
          const success = await this.applySimpleSuggestion(suggestion, workspaceUri);
          if (success) {
            applied++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      }

      this._logger.info('Batch suggestions applied', { applied, failed });
      return { applied, failed };
    } catch (error) {
      this._logger.error('Failed to apply batch suggestions', error);
      throw new Error(`批量应用建议失败: ${String(error)}`);
    }
  }

  public async generateSuggestionResponse(suggestion: IClassifiedSuggestion): Promise<string> {
    try {
      const client = await this._aiService.getClient();

      const prompt = `Code Review建议:
${suggestion.body}

文件: ${suggestion.filePath}
行号: ${suggestion.newLine || suggestion.oldLine || 'N/A'}

请生成一个专业的回复,说明:
1. 是否接受此建议
2. 如果接受,说明如何修复
3. 如果不接受,说明理由

请用中文回复,保持专业和礼貌。`;

      const response = await client.chat(
        [{ role: 'user', content: prompt }],
        '你是一个专业的代码审查者。'
      );

      return response.content;
    } catch (error) {
      this._logger.error('Failed to generate suggestion response', error);
      return '感谢您的建议,我会仔细考虑。';
    }
  }
}

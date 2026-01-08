import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIService } from './ai-service';
import { Logger } from '../utils/logger';
import { IJiraIssue } from '../models/jira-issue';
import {
  IBugInfo,
  IBugAnalysis,
  IBugFixSuggestion,
  ICodeSearchResult,
  IStackTraceFrame,
  ICodeChange,
} from '../models/bug-analysis';

export class BugAnalysisService {
  constructor(
    private readonly _aiService: AIService,
    private readonly _logger: Logger
  ) {}

  public async extractBugInfo(issue: IJiraIssue): Promise<IBugInfo> {
    try {
      this._logger.info('Extracting bug information', { issueKey: issue.key });

      const bugInfo: IBugInfo = {
        issueKey: issue.key,
        summary: issue.summary,
        description: issue.description,
        stepsToReproduce: this.extractStepsToReproduce(issue.description),
        expectedBehavior: this.extractExpectedBehavior(issue.description),
        actualBehavior: this.extractActualBehavior(issue.description),
        environment: this.extractEnvironment(issue.description),
        stackTrace: this.extractStackTrace(issue.description),
        severity: issue.priority,
      };

      this._logger.info('Bug information extracted', {
        issueKey: issue.key,
        hasStackTrace: !!bugInfo.stackTrace,
      });

      return bugInfo;
    } catch (error) {
      this._logger.error('Failed to extract bug info', error);
      throw new Error(`提取Bug信息失败: ${String(error)}`);
    }
  }

  public async analyzeBug(bugInfo: IBugInfo, workspaceUri: vscode.Uri): Promise<IBugAnalysis> {
    try {
      this._logger.info('Analyzing bug', { issueKey: bugInfo.issueKey });

      // Search for related code
      const searchResults = await this.searchRelatedCode(bugInfo, workspaceUri);

      // Parse stack trace if available
      const stackTraceLocations = bugInfo.stackTrace
        ? await this.parseStackTrace(bugInfo.stackTrace, workspaceUri)
        : [];

      // Analyze code changes
      const relatedChanges = await this.analyzeCodeChanges(
        [...searchResults, ...stackTraceLocations],
        workspaceUri
      );

      // Use AI to analyze possible causes
      const aiAnalysis = await this.performAIAnalysis(bugInfo, searchResults, relatedChanges);

      const analysis: IBugAnalysis = {
        possibleCauses: aiAnalysis.possibleCauses || [],
        suggestedLocations: [...searchResults, ...stackTraceLocations],
        relatedChanges,
        analysisNotes: aiAnalysis.analysisNotes || [],
      };

      this._logger.info('Bug analysis completed', {
        issueKey: bugInfo.issueKey,
        causesFound: analysis.possibleCauses.length,
      });

      return analysis;
    } catch (error) {
      this._logger.error('Failed to analyze bug', error);
      throw new Error(`分析Bug失败: ${String(error)}`);
    }
  }

  public async generateFixSuggestion(
    bugInfo: IBugInfo,
    analysis: IBugAnalysis
  ): Promise<IBugFixSuggestion> {
    try {
      this._logger.info('Generating fix suggestion', { issueKey: bugInfo.issueKey });

      const context = this.buildAnalysisContext(bugInfo, analysis);
      const client = await this._aiService.getClient();

      const prompt = `基于以下Bug分析,生成修复建议:\n\n${context}\n\n请提供:
1. 根本原因分析
2. 修复步骤
3. 代码修改建议
4. 测试建议
5. 潜在风险

以JSON格式返回。`;

      const response = await client.chat(
        [{ role: 'user', content: prompt }],
        '你是一个Bug修复专家。'
      );

      const suggestion = this.parseFixSuggestion(response.content, analysis);

      this._logger.info('Fix suggestion generated', {
        issueKey: bugInfo.issueKey,
        type: suggestion.type,
      });

      return suggestion;
    } catch (error) {
      this._logger.error('Failed to generate fix suggestion', error);
      throw new Error(`生成修复建议失败: ${String(error)}`);
    }
  }

  private extractStepsToReproduce(description: string): string[] {
    const steps: string[] = [];
    const lines = description.split('\n');

    let inStepsSection = false;
    for (const line of lines) {
      if (
        line.toLowerCase().includes('重现步骤') ||
        line.toLowerCase().includes('steps to reproduce') ||
        line.toLowerCase().includes('复现步骤')
      ) {
        inStepsSection = true;
        continue;
      }

      if (inStepsSection) {
        if (line.trim().startsWith('-') || line.trim().match(/^\d+\./)) {
          steps.push(line.trim());
        } else if (line.trim() && !line.startsWith('#')) {
          // Stop if we hit another section
          if (
            line.toLowerCase().includes('expected') ||
            line.toLowerCase().includes('actual') ||
            line.toLowerCase().includes('期望')
          ) {
            break;
          }
        }
      }
    }

    return steps;
  }

  private extractExpectedBehavior(description: string): string {
    const match = description.match(
      /(?:期望行为|expected behavior|expected)[：:]([\s\S]*?)(?:\n\n|期望|actual|实际|$)/i
    );
    return match ? match[1].trim() : '';
  }

  private extractActualBehavior(description: string): string {
    const match = description.match(
      /(?:实际行为|actual behavior|actual)[：:]([\s\S]*?)(?:\n\n|堆栈|stack|环境|$)/i
    );
    return match ? match[1].trim() : '';
  }

  private extractEnvironment(description: string): string {
    const match = description.match(/(?:环境|environment)[：:]([\s\S]*?)(?:\n\n|$)/i);
    return match ? match[1].trim() : '';
  }

  private extractStackTrace(description: string): string | undefined {
    const match = description.match(
      /(?:堆栈跟踪|stack trace|stacktrace)[：:]?\s*([\s\S]*?)(?:\n\n##|$)/i
    );
    return match ? match[1].trim() : undefined;
  }

  private async searchRelatedCode(
    bugInfo: IBugInfo,
    workspaceUri: vscode.Uri
  ): Promise<ICodeSearchResult[]> {
    try {
      const keywords = this.extractKeywords(bugInfo);
      const results: ICodeSearchResult[] = [];

      for (const keyword of keywords) {
        const searchResults = await vscode.workspace.findFiles(
          '**/*.{ts,js,tsx,jsx,java,py}',
          '**/node_modules/**'
        );

        for (const fileUri of searchResults.slice(0, 50)) {
          try {
            const content = await fs.readFile(fileUri.fsPath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
              if (line.toLowerCase().includes(keyword.toLowerCase())) {
                const relativePath = path.relative(workspaceUri.fsPath, fileUri.fsPath);
                results.push({
                  filePath: relativePath,
                  lineNumber: index + 1,
                  content: line.trim(),
                  relevanceScore: this.calculateRelevance(line, keywords),
                  context: {
                    before: lines.slice(Math.max(0, index - 2), index),
                    after: lines.slice(index + 1, Math.min(lines.length, index + 3)),
                  },
                });
              }
            });
          } catch (error) {
            // Skip files that can't be read
            continue;
          }
        }
      }

      // Sort by relevance and return top results
      return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20);
    } catch (error) {
      this._logger.error('Failed to search related code', error);
      return [];
    }
  }

  private extractKeywords(bugInfo: IBugInfo): string[] {
    const text = `${bugInfo.summary} ${bugInfo.description}`;
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3);

    // Remove common words
    const commonWords = ['the', 'and', 'for', 'with', 'this', 'that', 'when', 'then'];
    return [...new Set(words)].filter((word) => !commonWords.includes(word)).slice(0, 10);
  }

  private calculateRelevance(line: string, keywords: string[]): number {
    let score = 0;
    const lowerLine = line.toLowerCase();

    for (const keyword of keywords) {
      if (lowerLine.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    return score;
  }

  private async parseStackTrace(
    stackTrace: string,
    workspaceUri: vscode.Uri
  ): Promise<ICodeSearchResult[]> {
    try {
      const frames = this.extractStackTraceFrames(stackTrace);
      const results: ICodeSearchResult[] = [];

      for (const frame of frames) {
        const filePath = await this.findFileInWorkspace(frame.fileName, workspaceUri);
        if (filePath) {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          const lineIndex = frame.lineNumber - 1;

          if (lineIndex >= 0 && lineIndex < lines.length) {
            results.push({
              filePath: path.relative(workspaceUri.fsPath, filePath),
              lineNumber: frame.lineNumber,
              content: lines[lineIndex].trim(),
              relevanceScore: 10, // Stack trace locations are highly relevant
              context: {
                before: lines.slice(Math.max(0, lineIndex - 5), lineIndex),
                after: lines.slice(lineIndex + 1, Math.min(lines.length, lineIndex + 6)),
              },
            });
          }
        }
      }

      return results;
    } catch (error) {
      this._logger.error('Failed to parse stack trace', error);
      return [];
    }
  }

  private extractStackTraceFrames(stackTrace: string): IStackTraceFrame[] {
    const frames: IStackTraceFrame[] = [];
    const lines = stackTrace.split('\n');

    for (const line of lines) {
      // Java stack trace format: at package.Class.method(File.java:123)
      const javaMatch = line.match(/at\s+(.+)\((.+):(\d+)\)/);
      if (javaMatch) {
        const [, fullMethod, fileName, lineNumber] = javaMatch;
        frames.push({
          fileName,
          lineNumber: parseInt(lineNumber, 10),
          functionName: fullMethod.split('.').pop() || fullMethod,
          className: fullMethod.substring(0, fullMethod.lastIndexOf('.')),
        });
        continue;
      }

      // JavaScript stack trace format: at functionName (file.js:123:45)
      const jsMatch = line.match(/at\s+(.+?)\s+\((.+):(\d+):\d+\)/);
      if (jsMatch) {
        const [, functionName, fileName, lineNumber] = jsMatch;
        frames.push({
          fileName: path.basename(fileName),
          lineNumber: parseInt(lineNumber, 10),
          functionName,
        });
      }
    }

    return frames;
  }

  private async findFileInWorkspace(
    fileName: string,
    _workspaceUri: vscode.Uri
  ): Promise<string | null> {
    try {
      const files = await vscode.workspace.findFiles(`**/${fileName}`);
      return files.length > 0 ? files[0].fsPath : null;
    } catch {
      return null;
    }
  }

  private async analyzeCodeChanges(
    locations: ICodeSearchResult[],
    workspaceUri: vscode.Uri
  ): Promise<ICodeChange[]> {
    try {
      const changes: ICodeChange[] = [];
      const analyzedFiles = new Set<string>();

      for (const location of locations.slice(0, 5)) {
        const filePath = path.join(workspaceUri.fsPath, location.filePath);
        if (analyzedFiles.has(filePath)) {
          continue;
        }
        analyzedFiles.add(filePath);

        // Get recent commits for this file using exec
        const { execAsync } = await import('child_process').then((cp) => ({
          execAsync: require('util').promisify(cp.exec),
        }));
        const { stdout } = await execAsync(
          `git log -10 --pretty=format:"%H|%an|%ad|%s" --date=short -- "${location.filePath}"`,
          { cwd: workspaceUri.fsPath }
        );

        const commits = stdout.split('\n').filter(Boolean);
        for (const commit of commits) {
          const [hash, author, date, message] = commit.split('|');
          changes.push({
            commitHash: hash,
            author,
            date,
            message,
            files: [location.filePath],
            suspicious: this.isSuspiciousCommit(message),
            reason: this.isSuspiciousCommit(message) ? '提交消息包含可疑关键词' : undefined,
          });
        }
      }

      return changes;
    } catch (error) {
      this._logger.error('Failed to analyze code changes', error);
      return [];
    }
  }

  private isSuspiciousCommit(message: string): boolean {
    const suspiciousKeywords = ['fix', 'bug', 'issue', '修复', '问题', 'hotfix', 'patch'];
    const lowerMessage = message.toLowerCase();
    return suspiciousKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  private async performAIAnalysis(
    bugInfo: IBugInfo,
    searchResults: ICodeSearchResult[],
    relatedChanges: ICodeChange[]
  ): Promise<{ possibleCauses: any[]; analysisNotes: string[] }> {
    try {
      const client = await this._aiService.getClient();

      const context = `Bug信息:
标题: ${bugInfo.summary}
描述: ${bugInfo.description}

相关代码位置 (${searchResults.length}个):
${searchResults
  .slice(0, 5)
  .map((r) => `- ${r.filePath}:${r.lineNumber}`)
  .join('\n')}

最近相关变更 (${relatedChanges.length}个):
${relatedChanges
  .slice(0, 3)
  .map((c) => `- ${c.date} ${c.author}: ${c.message}`)
  .join('\n')}`;

      const response = await client.chat(
        [
          {
            role: 'user',
            content: `请分析以下Bug并提供可能的原因:\n\n${context}`,
          },
        ],
        '你是一个Bug分析专家。'
      );

      return {
        possibleCauses: [],
        analysisNotes: [response.content],
      };
    } catch (error) {
      this._logger.error('AI analysis failed', error);
      return {
        possibleCauses: [],
        analysisNotes: ['AI分析暂时不可用'],
      };
    }
  }

  private buildAnalysisContext(bugInfo: IBugInfo, analysis: IBugAnalysis): string {
    return `Bug: ${bugInfo.issueKey} - ${bugInfo.summary}

可能原因:
${analysis.possibleCauses.map((c, i) => `${i + 1}. ${c.description} (置信度: ${c.confidence}%)`).join('\n')}

建议检查位置:
${analysis.suggestedLocations
  .slice(0, 5)
  .map((l) => `- ${l.filePath}:${l.lineNumber}`)
  .join('\n')}

相关变更:
${analysis.relatedChanges
  .slice(0, 3)
  .map((c) => `- ${c.commitHash.substring(0, 7)}: ${c.message}`)
  .join('\n')}`;
  }

  private parseFixSuggestion(aiResponse: string, analysis: IBugAnalysis): IBugFixSuggestion {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        type: parsed.type || 'complex',
        description: parsed.description || '',
        rootCause: parsed.rootCause || '',
        fixSteps: parsed.fixSteps || [],
        codeChanges: parsed.codeChanges,
        testSuggestions: parsed.testSuggestions || [],
        risks: parsed.risks || [],
      };
    } catch {
      // Fallback
      return {
        type: 'complex',
        description: aiResponse,
        rootCause: analysis.possibleCauses[0]?.description || 'Unknown',
        fixSteps: ['请手动分析并修复Bug'],
        testSuggestions: ['添加相关测试用例'],
        risks: ['需要人工审查'],
      };
    }
  }
}

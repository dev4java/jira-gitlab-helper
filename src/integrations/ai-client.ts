import axios, { AxiosInstance } from 'axios';
import { Logger } from '../utils/logger';

export interface IAIClientConfig {
  provider: 'mcp' | 'openai' | 'custom';
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export interface IAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IAIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class AIClient {
  private readonly _logger: Logger;
  private _axiosInstance?: AxiosInstance;
  private readonly _config: IAIClientConfig;

  constructor(config: IAIClientConfig, logger: Logger) {
    this._config = config;
    this._logger = logger;

    if (config.provider === 'openai' || config.provider === 'custom') {
      this.initializeHttpClient();
    }

    this._logger.info('AI client initialized', { provider: config.provider });
  }

  private initializeHttpClient(): void {
    const endpoint = this._config.endpoint || 'https://api.openai.com/v1';

    this._axiosInstance = axios.create({
      baseURL: endpoint,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this._config.apiKey || ''}`,
      },
      timeout: 60000,
    });
  }

  public async chat(messages: IAIMessage[], systemPrompt?: string): Promise<IAIResponse> {
    try {
      this._logger.debug('Sending AI chat request', { messageCount: messages.length });

      if (this._config.provider === 'mcp') {
        return await this.chatWithMCP(messages, systemPrompt);
      } else {
        return await this.chatWithOpenAI(messages, systemPrompt);
      }
    } catch (error) {
      this._logger.error('AI chat request failed', error);
      throw new Error(`AI请求失败: ${String(error)}`);
    }
  }

  private async chatWithMCP(messages: IAIMessage[], systemPrompt?: string): Promise<IAIResponse> {
    // TODO: Implement MCP protocol integration
    // For now, return a placeholder response
    this._logger.warn('MCP integration not yet implemented, using placeholder');

    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    return {
      content: `[MCP Placeholder] Received ${allMessages.length} messages. MCP integration pending.`,
    };
  }

  private async chatWithOpenAI(
    messages: IAIMessage[],
    systemPrompt?: string
  ): Promise<IAIResponse> {
    if (!this._axiosInstance) {
      throw new Error('HTTP client not initialized');
    }

    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const response = await this._axiosInstance.post('/chat/completions', {
      model: this._config.model || 'gpt-4',
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 4000,
    });

    return {
      content: response.data.choices[0].message.content,
      usage: {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
      },
    };
  }

  public async analyzeRequirement(requirementText: string): Promise<string> {
    const systemPrompt = `你是一个需求分析专家。请分析以下JIRA需求,提取关键信息:
1. 功能目标
2. 验收标准
3. 技术约束
4. 依赖关系
5. 影响的能力模块

请以JSON格式返回分析结果。`;

    const messages: IAIMessage[] = [
      {
        role: 'user',
        content: `请分析以下需求:\n\n${requirementText}`,
      },
    ];

    const response = await this.chat(messages, systemPrompt);
    return response.content;
  }

  public async generateOpenSpecProposal(
    requirementAnalysis: string,
    projectContext: string
  ): Promise<string> {
    const systemPrompt = `你是一个OpenSpec专家。根据需求分析和项目上下文,生成OpenSpec变更提案。

提案应包括:
1. 变更ID (kebab-case, verb-led)
2. Why (为什么需要这个变更)
3. What Changes (具体变更内容)
4. Impact (影响范围)
5. Spec deltas (使用ADDED/MODIFIED/REMOVED格式)
6. Tasks (实施任务列表)
7. Design doc (如果需要)

请以结构化JSON格式返回。`;

    const messages: IAIMessage[] = [
      {
        role: 'user',
        content: `需求分析:\n${requirementAnalysis}\n\n项目上下文:\n${projectContext}`,
      },
    ];

    const response = await this.chat(messages, systemPrompt);
    return response.content;
  }

  public async generateTasks(requirementAnalysis: string): Promise<string> {
    const systemPrompt = `你是一个任务规划专家。根据需求分析,生成详细的实施任务列表。

任务应该:
1. 按逻辑顺序排列
2. 包含明确的描述
3. 标识依赖关系
4. 估算工作量

请以JSON数组格式返回任务列表。`;

    const messages: IAIMessage[] = [
      {
        role: 'user',
        content: `请为以下需求生成任务列表:\n\n${requirementAnalysis}`,
      },
    ];

    const response = await this.chat(messages, systemPrompt);
    return response.content;
  }
}

import { AIClient, IAIClientConfig } from '../integrations/ai-client';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';

export class AIService {
  private _client: AIClient | null = null;

  constructor(
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async getClient(): Promise<AIClient> {
    if (!this._client) {
      await this.initializeClient();
    }

    if (!this._client) {
      throw new Error('AI客户端未初始化');
    }

    return this._client;
  }

  private async initializeClient(): Promise<void> {
    try {
      const config = this._configManager.getAIConfig();
      const apiKey = await this._configManager.getAIApiKey();

      const clientConfig: IAIClientConfig = {
        provider: config.provider,
        endpoint: config.endpoint,
        apiKey,
        model: config.model,
      };

      this._client = new AIClient(clientConfig, this._logger);
      this._logger.info('AI service initialized');
    } catch (error) {
      this._logger.error('Failed to initialize AI client', error);
      throw error;
    }
  }

  public async analyzeRequirement(requirementText: string): Promise<string> {
    const client = await this.getClient();
    return await client.analyzeRequirement(requirementText);
  }

  public async generateOpenSpecProposal(
    requirementAnalysis: string,
    projectContext: string
  ): Promise<string> {
    const client = await this.getClient();
    return await client.generateOpenSpecProposal(requirementAnalysis, projectContext);
  }

  public async generateTasks(requirementAnalysis: string): Promise<string> {
    const client = await this.getClient();
    return await client.generateTasks(requirementAnalysis);
  }

  public resetClient(): void {
    this._client = null;
    this._logger.info('AI client reset');
  }
}

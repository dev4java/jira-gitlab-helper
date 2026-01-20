import * as vscode from 'vscode';
import { ConfigurationManager } from './config/configuration-manager';
import { Logger } from './utils/logger';
import { ConfigureJiraCommand } from './commands/configure-jira-command';
import { ConfigureGitlabCommand } from './commands/configure-gitlab-command';
import { OpenConfigPanelCommand } from './commands/open-config-panel-command';
import { FetchJiraIssueCommand } from './commands/fetch-jira-issue-command';
import { FetchJiraBugListCommand } from './commands/fetch-jira-bug-list-command';
import { AnalyzeRequirementCommand } from './commands/analyze-requirement-command';
import { AnalyzeBugCommand } from './commands/analyze-bug-command';
import { GenerateCodeCommand } from './commands/generate-code-command';
import { CommitCodeCommand } from './commands/commit-code-command';
import { CreateMRCommand } from './commands/create-mr-command';
import { HandleCRSuggestionsCommand } from './commands/handle-cr-suggestions-command';
import { JiraService } from './services/jira-service';
import { GitlabService } from './services/gitlab-service';
import { GitService } from './services/git-service';
import { AIService } from './services/ai-service';
import { ConfluenceService } from './services/confluence-service';
import { ConfluenceClient } from './integrations/confluence-client';
import { RequirementAnalysisService } from './services/requirement-analysis-service';
import { BugAnalysisService } from './services/bug-analysis-service';
import { CodeGenerationService } from './services/code-generation-service';
import { CodeReviewService } from './services/code-review-service';
import { OpenSpecGenerator } from './services/openspec-generator';
import { JiraIssuesViewProvider } from './ui/views/jira-issues-view-provider';
import { GitlabMrViewProvider } from './ui/views/gitlab-mr-view-provider';
import { IssueDetailsPanel } from './ui/webviews/issue-details-panel';
import { JiraChatParticipant } from './chat/jira-chat-participant';
import { GitlabChatParticipant } from './chat/gitlab-chat-participant';

let logger: Logger;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger = new Logger(context);
  logger.info('Jira GitLab Helper extension is now active');

  // Initialize configuration manager
  const configManager = new ConfigurationManager(context);

  // Initialize core services
  const jiraService = new JiraService(configManager, logger);
  const gitlabService = new GitlabService(configManager, logger);
  const gitService = new GitService(logger);
  const aiService = new AIService(configManager, logger);
  
  // Initialize Confluence service (optional)
  let confluenceService: ConfluenceService | undefined;
  try {
    const confluenceConfig = configManager.getConfluenceConfig();
    if (confluenceConfig.enabled && confluenceConfig.serverUrl) {
      const confluenceCredential = await configManager.getConfluenceCredential();
      const confluenceClient = new ConfluenceClient(
        {
          serverUrl: confluenceConfig.serverUrl,
          username: confluenceConfig.username,
          credential: confluenceCredential,
          authType: confluenceConfig.authType,
        },
        logger
      );
      confluenceService = new ConfluenceService(confluenceClient, logger);
      logger.info('Confluence service initialized');
    }
  } catch (error) {
    logger.warn('Failed to initialize Confluence service', error);
  }

  // Initialize feature services
  const openspecGenerator = new OpenSpecGenerator(logger);
  const requirementAnalysisService = new RequirementAnalysisService(
    aiService,
    openspecGenerator,
    logger,
    confluenceService
  );
  const bugAnalysisService = new BugAnalysisService(aiService, logger);
  const codeGenerationService = new CodeGenerationService(aiService, logger);
  const codeReviewService = new CodeReviewService(gitlabService, aiService, logger);

  // Initialize views
  const jiraIssuesViewProvider = new JiraIssuesViewProvider(jiraService, logger);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('jiraGitlabHelperJiraIssues', jiraIssuesViewProvider)
  );

  const gitlabMrViewProvider = new GitlabMrViewProvider(gitlabService, configManager, logger);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('jiraGitlabHelperTasks', gitlabMrViewProvider)
  );

  // Check configuration and prompt to open config panel if not configured
  void checkAndPromptConfiguration(context, configManager, logger);

  // Try to register chat participants if API is available
  try {
    if (vscode.chat) {
      const jiraChatParticipant = new JiraChatParticipant(
        jiraService,
        requirementAnalysisService
      );
      const gitlabChatParticipant = new GitlabChatParticipant(gitlabService);
      context.subscriptions.push(jiraChatParticipant, gitlabChatParticipant);
      logger.info('Chat participants registered successfully');
    } else {
      logger.info('Chat API not available in this VSCode version');
    }
  } catch (error) {
    logger.warn('Failed to register chat participants', error);
  }

  // Register commands
  registerCommands(
    context,
    context.extensionUri,
    configManager,
    jiraService,
    gitlabService,
    gitService,
    requirementAnalysisService,
    bugAnalysisService,
    codeGenerationService,
    codeReviewService,
    jiraIssuesViewProvider,
    gitlabMrViewProvider,
    logger
  );

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
  if (!hasShownWelcome) {
    void showWelcomeMessage(context);
  }

  logger.info('Jira GitLab Helper extension activation completed');
}

export function deactivate(): void {
  if (logger) {
    logger.info('Jira GitLab Helper extension is now deactivated');
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  extensionUri: vscode.Uri,
  configManager: ConfigurationManager,
  jiraService: JiraService,
  gitlabService: GitlabService,
  gitService: GitService,
  requirementAnalysisService: RequirementAnalysisService,
  bugAnalysisService: BugAnalysisService,
  codeGenerationService: CodeGenerationService,
  codeReviewService: CodeReviewService,
  jiraIssuesViewProvider: JiraIssuesViewProvider,
  gitlabMrViewProvider: GitlabMrViewProvider,
  logger: Logger
): void {
  // Initialize command handlers
  const openConfigPanelCommand = new OpenConfigPanelCommand(
    context.extensionUri,
    configManager,
    logger
  );
  const configureJiraCommand = new ConfigureJiraCommand(configManager, logger);
  const configureGitlabCommand = new ConfigureGitlabCommand(configManager, logger);
  const fetchJiraIssueCommand = new FetchJiraIssueCommand(jiraService, logger);
  const fetchJiraBugListCommand = new FetchJiraBugListCommand(jiraService, logger);
  const analyzeRequirementCommand = new AnalyzeRequirementCommand(
    jiraService,
    requirementAnalysisService,
    gitService,
    logger
  );
  const analyzeBugCommand = new AnalyzeBugCommand(jiraService, bugAnalysisService, gitService, logger);
  const generateCodeCommand = new GenerateCodeCommand(codeGenerationService, logger);
  const commitCodeCommand = new CommitCodeCommand(gitService, logger);
  const createMRCommand = new CreateMRCommand(gitlabService, gitService, jiraService, logger);
  const handleCRSuggestionsCommand = new HandleCRSuggestionsCommand(
    codeReviewService,
    gitService,
    logger
  );

  // Open configuration panel
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.openConfig', async () => {
      await openConfigPanelCommand.execute();
    })
  );

  // Configure JIRA
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.configureJira', async () => {
      await configureJiraCommand.execute();
      jiraIssuesViewProvider.refresh();
    })
  );

  // Configure GitLab
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.configureGitlab', async () => {
      await configureGitlabCommand.execute();
    })
  );

  // Fetch JIRA Issue
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.fetchJiraIssue', async () => {
      await fetchJiraIssueCommand.execute();
      jiraIssuesViewProvider.refresh();
    })
  );

  // Fetch JIRA Bug List
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.fetchJiraBugList', async () => {
      await fetchJiraBugListCommand.execute();
    })
  );

  // Refresh JIRA Issues
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.refreshJiraIssues', () => {
      jiraIssuesViewProvider.refresh();
    })
  );

  // Refresh GitLab MR List
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.refreshGitlabMRs', () => {
      gitlabMrViewProvider.refresh();
    })
  );

  // Show Issue Details
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.showIssueDetails', (issue) => {
      const jiraConfig = configManager.getJiraConfig();
      IssueDetailsPanel.createOrShow(extensionUri, logger, issue, jiraConfig.serverUrl);
    })
  );

  // Analyze Requirement
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.analyzeRequirement', async (issue) => {
      await analyzeRequirementCommand.execute(issue);
    })
  );

  // Analyze Bug
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.analyzeBug', async (issue) => {
      await analyzeBugCommand.execute(issue);
    })
  );

  // Generate Code
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.generateCode', async (issue, proposal) => {
      await generateCodeCommand.execute(issue, proposal);
    })
  );

  // Commit Code
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.commitCode', async (issue) => {
      await commitCodeCommand.execute(issue);
    })
  );

  // Create MR
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.createMR', async (issue) => {
      await createMRCommand.execute(issue);
    })
  );

  // Handle CR Suggestions
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.handleCRSuggestions', async () => {
      await handleCRSuggestionsCommand.execute();
    })
  );

  // Search Jira Issues
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.searchIssues', async () => {
      await jiraIssuesViewProvider.search();
    })
  );

  // Clear Jira Issues Search
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.clearSearchIssues', async () => {
      jiraIssuesViewProvider.clearSearch();
    })
  );

  // Refresh Jira Issues
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraGitlabHelper.refreshIssues', () => {
      jiraIssuesViewProvider.refresh();
    })
  );

  logger.info('All commands registered');
}

async function showWelcomeMessage(context: vscode.ExtensionContext): Promise<void> {
  const message = '欢迎使用Jira GitLab Helper！这是一个智能的JIRA和GitLab集成助手。';
  const configureAction = '配置';
  const dontShowAction = '不再显示';

  const result = await vscode.window.showInformationMessage(
    message,
    configureAction,
    dontShowAction
  );

  if (result === configureAction) {
    await vscode.commands.executeCommand('jiraGitlabHelper.openConfig');
  } else if (result === dontShowAction) {
    await context.globalState.update('hasShownWelcome', true);
  }
}

async function checkAndPromptConfiguration(
  _context: vscode.ExtensionContext,
  configManager: ConfigurationManager,
  logger: Logger
): Promise<void> {
  try {
    // Check if basic configuration exists
    const jiraConfig = configManager.getJiraConfig();
    const gitlabConfig = configManager.getGitlabConfig();

    const isJiraConfigured = jiraConfig.serverUrl && jiraConfig.username;
    const isGitlabConfigured = gitlabConfig.serverUrl;

    // If not configured, automatically open config panel
    if (!isJiraConfigured || !isGitlabConfigured) {
      logger.info('Configuration incomplete, opening config panel');

      // Small delay to ensure extension is fully activated
      setTimeout(() => {
        void vscode.commands.executeCommand('jiraGitlabHelper.openConfig');
      }, 500);

      // Show welcome message
      const message = isJiraConfigured
        ? '请配置GitLab连接信息'
        : isGitlabConfigured
          ? '请配置Jira连接信息'
          : '欢迎使用Jira GitLab Helper！请先配置Jira和GitLab连接信息';

      void vscode.window.showInformationMessage(message);
    }
  } catch (error) {
    logger.error('Failed to check configuration', error);
  }
}

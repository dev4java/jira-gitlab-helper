import * as vscode from 'vscode';
import { IJiraIssue } from '../../models/jira-issue';
import { Logger } from '../../utils/logger';

export class IssueDetailsPanel {
  private static currentPanel: IssueDetailsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    private readonly _logger: Logger,
    private _issue: IJiraIssue
  ) {
    this._panel = panel;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'analyzeRequirement':
            this._logger.info(`Starting requirement analysis for ${this._issue.key}`);
            void vscode.commands.executeCommand(
              'jiraGitlabHelper.analyzeRequirement',
              this._issue
            );
            break;
          case 'analyzeBug':
            this._logger.info(`Starting bug analysis for ${this._issue.key}`);
            void vscode.commands.executeCommand('jiraGitlabHelper.analyzeBug', this._issue);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    logger: Logger,
    issue: IJiraIssue
  ): void {
    const column = vscode.ViewColumn.Two;

    // If we already have a panel, show it in the target column
    if (IssueDetailsPanel.currentPanel) {
      IssueDetailsPanel.currentPanel._panel.reveal(column);
      IssueDetailsPanel.currentPanel._issue = issue;
      IssueDetailsPanel.currentPanel._update();
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'jiraIssueDetails',
      `${issue.key} - 详情`,
      column,
      {
        // Enable javascript in the webview
        enableScripts: true,

        // Restrict the webview to only load resources from the extension's media directory
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],

        // Retain context when hidden
        retainContextWhenHidden: true,
      }
    );

    IssueDetailsPanel.currentPanel = new IssueDetailsPanel(panel, extensionUri, logger, issue);
  }

  public dispose(): void {
    IssueDetailsPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update(): void {
    this._panel.title = `${this._issue.key} - 详情`;
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const issue = this._issue;

    // Format date
    const formatDate = (dateStr: string): string => {
      try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return dateStr;
      }
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${issue.key} - 详情</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        
        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .issue-key {
            font-size: 1.2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 8px;
        }
        
        .issue-summary {
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .metadata {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .metadata-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
        }
        
        .metadata-value {
            color: var(--vscode-foreground);
        }
        
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.9em;
            font-weight: 500;
        }
        
        .badge-type {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        
        .badge-status {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .badge-priority {
            background-color: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
        }
        
        .section {
            margin-bottom: 25px;
        }
        
        .section-title {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        
        .description {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 4px;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .actions {
            display: flex;
            gap: 10px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        
        .action-button {
            flex: 1;
            padding: 12px 20px;
            font-size: 1em;
            font-weight: 500;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        
        .action-button:hover {
            opacity: 0.8;
        }
        
        .btn-requirement {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .btn-bug {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .labels {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        
        .label-tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.85em;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="issue-key">${issue.key}</div>
        <div class="issue-summary">${this._escapeHtml(issue.summary)}</div>
        <div style="margin-top: 10px;">
            <span class="badge badge-type">${this._escapeHtml(issue.type)}</span>
            <span class="badge badge-status">${this._escapeHtml(issue.status)}</span>
            <span class="badge badge-priority">${this._escapeHtml(issue.priority)}</span>
        </div>
    </div>

    <div class="section">
        <div class="section-title">基本信息</div>
        <div class="metadata">
            <div class="metadata-label">问题编号:</div>
            <div class="metadata-value">${issue.key}</div>
            
            <div class="metadata-label">类型:</div>
            <div class="metadata-value">${this._escapeHtml(issue.type)}</div>
            
            <div class="metadata-label">状态:</div>
            <div class="metadata-value">${this._escapeHtml(issue.status)}</div>
            
            <div class="metadata-label">优先级:</div>
            <div class="metadata-value">${this._escapeHtml(issue.priority)}</div>
            
            ${
              issue.assignee
                ? `
            <div class="metadata-label">负责人:</div>
            <div class="metadata-value">${this._escapeHtml(issue.assignee.displayName)}</div>
            `
                : ''
            }
            
            ${
              issue.reporter
                ? `
            <div class="metadata-label">报告人:</div>
            <div class="metadata-value">${this._escapeHtml(issue.reporter.displayName)}</div>
            `
                : ''
            }
            
            <div class="metadata-label">创建时间:</div>
            <div class="metadata-value">${formatDate(issue.created)}</div>
            
            <div class="metadata-label">更新时间:</div>
            <div class="metadata-value">${formatDate(issue.updated)}</div>
            
            ${
              issue.plannedTestDate
                ? `
            <div class="metadata-label">计划提测日期:</div>
            <div class="metadata-value">${formatDate(issue.plannedTestDate)}</div>
            `
                : ''
            }
            
            ${
              issue.dueDate
                ? `
            <div class="metadata-label">到期日期:</div>
            <div class="metadata-value">${formatDate(issue.dueDate)}</div>
            `
                : ''
            }
        </div>
    </div>

    ${
      issue.labels && issue.labels.length > 0
        ? `
    <div class="section">
        <div class="section-title">标签</div>
        <div class="labels">
            ${issue.labels.map((label) => `<span class="label-tag">${this._escapeHtml(label)}</span>`).join('')}
        </div>
    </div>
    `
        : ''
    }

    ${
      issue.description
        ? `
    <div class="section">
        <div class="section-title">描述</div>
        <div class="description">${this._escapeHtml(issue.description)}</div>
    </div>
    `
        : ''
    }

    <div class="actions">
        <button class="action-button btn-requirement" onclick="analyzeRequirement()">
            📋 需求分析
        </button>
        <button class="action-button btn-bug" onclick="analyzeBug()">
            🐛 Bug分析
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function analyzeRequirement() {
            vscode.postMessage({
                command: 'analyzeRequirement'
            });
        }
        
        function analyzeBug() {
            vscode.postMessage({
                command: 'analyzeBug'
            });
        }
    </script>
</body>
</html>`;
  }

  private _escapeHtml(text: string): string {
    if (!text) {
      return '';
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

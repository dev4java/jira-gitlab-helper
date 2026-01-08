import * as vscode from 'vscode';

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export class Logger {
  private _outputChannel: vscode.OutputChannel;
  private _logLevel: LogLevel;

  constructor(context: vscode.ExtensionContext) {
    this._outputChannel = vscode.window.createOutputChannel('Jira GitLab Helper');
    this._logLevel = this.getLogLevelFromConfig();

    context.subscriptions.push(this._outputChannel);

    // Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('jiraGitlabHelper.general.debugMode')) {
          this._logLevel = this.getLogLevelFromConfig();
        }
      })
    );
  }

  private getLogLevelFromConfig(): LogLevel {
    const config = vscode.workspace.getConfiguration('jiraGitlabHelper');
    const debugMode = config.get<boolean>('general.debugMode', false);
    return debugMode ? LogLevel.Debug : LogLevel.Info;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level < this._logLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level].toUpperCase();
    const formattedMessage = this.formatMessage(message, args);

    this._outputChannel.appendLine(`[${timestamp}] [${levelStr}] ${formattedMessage}`);

    // Show error messages to user
    if (level === LogLevel.Error) {
      void vscode.window.showErrorMessage(`Jira GitLab Helper: ${formattedMessage}`);
    }
  }

  private formatMessage(message: string, args: unknown[]): string {
    if (args.length === 0) {
      return message;
    }

    return `${message} ${args.map((arg) => this.stringify(arg)).join(' ')}`;
  }

  private stringify(value: unknown): string {
    if (value instanceof Error) {
      return `${value.message}\n${value.stack ?? ''}`;
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  public debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.Debug, message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.Info, message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.Warn, message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.Error, message, ...args);
  }

  public show(): void {
    this._outputChannel.show();
  }
}

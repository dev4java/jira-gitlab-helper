import * as vscode from 'vscode';
import { ConfigurationPanel } from '../ui/webviews/configuration-panel';
import { ConfigurationManager } from '../config/configuration-manager';
import { Logger } from '../utils/logger';

export class OpenConfigPanelCommand {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _configManager: ConfigurationManager,
    private readonly _logger: Logger
  ) {}

  public async execute(): Promise<void> {
    try {
      this._logger.info('Opening configuration panel');

      ConfigurationPanel.createOrShow(
        this._extensionUri,
        this._configManager,
        this._logger
      );
    } catch (error) {
      this._logger.error('Failed to open configuration panel', error);
      void vscode.window.showErrorMessage(
        '打开配置面板失败: ' + (error as Error).message
      );
    }
  }
}


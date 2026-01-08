import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { IOpenSpecProposal, IRequirementSpec, ITaskItem } from '../models/requirement-analysis';
import * as child_process from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(child_process.exec);

export class OpenSpecGenerator {
  private _isOpenSpecInstalled: boolean | null = null;

  constructor(private readonly _logger: Logger) {}

  public async isOpenSpecInstalled(): Promise<boolean> {
    // 缓存检测结果
    if (this._isOpenSpecInstalled !== null) {
      return this._isOpenSpecInstalled;
    }

    try {
      this._logger.debug('Checking if OpenSpec CLI is installed');
      
      const { stdout } = await execAsync('openspec --version', {
        timeout: 5000,
      });

      this._isOpenSpecInstalled = !!stdout && stdout.includes('openspec');
      
      if (this._isOpenSpecInstalled) {
        this._logger.info('OpenSpec CLI detected', { version: stdout.trim() });
      } else {
        this._logger.info('OpenSpec CLI not installed');
      }

      return this._isOpenSpecInstalled;
    } catch (error) {
      this._logger.info('OpenSpec CLI not found in PATH');
      this._isOpenSpecInstalled = false;
      return false;
    }
  }

  public resetInstallationCache(): void {
    this._isOpenSpecInstalled = null;
  }

  public async generateProposal(
    proposal: IOpenSpecProposal,
    workspaceUri: vscode.Uri
  ): Promise<string> {
    try {
      const openspecDir = path.join(workspaceUri.fsPath, 'openspec');
      const changesDir = path.join(openspecDir, 'changes', proposal.changeId);

      // Create directory structure
      await fs.mkdir(changesDir, { recursive: true });
      await fs.mkdir(path.join(changesDir, 'specs'), { recursive: true });

      // Generate proposal.md
      await this.generateProposalMd(proposal, changesDir);

      // Generate tasks.md
      await this.generateTasksMd(proposal.tasks, changesDir);

      // Generate design.md if needed
      if (proposal.designDoc) {
        await this.generateDesignMd(proposal, changesDir);
      }

      // Generate spec deltas
      for (const capability of proposal.capabilities) {
        await this.generateSpecDelta(capability.name, capability.specs, changesDir);
      }

      this._logger.info('OpenSpec proposal generated', { changeId: proposal.changeId });

      return changesDir;
    } catch (error) {
      this._logger.error('Failed to generate OpenSpec proposal', error);
      throw new Error(`生成OpenSpec提案失败: ${String(error)}`);
    }
  }

  private async generateProposalMd(proposal: IOpenSpecProposal, baseDir: string): Promise<void> {
    const content = [
      `# Change: ${this.formatChangeId(proposal.changeId)}`,
      '',
      '## Why',
      '',
      proposal.why,
      '',
      '## What Changes',
      '',
      ...proposal.whatChanges.map((change) => `- ${change}`),
      '',
      '## Impact',
      '',
      '### 受影响的规格',
      ...proposal.impact.affectedSpecs.map((spec) => `- \`${spec}\``),
      '',
      '### 受影响的代码',
      ...proposal.impact.affectedCode.map((code) => `- ${code}`),
    ];

    if (proposal.impact.breakingChanges && proposal.impact.breakingChanges.length > 0) {
      content.push('', '### Breaking Changes', '');
      content.push(...proposal.impact.breakingChanges.map((change) => `- **BREAKING**: ${change}`));
    }

    await fs.writeFile(path.join(baseDir, 'proposal.md'), content.join('\n'), 'utf-8');
  }

  private async generateTasksMd(tasks: ITaskItem[], baseDir: string): Promise<void> {
    const content = ['# Implementation Tasks', ''];

    // Group tasks by module
    const groupedTasks = this.groupTasksByModule(tasks);

    let moduleIndex = 1;
    for (const [module, moduleTasks] of Object.entries(groupedTasks)) {
      content.push(`## ${moduleIndex}. ${module}`);

      moduleTasks.forEach((task, index) => {
        const taskNumber = `${moduleIndex}.${index + 1}`;
        content.push(`- [ ] ${taskNumber} ${task.description}`);

        if (task.dependencies && task.dependencies.length > 0) {
          content.push(`  - Dependencies: ${task.dependencies.join(', ')}`);
        }

        if (task.estimatedTime) {
          content.push(`  - Estimated time: ${task.estimatedTime}`);
        }
      });

      content.push('');
      moduleIndex++;
    }

    await fs.writeFile(path.join(baseDir, 'tasks.md'), content.join('\n'), 'utf-8');
  }

  private groupTasksByModule(tasks: ITaskItem[]): Record<string, ITaskItem[]> {
    const grouped: Record<string, ITaskItem[]> = {};

    for (const task of tasks) {
      const module = this.extractModuleName(task.description);
      if (!grouped[module]) {
        grouped[module] = [];
      }
      grouped[module].push(task);
    }

    return grouped;
  }

  private extractModuleName(taskDescription: string): string {
    // Try to extract module name from task description
    // Default to "Implementation" if cannot extract
    const match = taskDescription.match(/^([\w\s]+?)[:：]/);
    return match ? match[1].trim() : 'Implementation';
  }

  private async generateDesignMd(proposal: IOpenSpecProposal, baseDir: string): Promise<void> {
    if (!proposal.designDoc) {
      return;
    }

    const content = [
      '# Technical Design Document',
      '',
      '## Context',
      '',
      proposal.designDoc.context,
      '',
      '## Goals / Non-Goals',
      '',
      '### Goals',
      ...proposal.designDoc.goals.map((goal) => `- ${goal}`),
      '',
      '### Non-Goals',
      ...proposal.designDoc.nonGoals.map((nonGoal) => `- ${nonGoal}`),
      '',
      '## Decisions',
      '',
    ];

    for (const decision of proposal.designDoc.decisions) {
      content.push(`### ${decision.decision}`);
      content.push('');
      content.push(`**Rationale**: ${decision.rationale}`);

      if (decision.alternatives && decision.alternatives.length > 0) {
        content.push('');
        content.push('**Alternatives considered**:');
        content.push(...decision.alternatives.map((alt) => `- ${alt}`));
      }

      content.push('');
    }

    if (proposal.designDoc.risks && proposal.designDoc.risks.length > 0) {
      content.push('## Risks / Trade-offs', '');

      for (const risk of proposal.designDoc.risks) {
        content.push(`**Risk**: ${risk.risk}`);
        content.push(`- Mitigation: ${risk.mitigation}`);
        content.push('');
      }
    }

    await fs.writeFile(path.join(baseDir, 'design.md'), content.join('\n'), 'utf-8');
  }

  private async generateSpecDelta(
    capabilityName: string,
    specs: IRequirementSpec[],
    baseDir: string
  ): Promise<void> {
    const specDir = path.join(baseDir, 'specs', capabilityName);
    await fs.mkdir(specDir, { recursive: true });

    const content = [
      `# ${this.formatCapabilityName(capabilityName)}`,
      '',
      '## ADDED Requirements',
      '',
    ];

    for (const spec of specs) {
      content.push(`### Requirement: ${spec.requirement}`);
      content.push(spec.description);
      content.push('');

      for (const scenario of spec.scenarios) {
        content.push(`#### Scenario: ${scenario.title}`);
        content.push(`- **WHEN** ${scenario.when}`);
        content.push(`- **THEN** ${scenario.then}`);

        if (scenario.and) {
          for (const andClause of scenario.and) {
            content.push(`- **AND** ${andClause}`);
          }
        }

        content.push('');
      }
    }

    await fs.writeFile(path.join(specDir, 'spec.md'), content.join('\n'), 'utf-8');
  }

  public async validateProposal(changeId: string, workspaceUri: vscode.Uri): Promise<boolean> {
    try {
      this._logger.debug('Validating OpenSpec proposal', { changeId });

      const { stdout, stderr } = await execAsync(`openspec validate ${changeId} --strict`, {
        cwd: workspaceUri.fsPath,
      });

      this._logger.debug('OpenSpec validation output', { stdout, stderr });

      return !stderr && stdout.includes('valid');
    } catch (error) {
      this._logger.error('OpenSpec validation failed', error);
      return false;
    }
  }

  private formatChangeId(changeId: string): string {
    return changeId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private formatCapabilityName(capabilityName: string): string {
    return (
      capabilityName
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + ' Capability'
    );
  }
}

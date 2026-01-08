import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIService } from './ai-service';
import { Logger } from '../utils/logger';
import {
  ICodeGenerationTask,
  IProjectStructure,
  IGeneratedCode,
  ICodeDiff,
  IDependency,
} from '../models/code-generation';
import { IOpenSpecProposal } from '../models/requirement-analysis';

export class CodeGenerationService {
  constructor(
    private readonly _aiService: AIService,
    private readonly _logger: Logger
  ) {}

  public async loadTasksFromOpenSpec(
    changeId: string,
    workspaceUri: vscode.Uri
  ): Promise<ICodeGenerationTask[]> {
    try {
      this._logger.info('Loading tasks from OpenSpec', { changeId });

      const tasksFile = path.join(workspaceUri.fsPath, 'openspec', 'changes', changeId, 'tasks.md');

      const content = await fs.readFile(tasksFile, 'utf-8');
      const tasks = this.parseTasksMarkdown(content);

      this._logger.info('Tasks loaded from OpenSpec', { count: tasks.length });
      return tasks;
    } catch (error) {
      this._logger.error('Failed to load tasks from OpenSpec', error);
      throw new Error(`加载OpenSpec任务失败: ${String(error)}`);
    }
  }

  private parseTasksMarkdown(content: string): ICodeGenerationTask[] {
    const tasks: ICodeGenerationTask[] = [];
    const lines = content.split('\n');

    let currentModule = '';

    for (const line of lines) {
      // Module header: ## 1. Module Name
      const moduleMatch = line.match(/^##\s+(\d+)\.\s+(.+)/);
      if (moduleMatch) {
        currentModule = moduleMatch[2].trim();
        continue;
      }

      // Task line: - [ ] 1.1 Task description
      const taskMatch = line.match(/^-\s+\[([ x])\]\s+(\d+\.\d+)\s+(.+)/);
      if (taskMatch && currentModule) {
        const [, checked, taskId, description] = taskMatch;
        tasks.push({
          id: taskId,
          module: currentModule,
          description: description.trim(),
          status: checked === 'x' ? 'completed' : 'pending',
          dependencies: [],
          targetFiles: [],
          completed: checked === 'x',
        });
      }
    }

    return tasks;
  }

  public async analyzeProjectStructure(workspaceUri: vscode.Uri): Promise<IProjectStructure> {
    try {
      this._logger.info('Analyzing project structure');

      const structure: IProjectStructure = {
        type: 'other',
        sourceDirectory: 'src',
        testDirectory: 'test',
        configFiles: [],
      };

      // Detect project type
      const packageJsonPath = path.join(workspaceUri.fsPath, 'package.json');
      const pomXmlPath = path.join(workspaceUri.fsPath, 'pom.xml');
      const requirementsPath = path.join(workspaceUri.fsPath, 'requirements.txt');

      try {
        await fs.access(packageJsonPath);
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

        structure.type = packageJson.devDependencies?.typescript ? 'typescript' : 'javascript';
        structure.packageManager = await this.detectPackageManager(workspaceUri);
        structure.framework = this.detectFramework(packageJson);
        structure.configFiles.push('package.json');

        if (packageJson.devDependencies?.typescript) {
          structure.configFiles.push('tsconfig.json');
        }
      } catch {
        // Not a Node.js project
      }

      try {
        await fs.access(pomXmlPath);
        structure.type = 'java';
        structure.packageManager = 'maven';
        structure.sourceDirectory = 'src/main/java';
        structure.testDirectory = 'src/test/java';
        structure.configFiles.push('pom.xml');
      } catch {
        // Not a Java Maven project
      }

      try {
        await fs.access(requirementsPath);
        structure.type = 'python';
        structure.packageManager = 'pip';
        structure.configFiles.push('requirements.txt');
      } catch {
        // Not a Python project
      }

      this._logger.info('Project structure analyzed', { type: structure.type });
      return structure;
    } catch (error) {
      this._logger.error('Failed to analyze project structure', error);
      throw new Error(`分析项目结构失败: ${String(error)}`);
    }
  }

  private async detectPackageManager(workspaceUri: vscode.Uri): Promise<'npm' | 'yarn' | 'pnpm'> {
    try {
      await fs.access(path.join(workspaceUri.fsPath, 'yarn.lock'));
      return 'yarn';
    } catch {
      // Not yarn
    }

    try {
      await fs.access(path.join(workspaceUri.fsPath, 'pnpm-lock.yaml'));
      return 'pnpm';
    } catch {
      // Not pnpm
    }

    return 'npm';
  }

  private detectFramework(packageJson: any): string | undefined {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.react) return 'React';
    if (deps.vue) return 'Vue';
    if (deps.angular) return 'Angular';
    if (deps.express) return 'Express';
    if (deps['@nestjs/core']) return 'NestJS';

    return undefined;
  }

  public async generateCode(
    task: ICodeGenerationTask,
    projectStructure: IProjectStructure,
    proposal: IOpenSpecProposal,
    workspaceUri: vscode.Uri
  ): Promise<IGeneratedCode[]> {
    try {
      this._logger.info('Generating code for task', { taskId: task.id });

      const client = await this._aiService.getClient();

      const context = this.buildCodeGenerationContext(task, projectStructure, proposal);

      const prompt = `请为以下任务生成代码:

任务: ${task.description}
项目类型: ${projectStructure.type}
框架: ${projectStructure.framework || 'None'}

要求:
1. 遵循项目的代码规范
2. 包含必要的注释
3. 包含错误处理
4. 返回JSON格式: { files: [{ filePath, operation, content, language, imports }] }

上下文:
${context}`;

      const response = await client.chat(
        [{ role: 'user', content: prompt }],
        '你是一个代码生成专家。'
      );

      const generatedCode = this.parseGeneratedCode(
        response.content,
        projectStructure,
        workspaceUri
      );

      this._logger.info('Code generated for task', {
        taskId: task.id,
        filesCount: generatedCode.length,
      });
      return generatedCode;
    } catch (error) {
      this._logger.error('Failed to generate code', error);
      throw new Error(`生成代码失败: ${String(error)}`);
    }
  }

  private buildCodeGenerationContext(
    task: ICodeGenerationTask,
    projectStructure: IProjectStructure,
    proposal: IOpenSpecProposal
  ): string {
    return `项目结构:
- 类型: ${projectStructure.type}
- 源代码目录: ${projectStructure.sourceDirectory}
- 测试目录: ${projectStructure.testDirectory}

变更提案:
- Change ID: ${proposal.changeId}
- 目标: ${proposal.why}

模块: ${task.module}
任务编号: ${task.id}`;
  }

  private parseGeneratedCode(
    aiResponse: string,
    projectStructure: IProjectStructure,
    _workspaceUri: vscode.Uri
  ): IGeneratedCode[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.files && Array.isArray(parsed.files)) {
          return parsed.files;
        }
      }

      // Fallback: create a single file
      return [
        {
          filePath: `${projectStructure.sourceDirectory}/generated-code.${this.getFileExtension(projectStructure.type)}`,
          operation: 'create',
          content: aiResponse,
          language: projectStructure.type,
          imports: [],
        },
      ];
    } catch (error) {
      this._logger.warn('Failed to parse generated code JSON, using fallback', error);
      return [];
    }
  }

  private getFileExtension(projectType: string): string {
    switch (projectType) {
      case 'typescript':
        return 'ts';
      case 'javascript':
        return 'js';
      case 'java':
        return 'java';
      case 'python':
        return 'py';
      default:
        return 'txt';
    }
  }

  public async applyGeneratedCode(
    generatedCode: IGeneratedCode[],
    workspaceUri: vscode.Uri
  ): Promise<void> {
    try {
      this._logger.info('Applying generated code', { filesCount: generatedCode.length });

      for (const code of generatedCode) {
        const filePath = path.join(workspaceUri.fsPath, code.filePath);

        if (code.operation === 'create') {
          await this.createFile(filePath, code.content);
        } else if (code.operation === 'modify') {
          await this.modifyFile(filePath, code.content);
        } else if (code.operation === 'delete') {
          await this.deleteFile(filePath);
        }
      }

      this._logger.info('Generated code applied successfully');
    } catch (error) {
      this._logger.error('Failed to apply generated code', error);
      throw new Error(`应用生成的代码失败: ${String(error)}`);
    }
  }

  private async createFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    this._logger.debug('File created', { filePath });
  }

  private async modifyFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
    this._logger.debug('File modified', { filePath });
  }

  private async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    this._logger.debug('File deleted', { filePath });
  }

  public async generateDiff(
    generatedCode: IGeneratedCode[],
    workspaceUri: vscode.Uri
  ): Promise<ICodeDiff[]> {
    const diffs: ICodeDiff[] = [];

    for (const code of generatedCode) {
      const filePath = path.join(workspaceUri.fsPath, code.filePath);

      let oldContent = '';
      if (code.operation === 'modify') {
        try {
          oldContent = await fs.readFile(filePath, 'utf-8');
        } catch {
          oldContent = '';
        }
      }

      diffs.push({
        filePath: code.filePath,
        oldContent,
        newContent: code.content,
        diff: this.computeDiff(oldContent, code.content),
      });
    }

    return diffs;
  }

  private computeDiff(oldContent: string, newContent: string): string {
    // Simple line-by-line diff
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];

    const maxLength = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLength; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (oldLine) {
          diffLines.push(`- ${oldLine}`);
        }
        if (newLine) {
          diffLines.push(`+ ${newLine}`);
        }
      }
    }

    return diffLines.join('\n');
  }

  public async addDependencies(
    dependencies: IDependency[],
    projectStructure: IProjectStructure,
    workspaceUri: vscode.Uri
  ): Promise<void> {
    try {
      this._logger.info('Adding dependencies', { count: dependencies.length });

      if (projectStructure.type === 'typescript' || projectStructure.type === 'javascript') {
        await this.addNpmDependencies(dependencies, workspaceUri);
      } else if (projectStructure.type === 'java') {
        await this.addMavenDependencies(dependencies, workspaceUri);
      }

      this._logger.info('Dependencies added successfully');
    } catch (error) {
      this._logger.error('Failed to add dependencies', error);
      throw new Error(`添加依赖失败: ${String(error)}`);
    }
  }

  private async addNpmDependencies(
    dependencies: IDependency[],
    workspaceUri: vscode.Uri
  ): Promise<void> {
    const packageJsonPath = path.join(workspaceUri.fsPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    for (const dep of dependencies) {
      const targetField = dep.type === 'development' ? 'devDependencies' : 'dependencies';
      if (!packageJson[targetField]) {
        packageJson[targetField] = {};
      }
      packageJson[targetField][dep.name] = dep.version;
    }

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
  }

  private async addMavenDependencies(
    dependencies: IDependency[],
    workspaceUri: vscode.Uri
  ): Promise<void> {
    const pomPath = path.join(workspaceUri.fsPath, 'pom.xml');
    let pomContent = await fs.readFile(pomPath, 'utf-8');

    for (const dep of dependencies) {
      const [groupId, artifactId] = dep.name.split(':');
      const dependencyXml = `
    <dependency>
      <groupId>${groupId}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>${dep.version}</version>
    </dependency>`;

      // Insert before </dependencies>
      pomContent = pomContent.replace('</dependencies>', `${dependencyXml}\n  </dependencies>`);
    }

    await fs.writeFile(pomPath, pomContent, 'utf-8');
  }
}

# Technical Design Document

## Context

本项目旨在开发一个VSCode插件,集成JIRA和GitLab,实现从需求/Bug分析到代码生成、提交和Code Review的全流程自动化。项目需要:
- 与外部服务(JIRA、GitLab、AI)集成
- 处理复杂的工作流程
- 提供良好的用户体验
- 支持多种项目类型和编程语言

## Goals / Non-Goals

### Goals
- 创建一个功能完整的VSCode扩展
- 实现JIRA和GitLab的无缝集成
- 提供智能的需求分析和Bug定位能力
- 支持基于OpenSpec的系统化开发流程
- 自动化Code Review建议处理
- 提供友好的用户界面和交互体验

### Non-Goals
- 不支持除JIRA外的其他问题跟踪系统(如GitHub Issues)
- 不支持除GitLab外的其他Git托管平台(如GitHub、Bitbucket)
- 不实现完整的项目管理功能
- 不替代人工Code Review,仅辅助处理简单建议

## Architecture Overview

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    VSCode Extension                      │
├─────────────────────────────────────────────────────────┤
│  UI Layer                                               │
│  ├─ Sidebar Views (JIRA Issues, Tasks)                 │
│  ├─ Webview Panels (AI Chat, Code Preview)             │
│  └─ Commands & Menus                                    │
├─────────────────────────────────────────────────────────┤
│  Service Layer                                          │
│  ├─ JIRA Service                                        │
│  ├─ GitLab Service                                      │
│  ├─ Requirement Analysis Service                       │
│  ├─ Bug Analysis Service                               │
│  ├─ Code Generation Service                            │
│  └─ Code Review Service                                │
├─────────────────────────────────────────────────────────┤
│  Integration Layer                                      │
│  ├─ JIRA API Client                                     │
│  ├─ GitLab API Client                                   │
│  ├─ AI Service Client (MCP Protocol)                   │
│  └─ OpenSpec CLI Wrapper                               │
├─────────────────────────────────────────────────────────┤
│  Core Layer                                             │
│  ├─ Configuration Manager                              │
│  ├─ State Manager                                       │
│  ├─ Error Handler                                       │
│  └─ Logger                                              │
└─────────────────────────────────────────────────────────┘
```

## Key Technical Decisions

### Decision 1: 使用TypeScript开发VSCode扩展

**选择**: TypeScript + VSCode Extension API

**理由**:
- VSCode官方推荐的扩展开发语言
- 类型安全,减少运行时错误
- 丰富的VSCode API类型定义
- 良好的IDE支持和调试体验

**替代方案**:
- JavaScript: 缺少类型安全
- 其他语言: 需要额外的桥接层

### Decision 2: AI服务集成方式

**选择**: 使用MCP (Model Context Protocol)协议

**理由**:
- 标准化的AI服务通信协议
- 支持多种AI提供商
- 便于切换不同的AI后端
- 支持流式响应和长对话

**替代方案**:
- 直接调用OpenAI API: 绑定特定提供商
- 本地模型: 性能和资源限制

### Decision 3: OpenSpec集成方式

**选择**: 通过子进程调用OpenSpec CLI

**理由**:
- OpenSpec提供了完整的CLI工具
- 避免重复实现OpenSpec逻辑
- 便于跟随OpenSpec版本更新
- 支持所有OpenSpec功能

**替代方案**:
- 直接操作OpenSpec文件: 容易出错,难以维护
- 实现OpenSpec库: 工作量大,难以保持同步

### Decision 4: 配置存储方案

**选择**: VSCode Settings + Secret Storage API

**理由**:
- 非敏感配置使用VSCode Settings,支持用户级和工作区级
- 敏感信息(密码、Token)使用Secret Storage,安全加密
- 与VSCode生态集成良好
- 支持配置同步

**替代方案**:
- 全部使用文件存储: 安全性差
- 自定义加密方案: 增加复杂度,可能不够安全

### Decision 5: 状态管理

**选择**: 使用Context + Event Emitter模式

**理由**:
- VSCode Extension Context提供生命周期管理
- Event Emitter支持模块间解耦通信
- 简单直接,不需要引入额外的状态管理库
- 符合VSCode扩展开发最佳实践

**替代方案**:
- Redux/MobX: 对于扩展来说过于复杂
- 全局变量: 难以管理和测试

### Decision 6: UI实现方式

**选择**: TreeView + Webview混合方式

**理由**:
- TreeView用于列表展示(JIRA问题、任务列表),原生体验
- Webview用于复杂交互(AI对话、代码预览),灵活性高
- 充分利用VSCode原生组件,减少开发工作量

**替代方案**:
- 全部使用Webview: 失去原生体验
- 全部使用原生组件: 复杂交互难以实现

### Decision 7: 代码生成策略

**选择**: 基于AST的增量代码生成

**理由**:
- 使用语言特定的解析器(如TypeScript Compiler API)
- 精确定位代码插入位置
- 保持代码格式和结构
- 支持复杂的代码修改场景

**替代方案**:
- 正则表达式替换: 不够可靠,容易出错
- 完全重写文件: 丢失现有代码和格式

### Decision 8: 错误处理策略

**选择**: 分层错误处理 + 用户友好提示

**理由**:
- 底层抛出详细的技术错误
- 中间层转换为业务错误
- UI层展示用户友好的错误消息和恢复建议
- 所有错误记录到日志

**实现**:
```typescript
class JiraConnectionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
  }
  
  getUserMessage(): string {
    return "无法连接到JIRA服务器,请检查配置和网络连接";
  }
}
```

## Data Models

### Configuration Model

```typescript
interface PluginConfiguration {
  jira: JiraConfig;
  gitlab: GitlabConfig;
  ai: AIConfig;
  general: GeneralConfig;
}

interface JiraConfig {
  serverUrl: string;
  username: string;
  authType: 'password' | 'apiToken';
  // 密码和token存储在Secret Storage中
}

interface GitlabConfig {
  serverUrl: string;
  // token存储在Secret Storage中
  defaultProjectId?: string;
  defaultTargetBranch: string;
}

interface AIConfig {
  provider: 'mcp' | 'openai' | 'custom';
  endpoint?: string;
  model?: string;
}
```

### JIRA Issue Model

```typescript
interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  type: 'Story' | 'Task' | 'Bug' | 'Epic' | 'Sub-task';
  status: string;
  assignee?: string;
  priority: string;
  customFields: Record<string, any>;
}
```

### Code Generation Task Model

```typescript
interface CodeGenerationTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  targetFiles: string[];
  dependencies: string[];
  generatedCode?: GeneratedCode[];
}

interface GeneratedCode {
  filePath: string;
  operation: 'create' | 'modify' | 'delete';
  content: string;
  diff?: string;
}
```

## API Integration

### JIRA REST API

使用 `jira-client` npm包或自定义HTTP客户端:

```typescript
class JiraClient {
  async getIssue(issueKey: string): Promise<JiraIssue>;
  async searchIssues(jql: string): Promise<JiraIssue[]>;
  async updateIssueStatus(issueKey: string, status: string): Promise<void>;
  async addComment(issueKey: string, comment: string): Promise<void>;
}
```

### GitLab REST API

使用 `@gitbeaker/node` npm包:

```typescript
class GitlabClient {
  async createBranch(branchName: string, ref: string): Promise<void>;
  async commitFiles(branch: string, files: CommitFile[]): Promise<void>;
  async createMergeRequest(options: MROptions): Promise<MergeRequest>;
  async getMergeRequestDiscussions(mrIid: number): Promise<Discussion[]>;
  async getMergeRequestCodeSuggestions(mrIid: number): Promise<CodeSuggestion[]>;
}
```

### AI Service (MCP)

```typescript
class AIServiceClient {
  async analyzeRequirement(requirement: string): Promise<RequirementAnalysis>;
  async analyzeBug(bugInfo: BugInfo): Promise<BugAnalysis>;
  async generateCode(task: CodeGenerationTask): Promise<GeneratedCode[]>;
  async chatStream(messages: Message[]): AsyncIterator<string>;
}
```

## Workflow Implementation

### 需求处理工作流

```
1. 用户选择JIRA需求
   ↓
2. 系统识别为需求类型
   ↓
3. AI分析需求内容
   ↓
4. 生成OpenSpec变更提案
   ↓
5. 用户审查提案
   ↓
6. 创建Git分支
   ↓
7. 逐任务生成代码
   ↓
8. 用户审查代码
   ↓
9. 提交代码到GitLab
   ↓
10. 创建Merge Request
    ↓
11. 处理Code Review建议
    ↓
12. 更新JIRA状态
```

### Bug处理工作流

```
1. 用户选择JIRA Bug
   ↓
2. 系统识别为Bug类型
   ↓
3. 提取Bug信息
   ↓
4. 搜索相关代码
   ↓
5. AI分析Bug原因
   ↓
6. 用户与AI交互澄清
   ↓
7. 生成修复建议
   ↓
8. 创建Git分支
   ↓
9. 应用修复代码
   ↓
10. 运行测试验证
    ↓
11. 提交代码到GitLab
    ↓
12. 创建Merge Request
    ↓
13. 更新JIRA状态
```

## Security Considerations

### 敏感信息保护
- 使用VSCode Secret Storage API存储密码和Token
- 不在日志中记录敏感信息
- 配置文件中不包含明文凭据
- 支持配置文件中使用环境变量引用

### API访问控制
- 验证JIRA和GitLab Token的最小权限
- 在配置时显示Token权限范围
- 支持Token过期检测和刷新提醒

### 代码安全
- 生成的代码进行安全扫描
- 避免生成包含硬编码凭据的代码
- 提交前检查敏感信息泄露

## Performance Considerations

### 异步操作
- 所有API调用使用异步方式
- 长时间操作显示进度提示
- 支持取消正在进行的操作

### 缓存策略
- 缓存JIRA问题列表(5分钟)
- 缓存GitLab项目信息(10分钟)
- 缓存代码分析结果(会话期间)

### 资源管理
- 限制并发API请求数量
- 大文件分块处理
- 及时释放Webview资源

## Testing Strategy

### 单元测试
- 使用Jest测试框架
- 覆盖所有Service层逻辑
- Mock外部API调用
- 目标覆盖率: 80%

### 集成测试
- 测试与JIRA/GitLab的实际集成
- 使用测试环境和测试数据
- 验证完整工作流程

### 端到端测试
- 使用VSCode Extension Test Runner
- 模拟用户操作流程
- 验证UI交互

## Migration Plan

这是一个全新项目,无需迁移。但需要考虑:

### 从参考项目迁移逻辑
1. 分析参考项目的Java代码
2. 提取核心业务逻辑
3. 转换为TypeScript实现
4. 适配VSCode扩展架构

### 用户数据迁移
- 首次安装时引导用户配置
- 提供配置导入功能
- 支持从环境变量读取配置

## Risks / Trade-offs

### Risk 1: AI服务可用性
- **风险**: AI服务不可用或响应慢
- **缓解**: 提供降级方案,允许手动操作;支持超时和重试

### Risk 2: OpenSpec CLI兼容性
- **风险**: OpenSpec CLI版本更新导致不兼容
- **缓解**: 锁定OpenSpec版本;定期测试新版本兼容性

### Risk 3: 代码生成质量
- **风险**: 生成的代码质量不稳定
- **缓解**: 提供代码预览和编辑;运行静态检查;保留人工审查环节

### Risk 4: 多语言支持复杂度
- **风险**: 支持多种编程语言增加复杂度
- **缓解**: 第一版只支持TypeScript/JavaScript;后续逐步添加其他语言

### Trade-off 1: 功能完整性 vs 开发时间
- **选择**: 采用MVP方式,先实现核心功能
- **影响**: 部分高级功能延后实现

### Trade-off 2: 自动化程度 vs 用户控制
- **选择**: 关键操作需要用户确认
- **影响**: 减少自动化程度,但提高安全性和可控性

## Open Questions

1. **AI服务提供商选择**: 使用哪个AI服务?是否支持多个提供商切换?
   - 建议: 优先支持OpenAI,后续添加其他提供商

2. **OpenSpec CLI依赖**: 如何确保用户环境中有OpenSpec CLI?
   - 建议: 扩展内置OpenSpec CLI或提供自动安装功能

3. **多项目支持**: 如何处理用户同时处理多个JIRA项目的情况?
   - 建议: 支持配置多个项目,按工作区自动选择

4. **离线模式**: 是否支持离线工作?
   - 建议: 第一版不支持,后续考虑添加离线缓存

5. **团队协作**: 如何支持团队配置共享?
   - 建议: 提供配置模板导出导入功能

## References

- [VSCode Extension API](https://code.visualstudio.com/api)
- [JIRA REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [GitLab REST API](https://docs.gitlab.com/ee/api/)
- [OpenSpec Documentation](https://github.com/openspec/openspec)


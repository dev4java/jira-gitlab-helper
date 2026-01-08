# Project Context

## Purpose

Jira GitLab Helper是一个VSCode插件项目,旨在实现JIRA和GitLab的智能集成,通过AI辅助和OpenSpec规范化流程,自动化从需求分析、Bug定位到代码生成、提交和Code Review的完整开发流程。

## Tech Stack

- **开发语言**: TypeScript
- **运行环境**: Node.js
- **框架**: VSCode Extension API
- **集成服务**: 
  - JIRA REST API
  - GitLab REST API
  - AI服务(MCP协议)
  - OpenSpec CLI
- **构建工具**: 
  - npm/yarn
  - webpack
  - esbuild
- **测试框架**: Jest, VSCode Extension Test Runner

## Project Conventions

### Code Style

- 使用TypeScript严格模式
- 遵循ESLint规则配置
- 使用Prettier进行代码格式化
- 命名约定:
  - 类名: PascalCase (如 `JiraService`)
  - 接口名: PascalCase with I prefix (如 `IJiraConfig`)
  - 方法和变量: camelCase (如 `getJiraIssue`)
  - 常量: UPPER_SNAKE_CASE (如 `MAX_RETRY_COUNT`)
  - 文件名: kebab-case (如 `jira-service.ts`)

### Architecture Patterns

- **分层架构**: UI Layer → Service Layer → Integration Layer → Core Layer
- **依赖注入**: 使用构造函数注入,便于测试
- **事件驱动**: 使用EventEmitter进行模块间通信
- **错误处理**: 统一的错误处理机制,分层转换错误
- **异步优先**: 所有I/O操作使用async/await
- **配置管理**: VSCode Settings + Secret Storage API

### Testing Strategy

- **单元测试**: 
  - 使用Jest
  - Mock外部依赖
  - 覆盖率目标: 80%
- **集成测试**: 
  - 测试与外部服务的实际集成
  - 使用测试环境
- **端到端测试**: 
  - 使用VSCode Extension Test Runner
  - 模拟用户操作流程

### Git Workflow

- **分支策略**: 
  - `main`: 稳定版本
  - `develop`: 开发分支
  - `feature/*`: 功能分支
  - `bugfix/*`: Bug修复分支
- **提交规范**: 
  - 格式: `<type>(<scope>): <subject>`
  - 类型: feat, fix, docs, style, refactor, test, chore
  - 示例: `feat(jira): add issue status update`
- **PR要求**: 
  - 必须通过CI检查
  - 需要Code Review
  - Squash merge到develop

## Domain Context

### JIRA集成

- 支持JIRA Cloud和JIRA Server
- 认证方式: 用户名+密码 或 用户名+API Token
- 主要操作: 获取问题、查询问题、更新状态、添加评论
- 问题类型: Story, Task, Bug, Epic, Sub-task

### GitLab集成

- 支持GitLab CE和GitLab EE
- 认证方式: Personal Access Token
- 主要操作: 分支管理、代码提交、创建MR、获取CR建议
- 分支命名规范: `feature/JIRA-KEY-description` 或 `bugfix/JIRA-KEY-description`

### OpenSpec工作流

- 需求类型问题触发OpenSpec变更提案生成
- 自动创建proposal.md, tasks.md, spec deltas
- 根据复杂度决定是否生成design.md
- 使用OpenSpec CLI进行验证
- 按tasks.md中的任务顺序生成代码

### AI辅助

- 需求分析: 提取功能目标、验收标准、技术约束
- Bug分析: 交互式对话定位问题根因
- 代码生成: 基于任务描述和spec生成代码
- Code Review: 分析和应用CR建议

## Important Constraints

### 技术约束

- 必须兼容VSCode 1.80+
- Node.js版本: 18+
- 扩展包大小限制: < 50MB
- 启动时间: < 2秒

### 业务约束

- 敏感信息必须加密存储
- 关键操作需要用户确认
- 生成的代码必须可预览和编辑
- 支持操作撤销和回滚

### 性能约束

- API调用超时: 30秒
- 单次代码生成: < 5分钟
- UI响应时间: < 100ms
- 并发API请求: 最多5个

## External Dependencies

### JIRA REST API

- 版本: v3 (Cloud) / v2 (Server)
- 文档: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
- 限流: 根据JIRA实例配置

### GitLab REST API

- 版本: v4
- 文档: https://docs.gitlab.com/ee/api/
- 限流: 默认600请求/分钟

### AI服务

- 协议: MCP (Model Context Protocol)
- 备选: OpenAI API, Anthropic API
- 超时: 60秒

### OpenSpec CLI

- 版本: >= 1.0.0
- 安装方式: npm global或扩展内置
- 命令: validate, list, show, archive

## Project Structure

```
jira-gitlab-helper/
├── src/
│   ├── extension.ts           # 扩展入口
│   ├── commands/              # 命令实现
│   ├── services/              # 业务逻辑层
│   ├── integrations/          # 外部服务集成
│   ├── ui/                    # UI组件
│   │   ├── views/            # TreeView
│   │   └── webviews/         # Webview Panel
│   ├── models/                # 数据模型
│   ├── utils/                 # 工具函数
│   └── config/                # 配置管理
├── test/                      # 测试文件
├── resources/                 # 静态资源
├── openspec/                  # OpenSpec规格
│   ├── project.md
│   ├── specs/
│   └── changes/
├── package.json               # 扩展清单
├── tsconfig.json              # TypeScript配置
└── README.md                  # 项目文档
```

## Development Guidelines

### 添加新功能

1. 创建OpenSpec变更提案
2. 在proposal.md中描述功能
3. 在specs中定义需求和场景
4. 在tasks.md中列出实施步骤
5. 实施并更新任务状态
6. 编写测试
7. 更新文档

### 修复Bug

1. 创建Bug报告
2. 定位问题根因
3. 编写失败的测试用例
4. 修复代码
5. 验证测试通过
6. 提交PR

### 代码审查要点

- 类型安全: 避免使用any
- 错误处理: 所有异步操作有错误处理
- 资源释放: Disposable对象正确释放
- 性能: 避免阻塞主线程
- 安全: 不泄露敏感信息
- 测试: 新功能有对应测试

## Reference Projects

可参考类似功能的开源项目实现JIRA和GitLab集成逻辑。

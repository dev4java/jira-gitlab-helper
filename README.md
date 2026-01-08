# Jira GitLab Helper

[English](#english) | [中文](#中文)

---

<a name="english"></a>
## English

### Overview

**Jira GitLab Helper** is a powerful VS Code extension that seamlessly integrates Jira and GitLab with AI assistance to automate your development workflow from requirement analysis to code generation.

### Features

#### 🎯 Jira Integration
- Fetch and analyze Jira issues (Requirements & Bugs)
- AI-powered requirement analysis with OpenSpec generation
- Intelligent bug analysis with code location suggestions
- Quick access to bug lists

#### 🔄 GitLab Integration
- Automated Code Review suggestions handling
- Create Merge Requests with a single command
- Smart project detection from Git repository
- Support for both SSH and HTTPS GitLab URLs

#### 📄 Confluence Integration (Optional)
- Fetch detailed requirements from Confluence pages
- Automatic link detection in Jira descriptions
- Enhanced requirement context for better AI analysis

#### 🤖 AI-Powered Features
- Intelligent requirement decomposition
- Automated code generation based on specifications
- Bug root cause analysis
- Code review suggestions processing

#### 🛠️ OpenSpec Support
- Generate standardized requirement specifications
- Version-controlled change proposals
- Seamless integration with OpenSpec workflow

### Installation

1. Install from VS Code Marketplace
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Run: `Jira GitLab Helper: Open Configuration Panel`
4. Configure your Jira and GitLab connections

### Quick Start

#### 1. Configure Connections

**Jira Configuration:**
- Server URL: 
  - Jira Cloud: `https://your-company.atlassian.net`
  - Self-hosted: `https://jira.your-company.com` (your custom domain)
- Username: Your Jira email
- Auth Type: API Token (recommended)
- API Token: Generate from Jira account settings

**GitLab Configuration:**
- Server URL:
  - GitLab.com: `https://gitlab.com`
  - Self-hosted: `https://gitlab.your-company.com` (your custom domain)
- Access Token: Generate with `api`, `read_user`, `write_repository` scopes

#### 2. Basic Workflow

**For Requirements:**
```
1. Fetch Jira Issue (Ctrl+Shift+P → Fetch Jira Issue)
2. Choose "Analyze as Requirement"
3. Review AI-generated analysis
4. Generate OpenSpec proposal (optional)
5. Generate code based on analysis
6. Commit and create Merge Request
```

**For Bugs:**
```
1. Fetch Jira Issue or Bug List
2. Choose "Analyze as Bug"
3. Review bug analysis and suggested fixes
4. Apply fixes and create MR
```

**For Code Review:**
```
1. Receive MR link from GitLab
2. Run: Handle Code Review Suggestions
3. Choose to process in AI chat or review one by one
4. Apply suggested changes
```

### Commands

Access all commands via Command Palette (`Ctrl+Shift+P`):

- `Open Configuration Panel` - Configure all integrations
- `Fetch Jira Issue` - Retrieve a specific Jira issue
- `Fetch Bug List` - Show list of Jira bugs
- `Analyze Requirement` - AI analysis for requirements
- `Analyze Bug` - AI analysis for bugs
- `Generate Code` - Generate code from analysis
- `Create Merge Request` - Create GitLab MR
- `Handle Code Review Suggestions` - Process MR review comments

### Requirements

- VS Code 1.90.0 or higher
- Node.js (for OpenSpec features)
- OpenSpec CLI (optional, for proposal generation)
- Active Jira and GitLab accounts with proper permissions

### Support

For issues and feature requests, please visit our [GitHub repository](https://github.com/dev4java/jira-gitlab-helper).

### License

See [LICENSE](LICENSE) file for details.

---

<a name="中文"></a>
## 中文

### 概述

**Jira GitLab Helper** 是一款功能强大的 VS Code 扩展，无缝集成 Jira 和 GitLab，借助 AI 辅助实现从需求分析到代码生成的全流程自动化开发工作流。

### 核心功能

#### 🎯 Jira 集成
- **问题管理**：快速获取和查看 Jira 需求和Bug
- **AI需求分析**：自动分析需求，支持生成标准化的 OpenSpec 提案
- **智能Bug分析**：定位问题代码，提供修复建议
- **批量操作**：一键获取我的Bug列表或所有待处理Bug

#### 🔄 GitLab 集成
- **Code Review自动化**：智能处理MR中的审查建议，支持AI辅助分析
- **MR创建**：一键创建Merge Request，自动关联Jira问题
- **项目自动检测**：自动识别当前Git仓库的GitLab项目
- **灵活的URL支持**：同时支持SSH和HTTPS格式的GitLab地址

#### 📄 Confluence 集成（可选）
- **文档增强**：自动获取Jira中关联的Confluence页面内容
- **智能链接识别**：检测Jira描述中的Confluence链接
- **上下文丰富**：为AI分析提供更完整的需求背景

#### 🤖 AI 驱动功能
- **需求拆解**：将复杂需求智能分解为可执行任务
- **代码生成**：基于需求规格自动生成代码框架
- **问题诊断**：分析Bug的根本原因和影响范围
- **审查辅助**：智能理解和处理Code Review意见

#### 🛠️ OpenSpec 支持
- **规范生成**：创建符合OpenSpec标准的需求规格说明
- **版本管理**：支持变更提案的版本控制
- **无缝集成**：与OpenSpec CLI工具完美配合

### 安装步骤

1. 在 VS Code 扩展市场搜索 "Jira GitLab Helper"
2. 点击"安装"按钮
3. 安装完成后，按 `Ctrl+Shift+P`（Mac 为 `Cmd+Shift+P`）打开命令面板
4. 输入并运行：`Jira GitLab Helper: 打开配置面板`
5. 按照向导配置 Jira 和 GitLab 连接

### 快速开始

#### 第一步：配置连接

**Jira 配置：**
1. 打开配置面板
2. 填写 Jira 服务器地址：
   - **Jira Cloud（云版本）**：`https://your-company.atlassian.net`
   - **Self-hosted（自托管）**：`https://jira.your-company.com`（您的自定义域名）
3. 输入用户名（通常是您的邮箱地址）
4. 选择认证方式：
   - **API Token**（推荐）：访问 [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) 创建并复制
   - **Password**：使用您的 Jira 密码（不推荐）

**GitLab 配置：**
1. 填写 GitLab 服务器地址：
   - **GitLab.com（公共版）**：`https://gitlab.com`
   - **Self-hosted（自托管）**：`https://gitlab.your-company.com`（您的自定义域名）
2. 生成访问令牌（Settings → Access Tokens）
3. Token 权限需要：`api`, `read_user`, `write_repository`

**Confluence 配置（可选）：**
1. 勾选"启用 Confluence 集成"
2. 填写 Confluence 地址：
   - **Confluence Cloud（云版本）**：`https://your-company.atlassian.net/wiki`
   - **Self-hosted（自托管）**：`https://confluence.your-company.com`（您的自定义域名）
3. 配置认证信息（与 Jira 类似）

#### 第二步：使用工作流

**需求开发流程：**
```
1. 📥 获取需求
   Ctrl+Shift+P → Jira GitLab Helper: 获取 Jira 问题
   输入问题编号（如：PROJ-123）

2. 🔍 分析需求
   在弹出的选项中选择"📊 作为需求分析"
   等待 AI 完成需求分析

3. 📝 生成提案（可选）
   选择"继续生成 OpenSpec 提案"
   系统会创建标准化的需求规格说明

4. 💻 生成代码
   基于分析结果，AI 会建议代码结构
   确认后自动生成代码文件

5. ✅ 提交代码
   选择"提交代码"命令
   自动创建符合规范的提交信息

6. 🔀 创建 MR
   一键创建 Merge Request
   自动关联 Jira 问题
```

**Bug 修复流程：**
```
1. 🐛 获取 Bug
   方式一：Ctrl+Shift+P → 获取 Jira 问题
   方式二：Ctrl+Shift+P → 获取 Bug 列表

2. 🔬 分析 Bug
   选择"🐛 作为Bug分析"
   AI 会分析问题原因并定位代码位置

3. 🛠️ 查看修复建议
   系统提供：问题根因分析、建议的修复方案、相关代码位置

4. 💡 应用修复
   根据建议修改代码或选择"应用修复"自动生成修复代码

5. ✅ 提交和创建 MR
   提交修复代码，创建 MR 并等待审查
```

**Code Review 处理流程：**
```
1. 📬 接收 MR 链接
   从 GitLab 通知或邮件中复制 MR 链接

2. 🔍 处理审查建议
   Ctrl+Shift+P → 处理 Code Review 建议
   粘贴 MR 链接

3. 📊 选择处理方式
   选项 A：在 AI 窗口处理（一次性处理所有建议）
   选项 B：逐个查看文件（手动处理每个意见）

4. ✏️ 应用更改
   根据建议修改代码，重新提交更新

5. ✅ 解决讨论
   修改完成后，在 GitLab 中标记讨论为已解决
```

### 命令列表

通过 `Ctrl+Shift+P`（Mac 为 `Cmd+Shift+P`）访问所有命令：

**配置命令：**
- **打开配置面板**：统一管理所有配置
- **配置 Jira 连接**：单独配置 Jira
- **配置 GitLab 连接**：单独配置 GitLab

**Jira 命令：**
- **获取 Jira 问题**：通过问题号获取详情
- **获取 Bug 列表**：查看我的Bug或所有待处理Bug

**分析命令：**
- **分析需求**：AI 驱动的需求分析
- **分析 Bug**：智能 Bug 诊断和修复建议

**代码操作命令：**
- **生成代码**：基于分析自动生成代码
- **提交代码**：智能生成提交信息并提交
- **创建 Merge Request**：一键创建 GitLab MR

**Code Review 命令：**
- **处理 Code Review 建议**：智能处理 MR 审查意见

### 详细配置

所有配置项都可以在 VS Code 设置中的 `Jira GitLab Helper` 部分找到：

**Jira 配置：**
| 配置项 | 说明 | 示例 |
|--------|------|------|
| Server URL | Jira 服务器地址 | Cloud: https://company.atlassian.net<br>Self-hosted: https://jira.company.com |
| Username | 登录用户名 | user@company.com |
| Auth Type | 认证方式 | apiToken / password |

**GitLab 配置：**
| 配置项 | 说明 | 示例 |
|--------|------|------|
| Server URL | GitLab 服务器地址 | GitLab.com: https://gitlab.com<br>Self-hosted: https://gitlab.company.com |
| Access Token | 访问令牌 | （保存在安全存储中） |
| Default Target Branch | 默认目标分支 | main / master |

**Confluence 配置：**
| 配置项 | 说明 | 示例 |
|--------|------|------|
| Enabled | 是否启用 Confluence | false |
| Server URL | Confluence 地址 | Cloud: https://company.atlassian.net/wiki<br>Self-hosted: https://confluence.company.com |

**AI 配置：**
| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| Provider | AI 提供商 | mcp |
| Model | 模型名称 | gpt-4 |

**通用配置：**
| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| Auto Create Branch | 自动创建 Git 分支 | true |
| Auto Commit | 自动提交代码 | false |
| Debug Mode | 调试模式 | false |

### 常见问题

**Q: OpenSpec 提案功能无法使用？**  
A: OpenSpec CLI 需要单独安装。运行命令：
```bash
npm install -g @openspec/cli
```

**Q: 无法连接到 Jira/GitLab？**  
A: 请检查：
1. 服务器地址格式是否正确
2. API Token/Access Token 是否有效
3. 网络是否可以访问服务器
4. 是否有足够的权限

**Q: GitLab 项目自动检测失败？**  
A: 确保：
1. 当前目录是一个 Git 仓库
2. 已配置 GitLab remote（origin）
3. remote URL 格式正确（SSH 或 HTTPS）

**Q: Confluence 内容获取缓慢？**  
A: 这是正常现象，特别是对于大型页面。可以：
1. 暂时禁用 Confluence 集成
2. 优化 Confluence 页面大小
3. 等待内容缓存生效

**Q: AI 分析结果不理想？**  
A: 尝试：
1. 提供更详细的 Jira 描述
2. 链接相关的 Confluence 文档
3. 在配置中切换 AI 模型
4. 启用调试模式查看详细日志

### 系统要求

- **VS Code**：1.90.0 或更高版本
- **Node.js**：14.x 或更高版本（用于 OpenSpec）
- **Git**：任意版本（用于分支和提交操作）
- **网络**：可访问 Jira、GitLab、Confluence 服务器
- **权限**：
  - Jira：浏览项目、查看问题
  - GitLab：API 访问、读写仓库
  - Confluence：查看页面（如果启用）

### 技术支持

如有问题或功能建议：
- 🐛 问题反馈：[GitHub Issues](https://github.com/dev4java/jira-gitlab-helper/issues)
- 💬 讨论：[GitHub Discussions](https://github.com/dev4java/jira-gitlab-helper/discussions)

### 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新信息。

### 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

**享受更智能的开发体验！** 🚀

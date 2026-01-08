# GitLab Integration Capability

## ADDED Requirements

### Requirement: GitLab连接配置
系统SHALL允许用户配置GitLab服务器连接信息,包括服务器地址、Personal Access Token和默认项目ID。

#### Scenario: 配置GitLab连接
- **WHEN** 用户在VSCode设置中输入GitLab服务器URL和Personal Access Token
- **THEN** 系统保存配置到工作区设置
- **AND** 系统验证Token有效性

#### Scenario: 配置默认项目
- **WHEN** 用户选择或输入GitLab项目ID
- **THEN** 系统保存默认项目ID
- **AND** 系统验证项目访问权限

### Requirement: 代码分支管理
系统SHALL支持基于JIRA问题自动创建和切换Git分支,分支命名遵循团队规范。

#### Scenario: 创建功能分支
- **WHEN** 用户开始处理JIRA需求PROJ-123
- **THEN** 系统自动创建分支 "feature/PROJ-123-brief-description"
- **AND** 系统切换到新分支

#### Scenario: 创建Bug修复分支
- **WHEN** 用户开始处理JIRA Bug PROJ-456
- **THEN** 系统自动创建分支 "bugfix/PROJ-456-brief-description"
- **AND** 系统切换到新分支

#### Scenario: 分支已存在
- **WHEN** 系统尝试创建已存在的分支
- **THEN** 系统提示用户分支已存在
- **AND** 系统询问是否切换到现有分支

### Requirement: 代码提交和推送
系统SHALL支持自动提交代码变更并推送到GitLab远程仓库,提交消息包含JIRA问题Key。

#### Scenario: 自动提交代码
- **WHEN** 用户完成代码开发并执行"提交代码"命令
- **THEN** 系统生成包含JIRA Key的提交消息
- **AND** 系统提交所有变更文件
- **AND** 系统推送到远程分支

#### Scenario: 提交消息格式化
- **WHEN** 系统生成提交消息
- **THEN** 消息格式为 "[PROJ-123] Brief description of changes"
- **AND** 消息包含变更文件列表

### Requirement: Merge Request创建
系统SHALL支持自动创建Merge Request,并关联JIRA问题。

#### Scenario: 创建MR
- **WHEN** 用户完成功能开发并执行"创建MR"命令
- **THEN** 系统创建从当前分支到目标分支的MR
- **AND** MR标题包含JIRA问题Key和标题
- **AND** MR描述包含JIRA问题链接

#### Scenario: 指定目标分支
- **WHEN** 用户创建MR时选择目标分支
- **THEN** 系统允许选择master、develop或其他分支
- **AND** 系统创建到指定分支的MR

### Requirement: Code Review建议获取
系统SHALL能够获取GitLab MR的Code Review建议和评论。

#### Scenario: 获取MR评论
- **WHEN** 用户打开已创建的MR
- **THEN** 系统显示所有Code Review评论
- **AND** 系统按文件和行号组织评论

#### Scenario: 获取变更建议
- **WHEN** GitLab CI/CD生成代码建议
- **THEN** 系统获取所有自动生成的建议
- **AND** 系统分类显示建议(错误、警告、建议)

### Requirement: Code Review建议自动处理
系统SHALL支持根据Code Review建议自动修改代码。

#### Scenario: 应用简单建议
- **WHEN** Code Review建议为简单的格式或命名修改
- **THEN** 系统自动应用建议并修改代码
- **AND** 系统提交修改并推送

#### Scenario: 复杂建议需要确认
- **WHEN** Code Review建议涉及逻辑变更
- **THEN** 系统显示建议详情
- **AND** 系统请求用户确认是否应用
- **AND** 用户确认后系统应用建议

#### Scenario: 批量处理建议
- **WHEN** MR包含多个Code Review建议
- **THEN** 系统允许用户批量选择要应用的建议
- **AND** 系统依次应用所有选中的建议
- **AND** 系统生成一次提交包含所有修改


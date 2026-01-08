# JIRA Integration Capability

## ADDED Requirements

### Requirement: JIRA连接配置
系统SHALL允许用户配置JIRA服务器连接信息,包括服务器地址、用户名和认证凭据(密码或API Token)。

#### Scenario: 配置JIRA连接信息
- **WHEN** 用户在VSCode设置中输入JIRA服务器URL、用户名和API Token
- **THEN** 系统保存配置到工作区设置
- **AND** 系统验证连接是否成功

#### Scenario: 连接验证失败
- **WHEN** 用户输入的JIRA凭据无效
- **THEN** 系统显示错误消息
- **AND** 系统提示用户检查配置

### Requirement: JIRA问题获取
系统SHALL能够根据问题Key获取JIRA问题的详细信息,包括标题、描述、类型、状态和自定义字段。

#### Scenario: 获取JIRA需求问题
- **WHEN** 用户输入有效的JIRA问题Key(如PROJ-123)
- **AND** 该问题类型为Story或Task
- **THEN** 系统返回问题的完整信息
- **AND** 系统识别该问题为需求类型

#### Scenario: 获取JIRA Bug问题
- **WHEN** 用户输入有效的JIRA问题Key
- **AND** 该问题类型为Bug
- **THEN** 系统返回问题的完整信息
- **AND** 系统识别该问题为Bug类型
- **AND** 系统提取Bug描述、复现步骤和期望行为

#### Scenario: 问题Key不存在
- **WHEN** 用户输入不存在的JIRA问题Key
- **THEN** 系统返回404错误
- **AND** 系统提示用户检查问题Key

### Requirement: JIRA问题列表查询
系统SHALL支持根据JQL(JIRA Query Language)查询问题列表,并支持按项目、状态、分配人等条件过滤。

#### Scenario: 查询当前用户的待办问题
- **WHEN** 用户执行"查询我的待办问题"命令
- **THEN** 系统使用JQL查询当前用户分配的未完成问题
- **AND** 系统在VSCode侧边栏显示问题列表

#### Scenario: 查询特定项目的问题
- **WHEN** 用户选择特定项目并执行查询
- **THEN** 系统返回该项目的所有问题
- **AND** 系统支持分页显示

### Requirement: JIRA问题状态更新
系统SHALL支持更新JIRA问题的状态,如从"待办"转换为"进行中"或"已完成"。

#### Scenario: 开始处理问题
- **WHEN** 用户选择一个待办问题并点击"开始处理"
- **THEN** 系统将问题状态更新为"进行中"
- **AND** 系统在JIRA中记录状态变更

#### Scenario: 完成问题
- **WHEN** 用户完成代码开发并执行"标记完成"命令
- **THEN** 系统将问题状态更新为"已完成"
- **AND** 系统添加完成备注


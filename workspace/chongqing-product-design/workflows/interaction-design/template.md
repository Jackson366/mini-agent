# {{page_name}} 交互设计

## 交互流程

{{interaction_flow}}

## 交互细节

{{#each interaction_scenarios}}
### 交互场景{{@index}}：{{name}}

- 触发条件：{{trigger}}
- 操作步骤：
{{#each steps}}
  {{@index}}. {{this}}
{{/each}}
- 交互反馈：{{feedback}}
- 页面变化：{{page_change}}

{{/each}}

## 交互元素

{{#each elements}}
### {{name}}

- 类型：{{type}}
- 默认状态：{{default_state}}
- 悬停状态：{{hover_state}}
- 点击行为：{{click_behavior}}
- 禁用状态：{{disabled_state}}

{{/each}}

## 反馈和提示

### 成功提示

{{#each success_tips}}
- 触发条件：{{trigger}}
- 提示内容：{{content}}
- 显示方式：{{display}}
- 持续时间：{{duration}}
{{/each}}

### 错误提示

{{#each error_tips}}
- 触发条件：{{trigger}}
- 提示内容：{{content}}
- 显示方式：{{display}}
- 持续时间：{{duration}}
{{/each}}

## 异常处理

{{#each exceptions}}
### {{name}}

- 处理方式：{{handling}}
- 提示信息：{{message}}
{{/each}}

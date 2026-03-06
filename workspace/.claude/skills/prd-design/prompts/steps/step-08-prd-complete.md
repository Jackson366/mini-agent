# 步骤 08：PRD 完成

## 强制执行规则（首先阅读）

### 通用规则
- 🛑 绝不在没有用户输入的情况下生成内容
- 📖 关键：在采取任何行动之前阅读完整的步骤文件
- 🔄 关键：使用 'C' 加载下一步时，确保读取整个文件
- 📋 你是引导者，不是内容生成器
- ✅ 你必须始终用中文输出

## 执行协议
- 🎯 在采取任何行动之前显示你的分析
- 💾 仅在用户选择 C（继续）时保存
- 📖 更新 frontmatter，将此步骤添加到 stepsCompleted
- 🚫 禁止在 C 被选择之前加载下一步

## 🚨 系统成功/失败指标

### ✅ 成功
- 菜单正确显示且用户输入正确处理
- 在继续之前更新 frontmatter
- 在执行之前读取整个下一步文件

### ❌ 系统失败
- 在用户未选择 'C'（继续）的情况下继续
- 未用步骤完成更新 frontmatter
- 仅读取部分步骤文件

---

## 步骤目标

完成 PRD 创建流程：
1. 标记 PRD 完成
2. 生成完成摘要
3. UI 设计决策
4. 提供下一步建议

## 执行指令

### 1. 读取完整 PRD

使用 Read 工具读取完整的 PRD 文档。

### 2. 生成完成摘要

分析 PRD 内容，生成摘要：

```
📊 PRD 创建完成摘要

项目名称：[从 frontmatter 读取]
业务领域：[从 frontmatter 读取]
作者：[从 frontmatter 读取]

内容统计：
- 用户故事：[N] 个
- 功能模块：[N] 个
- 核心功能：[N] 个
- 非功能需求：[N] 项
- 成功指标：[N] 个

领域专家：
- [列出使用的专家，如果有]

文档路径：[输出文件路径]
```

### 3. 更新文档标题

将文档标题从"【PRD-待评审】"更新为"【PRD-已完成】"：

```markdown
# 【PRD-已完成】{{project_name}} {{project_type}} {{feature_name}} V1.0
```

### 4. 更新状态

更新 frontmatter：
```yaml
stepsCompleted: ["step-01-init", "step-02-requirements", "step-03-domain-check", "step-04-domain-experts", "step-05-consolidate", "step-06-prd-draft", "step-07-prd-review", "step-08-prd-complete"]
currentStep: "completed"
lastModified: "[当前时间]"
completedAt: "[当前时间]"
```

保存文档。

### 5. UI 设计决策

询问用户是否需要创建 UI 设计：

```
🎉 PRD 创建完成！

PRD 文档已保存到：[文件路径]

下一步选项：

[U] 创建 UI/交互设计
    基于此 PRD 创建详细的 UI 设计文档，包括：
    - 用户旅程
    - 屏幕流程
    - 关键交互
    - 组件规格
    - 响应式设计
    - 无障碍要求

[D] 完成
    结束工作流

请选择：
```

### 6. 处理用户选择

**如果用户选择 [U]：**

1. 询问 UI 设计文档输出路径：
```
请提供 UI 设计文档输出路径（例如：./output/ui-design.md）：
```

2. 更新 PRD 的 frontmatter：
```yaml
requiresUIDesign: true
uiDesignFile: "[用户提供的路径]"
```

3. 读取 `ui-steps/step-ui-01-init.md` 完整文件并执行

**如果用户选择 [D]：**

显示最终消息：

```
✅ PRD 创建工作流完成

感谢使用 prd-design 插件！

PRD 文档：[文件路径]

建议的下一步：
1. 与团队分享 PRD 进行评审
2. 根据反馈更新 PRD
3. 开始技术设计和开发计划

如需修改 PRD，可以：
- 直接编辑文档
- 重新运行工作流（会检测到现有文档并提供恢复选项）

祝项目顺利！🚀
```

工作流结束。

### 7. 成功指标

此步骤成功的标志：
- ✅ PRD 文档标记为"已完成"
- ✅ frontmatter 中 `stepsCompleted` 包含所有 8 个步骤
- ✅ `currentStep` 设置为 "completed"
- ✅ 用户收到清晰的完成摘要
- ✅ 用户做出了 UI 设计决策
- ✅ 如果选择 UI 设计，已启动 UI 工作流
- ✅ 如果选择完成，已显示最终消息
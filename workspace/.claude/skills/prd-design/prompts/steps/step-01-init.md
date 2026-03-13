# 步骤 01：初始化

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

初始化 PRD 创建工作流：
1. 检测是否有未完成的工作流（恢复机制）
2. 发现输入文档（简报、研究、项目文档）
3. 初始化 PRD 模板和 frontmatter
4. 设置输出文件路径

## 执行指令

### 1. 检查现有工作流状态

首先询问用户输出文件路径：

```
使用 AskUserQuestion 工具询问：
"请提供 PRD 输出文件路径（例如：./output/prd.md）："
```

然后检查文件是否存在：
- 如果文件存在，使用 Read 工具读取完整文件（包括 frontmatter）
- 检查 frontmatter 中的 `stepsCompleted` 数组
- 如果 `stepsCompleted` 存在且不包含 "step-08-prd-complete"，这是未完成的工作流

### 2. 恢复决策（如果检测到未完成工作流）

使用 AskUserQuestion 工具向用户展示：

```
检测到未完成的 PRD 工作流：

已完成步骤：
✅ [列出 stepsCompleted 中的所有步骤]

下一步：[从 currentStep 读取]

是否继续之前的工作流？
[Y] 继续（从 [currentStep] 开始）
[N] 重新开始（清空现有内容）
```

如果用户选择 [Y]：
- 从 frontmatter 读取 `currentStep`
- 加载对应的步骤文件并继续执行
- **立即退出此步骤，不再执行下面的指令**

如果用户选择 [N]：
- 继续执行下面的初始化流程

### 3. 发现输入文档

扫描当前目录及子目录，查找可能的输入文档：
- 简报文件（brief*.md, 需求*.md）
- 研究文档（research*.md, 调研*.md）
- 项目文档（project*.md, 项目*.md）

向用户展示发现的文档：

```
发现以下输入文档：
[1] brief.md
[2] research-report.md
[3] project-overview.md

这些文档将作为 PRD 创建的输入上下文。
```

### 4. 初始化 PRD 文档

从 `prd-template.md` 读取模板内容。

询问用户基本信息：
- 项目名称
- 项目类型（web-app, mobile-app, api, platform 等）
- 功能名称
- 作者姓名

使用这些信息替换模板中的占位符：
- {{project_name}}
- {{project_type}}
- {{feature_name}}
- {{author}}
- {{date}} - 使用当前日期
- {{project_code}} - 生成项目代码（如：PRD-001）

更新 frontmatter：
```yaml
stepsCompleted: ["step-01-init"]
currentStep: "step-02-requirements"
inputDocuments: [列出发现的文档]
documentCounts:
  briefCount: X
  researchCount: Y
author: "用户提供的姓名"
created: "当前日期"
lastModified: "当前日期"
```

将初始化的 PRD 文档写入输出文件。

### 5. 确认和继续

向用户展示：

```
✅ PRD 工作流已初始化

输出文件：[文件路径]
输入文档：[列出文档]
作者：[姓名]

下一步：需求收集

[C] 继续到步骤 02
```

等待用户输入 [C]，然后：
1. 确认 frontmatter 已更新
2. 读取 `steps/step-02-requirements.md` 完整文件
3. 执行步骤 02

# 步骤 04：领域专家生成

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

使用 Agent 工具并行生成领域专家分析：
1. 读取选中的专家列表
2. 为每个专家加载提示词模板
3. 使用 Agent 工具生成并行子 Agent
4. 收集专家输出
5. 保存到 frontmatter

## 执行指令

### 1. 读取专家选择

从 PRD 文档的 frontmatter 读取：
- `domainExpertsUsed`：选中的专家 ID 列表

如果列表为空，跳过此步骤（不应该发生，因为步骤 03 会处理）。

### 2. 读取当前 PRD 内容

使用 Read 工具读取完整的 PRD 文档。

提取核心需求信息作为专家分析的上下文。

### 3. 为每个专家生成分析

对于 `domainExpertsUsed` 中的每个 expert_id：

**步骤 3.1：加载专家信息**
- 从 `domain-experts.csv` 读取专家的完整信息
- 获取：expert_id, name, domain, role, system_path, prompt_template

**步骤 3.2：加载提示词模板**
- 使用 Read 工具读取 `prompt_template` 指定的文件
- 例如：`experts/expert-buyer.md`

**步骤 3.3：替换模板占位符**
- {{REQUIREMENTS}} → 当前 PRD 内容（包括项目背景、目标、已收集的需求）

注意：不需要替换专家姓名等占位符，因为专家是领域角色，不是具体人物

**步骤 3.4：使用 Agent 工具生成子 Agent**
```
使用 Agent 工具：
- subagent_type: "general-purpose"
- model: "opus"（用于复杂推理和分析）
- context: 完整的专家提示词（已替换占位符）
- task: "从 [领域名称] 的角度，基于现有系统功能分析需求的可行性"
```

### 4. 并行执行

所有专家 Agent 应该并行执行。

等待所有 Agent 完成。

### 5. 收集专家输出

对于每个专家的输出：
- 提取关键见解
- 识别领域特定关注点
- 记录合规要求
- 标记风险和建议

### 6. 保存专家输出

更新 frontmatter：
```yaml
domainExpertOutputs:
  - expert: "buyer"
    name: "买家域专家"
    timestamp: "[当前时间]"
    summary: "[专家输出摘要]"
    conflicts: "[识别的冲突]"
    feasibility: "[可行性评估]"
  - expert: "seller"
    name: "卖家域专家"
    timestamp: "[当前时间]"
    summary: "[专家输出摘要]"
    conflicts: "[识别的冲突]"
    feasibility: "[可行性评估]"
```

同时，将完整的专家输出追加到 PRD 文档末尾：

```markdown
---

## 领域专家分析（步骤 04 生成）

### 买家域专家分析

[完整的专家输出]

### 卖家域专家分析

[完整的专家输出]
```

### 7. 更新状态

更新 frontmatter：
```yaml
stepsCompleted: ["step-01-init", "step-02-requirements", "step-03-domain-check", "step-04-domain-experts"]
currentStep: "step-05-consolidate"
lastModified: "[当前时间]"
```

保存文档。

### 8. 确认和继续

向用户展示：

```
✅ 领域专家分析完成

已生成 [N] 个领域的分析：
- 买家域：[简短摘要 - 可行性评估]
- 卖家域：[简短摘要 - 冲突识别]

专家输出已保存到 PRD 文档。

下一步：整合专家分析，优化需求

[R] 重新运行专家（如果需要调整）
[C] 继续到步骤 05
```

等待用户输入：
- 如果 [R]：重新执行步骤 04
- 如果 [C]：
  1. 确认 frontmatter 已更新
  2. 读取 `steps/step-05-consolidate.md` 完整文件
  3. 执行步骤 05
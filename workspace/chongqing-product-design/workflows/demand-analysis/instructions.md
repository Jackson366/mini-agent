# Demand Analysis - Demand Analysis Instructions

<critical>The workflow execution engine is governed by: {project-root}/chongqing-product-design/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/chongqing-product-design/workflows/demand-analysis/workflow.yaml</critical>

<workflow>
  <step n="1" goal="需求理解阶段">
    <action>输入：用户提出的需求描述；业务背景信息；现有系统情况</action>
    <action>阅读和理解需求描述</action>
    <action>识别需求的核心目标</action>
    <action>识别涉及的业务域</action>
    <action>识别需求的类型（新功能、优化、修复）</action>
    <action>产出：需求理解摘要；初步问题清单(反问用户)</action>
  </step>

  <step n="2" goal="需求分析阶段">
    <action>输入：需求理解摘要；用户反馈</action>
    <action>分析需求的业务价值</action>
    <action>识别用户角色和使用场景</action>
    <action>分析功能需求和非功能需求</action>
    <action>识别需求的依赖和约束</action>
    <action>评估需求的复杂度和风险</action>
    <action>产出：需求分析文档（业务场景描述、功能清单、问题和风险清单）</action>
  </step>

  <step n="3" goal="需求确认阶段">
    <action>输入：需求分析文档；用户反馈</action>
    <action>与用户确认需求理解</action>
    <action>澄清模糊点和疑问</action>
    <action>确认需求优先级</action>
    <action>确认验收标准</action>
    <action>产出：确认的需求分析文档；需求优先级列表；验收标准清单</action>
  </step>
</workflow>

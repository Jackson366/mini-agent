# PRD Only - Instructions

<critical>The workflow execution engine is governed by: {project-root}/chongqing-product-design/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/chongqing-product-design/workflows/prd-only/workflow.yaml</critical>

<workflow>
  <step n="1" goal="需求确认">
    <input>
      - 用户提出的需求描述
      - 已有的需求分析文档（如有）
    </input>
    <action>
    - 确认需求范围
    - 识别涉及的业务域
    - 确定PRD编写范围
    </action>
    <output>
    - 业务域列表
    - PRD编写范围确认
    </output>
  </step>

  <step n="2" goal="业务域PRD编写" repeat="for-each-domain">
    <input>
    - 需求描述
    - 当前业务域
    - 业务域知识库
    </input>
    <action>
    - 调度对应业务域产品专家
    - 加载业务域知识库
    - 编写业务域PRD
    </action>
    <output>
    - 业务域PRD文档
    </output>
  </step>

  <step n="3" goal="PRD一致性检查">
    <input>
    - 所有业务域PRD
    </input>
    <action>
    - 检查各业务域PRD的一致性
    - 检查跨域交互的完整性
    - 识别并解决冲突
    </action>
    <output>
    - 一致性检查报告
    - 修正后的PRD
    </output>
  </step>

  <step n="4" goal="整合输出">
    <input>
    - 所有业务域PRD
    </input>
    <action>
    - 整合所有PRD文档
    - 生成最终PRD文档
    - 输出到 {output_folder}
    </action>
    <output>
    - 完整PRD文档
    </output>
  </step>
</workflow>

# UI Only - Instructions

<critical>The workflow execution engine is governed by: {project-root}/chongqing-product-design/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/chongqing-product-design/workflows/ui-only/workflow.yaml</critical>

<workflow>
  <step n="1" goal="设计输入确认">
    <input>
      - PRD文档或功能描述
      - 设计规范
    </input>
    <action>
    - 确认设计范围
    - 识别需要设计的页面
    - 加载设计规范
    </action>
    <output>
    - 页面清单
    - 设计范围确认
    </output>
  </step>

  <step n="2" goal="UI布局设计">
    <input>
    - PRD文档
    - 页面清单
    - 设计规范
    </input>
    <action>
    - 调度UI布局设计师
    - 根据PRD设计页面布局
    - 检查布局规范
    </action>
    <output>
    - UI布局设计方案
    </output>
  </step>

  <step n="3" goal="UI交互设计">
    <input>
    - UI布局设计方案
    - PRD文档
    </input>
    <action>
    - 调度UI交互设计师
    - 设计页面交互流程
    - 设计状态变化
    - 设计错误提示
    </action>
    <output>
    - UI交互设计方案
    </output>
  </step>

  <step n="4" goal="设计审查">
    <input>
    - UI布局设计方案
    - UI交互设计方案
    </input>
    <action>
    - 检查设计规范符合性
    - 检查交互完整性
    - 检查一致性
    </action>
    <output>
    - 设计审查报告
    </output>
  </step>

  <step n="5" goal="整合输出">
    <input>
    - UI布局设计方案
    - UI交互设计方案
    </input>
    <action>
    - 整合UI设计文档
    - 输出到 {output_folder}
    </action>
    <output>
    - 完整UI设计文档
    </output>
  </step>
</workflow>

# Merchant PRD - Instructions

<critical>The workflow execution engine is governed by: {project-root}/chongqing-product-design/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/chongqing-product-design/workflows/merchant-prd/workflow.yaml</critical>

<workflow>
  <step n="1" goal="需求理解">
    <input>
      - 需求分析师提供的需求分析文档
      - 商家域相关需求
    </input>
    <action>
    - 阅读和理解需求
    - 识别涉及的功能模块
    - 分析功能的业务价值
    - 识别功能的依赖和约束
    </action>
    <output>
    - 需求理解摘要
    - 功能模块清单
    </output>
  </step>

  <step n="2" goal="功能设计">
    <input>
    - 需求理解摘要
    - 功能模块清单
    - 商家域知识库
    </input>
    <action>
    - 设计功能流程
    - 设计页面布局
    - 设计交互细节
    - 定义字段和规则
    - 设计异常处理
    </action>
    <output>
    - 功能设计文档
    - 页面原型说明
    - 交互说明
    </output>
  </step>

  <step n="3" goal="PRD编写">
    <input>
    - 功能设计文档
    - PRD标准模板
    </input>
    <action>
    - 按照PRD标准模板编写PRD
    - 描述功能需求和交互细节
    - 定义字段说明和业务规则
    - 定义验收标准
    <critical>
    - <strong>禁止包含技术实现细节</strong>：数据库设计、API接口定义、前端组件代码等应放在技术设计文档中
    - <strong>必须说明业务价值</strong>：每个功能都要描述为什么需要、带来什么价值
    - <strong>重点描述用户场景</strong>：从用户角度描述功能如何使用
    - <strong>功能描述说明"做什么"而非"怎么做"</strong>
    - <strong>技术内容占比控制在20%以内</strong>
    </critical>
    </action>
    <output>
    - 商家域PRD文档
    </output>
  </step>

  <step n="4" goal="PRD审查">
    <input>
    - 商家域PRD文档
    </input>
    <action>
    - 检查PRD完整性
    - 检查功能描述清晰度
    - 检查业务规则明确性
    - 检查验收标准可测性
    </action>
    <output>
    - 审查后的PRD文档
    - 输出到 {output_folder}
    </output>
  </step>
</workflow>

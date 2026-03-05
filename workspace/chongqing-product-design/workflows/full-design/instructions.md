# Full Design - Instructions

<critical>The workflow execution engine is governed by: {project-root}/chongqing-product-design/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/chongqing-product-design/workflows/full-design/workflow.yaml</critical>

<workflow>
  <step n="1" goal="需求分析阶段">
    <input>
      - 用户提出的需求描述
      - 业务背景信息
    </input>
    <action>
    - 调度需求分析师Agent
    - 执行需求分析工作流: {project-root}/chongqing-product-design/workflows/demand-analysis/workflow.yaml
    - 获取需求分析结果
    - <critical>提取并设置feature_name变量</critical>：
      * 如果用户输入中包含明确的功能名称，直接使用
      * 如果没有明确名称，从需求描述中提取核心功能名称（2-8个汉字/英文单词）
      * 提取规则：核心动词+名词组合，或业务场景关键词
      * 将提取的名称设置为 workflow 变量：feature_name
      * 在后续所有步骤中通过 {{feature_name}} 引用
    </action>
    <output>
    - 需求分析文档
    - 识别的业务域列表
    - feature_name：功能名称变量（供后续步骤使用）
    </output>
  </step>

  <step n="2" goal="业务域识别">
    <input>
    - 需求分析文档
    </input>
    <action>
    - 根据关键词识别涉及的业务域：
      - 买家域：买家、注册、登录、询价、订单、售后
      - 商家域：卖家、入驻、商品、店铺、客户
      - 服务商域：服务商、服务产品、服务咨询、服务订单
      - 平台运营域：运营、审核、管理、配置
    - 确定需要调度的业务域专家
    </action>
    <output>
    - 业务域列表
    - 待调度的专家Agent列表
    </output>
  </step>

  <step n="3" goal="PRD编写阶段" repeat="for-each-domain">
    <input>
    - 需求分析文档
    - 当前业务域
    </input>
    <action>
    - 调度对应业务域产品专家
    - 加载业务域知识库
    - 编写业务域PRD
    - 检查PRD质量
    </action>
    <output>
    - 业务域PRD文档
    </output>
  </step>

  <step n="4" goal="PRD一致性检查">
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

  <step n="5" goal="UI布局设计阶段">
    <input>
    - 确认后的PRD文档
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

  <step n="6" goal="UI交互设计阶段">
    <input>
    - UI布局设计方案
    - PRD文档
    </input>
    <action>
    - 调度UI交互设计师
    - 设计页面交互流程
    - 检查交互规范
    </action>
    <output>
    - UI交互设计方案
    </output>
  </step>

  <step n="7" goal="生成文档索引">
    <input>
    - 需求分析文档
    - 所有业务域PRD
    - UI设计方案
    - feature_name：功能名称变量
    </input>
    <action>
    - <critical>不要整合内容</critical>：各业务域PRD和UI设计文档保持独立
    - 生成文档索引，列出所有文档的相对路径
    - <critical>使用feature_name动态命名文件夹</critical>：
      - {{feature_name}}-需求分析/
      - {{feature_name}}-PRD文档/
      - {{feature_name}}-UI设计/
    - 使用 template.md 模板生成索引文档
    - 替换模板中的 {{feature_name}} 变量为实际的功能名称
    - 输出索引文档到 {output_folder}/{{feature_name}}_设计文档索引.md
    </action>
    <output>
    - {{feature_name}}_设计文档索引.md（包含所有文档的路径链接）
    - 各文档保持独立，不进行内容整合
    </output>
  </step>
</workflow>

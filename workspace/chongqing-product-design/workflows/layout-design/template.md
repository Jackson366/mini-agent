# {{page_name}} 布局设计

## 页面类型

{{page_type}}

## 布局类型

{{layout_type}}

## 页面结构

```
{{layout_diagram}}
```

## 区域说明

{{#each regions}}
### 区域{{@index}}：{{name}}

- 位置：{{position}}
- 尺寸：{{size}}
- 内容：{{content}}

{{/each}}

## 响应式规则

- 大屏（≥1440px）：{{responsive.large}}
- 中屏（1024px-1439px）：{{responsive.medium}}
- 小屏（768px-1023px）：{{responsive.small}}
- 移动端（<768px）：{{responsive.mobile}}

## 组件清单

{{#each components}}
- {{name}}：{{usage}}
{{/each}}

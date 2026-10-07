# 衡准数据标注工作台

面向图像、音频和文本标注团队的本地工作台，基于 React、TypeScript、Vite、MUI、Zustand、TanStack Query、Canvas 和 React Router。

## 运行

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm build
```

## 功能

- 图像矩形框、多边形、关键点标注，支持缩放、平移、吸附和快捷键。
- 长音频波形渲染、播放、片段创建、标签和片段回放。
- 文本区间选择、分类、文档级标签和区间高亮。
- 标签模板、自定义标签、自动保存、撤销重做和批量样本切换。
- 审核视图并排展示多名标注员结果，逐项选择结果处理冲突。
- mock 样本、标注和审核队列保存在浏览器本地。

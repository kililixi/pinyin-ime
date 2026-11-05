# @startsi/vue-handwriting

Vue3 中文手写板。识别器是 [HanScribe](https://github.com/peterolson/hanscribe)（MIT）：
4 层 BiLSTM、12,361 字、纯 JS 推理跑在 Worker 里，**完全离线**。

## 安装

```bash
npm i @startsi/vue-handwriting
```

## 模型

7.5MB 的模型文件**不在这个包里**，需要自己提供：

```bash
# 从 han scribe 仓库下载
curl -L -o public/hw/hz.hzmodel \
  https://cdn.jsdelivr.net/gh/peterolson/hanscribe@v0.1.1/test/test.hzmodel
```

## 用法

```vue
<script setup>
  import { HandwritingPad } from '@startsi/vue-handwriting'
  import '@startsi/vue-handwriting/style.css'

  // 浏览器：直接给 URL
  const modelUrl = '/hw/hz.hzmodel'

  // Electron：主进程读字节，经 IPC 传过来（生产环境渲染进程读不了 file://）
  const loadModel = () => window.api.readModel()
</script>

<template>
  <HandwritingPad :model-url="modelUrl" @pick="onPick" @back="onBack" />
  <!-- 或 -->
  <HandwritingPad :load-model="loadModel" @pick="onPick" />
</template>
```

## Props / 事件

| prop | 说明 |
|---|---|
| `size` | 画布边长，默认 320 |
| `topK` | 候选个数，默认 10 |
| `strokeColor` / `strokeWidth` | 笔画样式 |
| `loadModel` | 返回 `ArrayBuffer \| Blob`，优先于 `modelUrl` |
| `modelUrl` | 模型地址 |

事件：`pick(char)`、`back`、`error(message)`

## CSP 要求

宿主页面需要放行两条，否则 worker / wasm 会被拦：

```
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';
worker-src 'self' blob:;
```

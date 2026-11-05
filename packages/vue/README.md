# @startsi/vue-pinyin-ime

Vue3 中文拼音输入控件。**不依赖 Element / Ant / 任何 UI 框架**，也不需要 simple-keyboard。

## 安装

```bash
npm i @startsi/vue-pinyin-ime @startsi/pinyin-core @startsi/vue-handwriting
```

## 用法

```vue
<script setup>
  import { PinyinInput } from '@startsi/vue-pinyin-ime'
  import '@startsi/vue-pinyin-ime/style.css'

  const name = ref('')
</script>

<template>
  <PinyinInput v-model="name" title="姓名" />
</template>
```

组件自带触发器（一个按钮样式的输入框），点开就是弹层。想用自己的触发器：

```vue
<PinyinInput v-model="name" title="姓名">
  <template #trigger="{ open, value }">
    <el-input readonly :model-value="value" @click="open" />
  </template>
</PinyinInput>
```

## Props

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `v-model` | `string` | — | 输入值 |
| `title` | `string` | `''` | 弹层标题；同时用于判断姓名/号码字段 |
| `numeric` | `boolean` | 自动 | 纯数字键盘（身份证 0-9 + X）；标题含 身份证/电话/号码 时自动开启 |
| `nameMode` | `boolean` | 自动 | 姓名候选（王伟 / 张敏） |
| `layout` | `'auto' \| 'split' \| 'stack'` | `auto` | 九宫格默认左右分栏，全键盘上下 |
| `maxLength` | `number` | 64 | |
| `loadModel` | `() => Promise<ArrayBuffer \| Blob>` | — | 手写模型字节（Electron 走 IPC） |
| `modelUrl` | `string` | — | 手写模型 URL |
| `onExternalHandwriting` | `(open: boolean) => void` | — | 传了就用外部手写程序 |

## 事件

`update:modelValue`、`confirm`、`commit(text)`、`error(message)`

## 键盘

- **九宫格**：4 列，键宽约为全键盘的 2.5 倍，适合不灵敏的触摸屏
- **全键盘**：11 列
- 两者在设置里互切，选择写进 `localStorage`（键名 `storageKey`）
- 长按「删」连删（450ms 后每 80ms 删一个）

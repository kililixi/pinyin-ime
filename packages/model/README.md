# @startsi/handwriting-model

HanScribe 中文手写识别模型：4 层 BiLSTM，12,361 字，uint8 量化，7.5MB。

配套 [`@startsi/vue-handwriting`](../handwriting) 使用。单独发包是因为大部分项目不需要手写，
不该为它多下 7.5MB。

## 用法

**Vite / 浏览器** —— 让打包器把模型当静态资源：

```ts
import modelUrl from '@startsi/handwriting-model/hz.hzmodel?url'

<HandwritingPad :model-url="modelUrl" @pick="onPick" />
```

**Electron** —— 主进程读文件，经 IPC 交给渲染进程：

```ts
// main
const modelPath = path.join(
  path.dirname(require.resolve('@startsi/handwriting-model/package.json')),
  'hz.hzmodel'
)
ipcMain.handle('hw:model', () => fs.readFileSync(modelPath))

// renderer
<PinyinInput :load-model="() => ipcRenderer.invoke('hw:model')" />
```

## 许可

模型来自 [HanScribe](https://github.com/peterolson/hanscribe)（MIT）。

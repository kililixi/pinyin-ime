# 第三方数据与代码声明

本项目包含或派生了以下第三方成果，发布时请保留本文件。

## 词库

| 来源 | 用途 | 许可 |
|---|---|---|
| [jieba](https://github.com/fxsjy/jieba) `dict.txt` | 13 万词条与基础词频 | MIT |
| [pinyin-pro](https://github.com/zh-lx/pinyin-pro) | **仅构建期**用于「词 → 拼音」 | MIT |
| [OpenCC](https://github.com/BYVoid/OpenCC)（`opencc-js`） | **仅构建期**繁转简 | MIT / Apache-2.0 |
| OpenSubtitles `zh_CN.freq`（经 [OPUS](https://opus.nlpl.eu/) 分发） | 口语词频权重、bigram 语言模型 | 见 OPUS 页面标注 |

`@startsi/pinyin-core` 里的 `dict/*.ts` 是上述数据**重新编译后的产物**：

- 词条、词频、拼音索引：由 jieba 词表 + pinyin-pro 转换而来
- bigram 统计：从字幕语料里**统计得到的词对频次**，不包含任何原始句子

## 手写

| 来源 | 用途 | 许可 |
|---|---|---|
| [HanScribe](https://github.com/peterolson/hanscribe) | 手写识别库与模型 `hz.hzmodel` | MIT |
| [hanzi-writer](https://github.com/chanind/hanzi-writer)（同作者） | 无，仅格式参考 | MIT |

`@startsi/handwriting-model` 直接再分发 HanScribe 的模型文件，版权归 Peter Olson。

## 运行时依赖

| 包 | 许可 |
|---|---|
| vue | MIT |
| hanscribe | MIT |

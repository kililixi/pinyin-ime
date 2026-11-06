<script setup lang="ts">
  import { ref } from 'vue'
  import { PinyinInput } from '@startsi/vue-pinyin-ime'
  import { HandwritingPad } from '@startsi/vue-handwriting'

  const name = ref('')
  const address = ref('')
  const idNo = ref('')
  const free = ref('')

  // 模型：playground 里放在 public/hw/，生产环境自己决定放哪。
  // PinyinInput 内置手写也要靠它，所以两个组件都要传。
  const modelUrl = '/hw/hz.hzmodel'
  const handwritten = ref('')

  const log = ref<string[]>([])
  const onCommit = (text: string) => {
    log.value = [text, ...log.value].slice(0, 8)
  }
</script>

<template>
  <h1 class="title">拼音输入法 playground</h1>
  <p class="sub">
    九宫格 / 全键盘 / 数字键盘 / 手写，全部来自
    <code>@startsi/vue-pinyin-ime</code>，无 UI 框架依赖。
  </p>

  <section class="card">
    <h2>表单字段</h2>
    <div class="grid">
      <label class="field">
        <span>姓名</span>
        <PinyinInput
          v-model="name"
          title="姓名"
          placeholder="请输入姓名"
          :model-url="modelUrl"
          @commit="onCommit"
        />
        <em>{{ name || '（空）' }}</em>
      </label>

      <label class="field">
        <span>邮寄地址</span>
        <PinyinInput
          v-model="address"
          title="邮寄地址"
          placeholder="请输入地址"
          :max-length="120"
          :model-url="modelUrl"
          @commit="onCommit"
        />
        <em>{{ address || '（空）' }}</em>
      </label>

      <label class="field">
        <span>身份证号</span>
        <PinyinInput
          v-model="idNo"
          title="身份证号"
          placeholder="18 位，末位可能是 X"
          :model-url="modelUrl"
        />
        <em>{{ idNo || '（空）' }}</em>
      </label>

      <label class="field span2">
        <span>自由输入（不传 title，走普通文本键盘）</span>
        <PinyinInput
          v-model="free"
          placeholder="随便打点字"
          :model-url="modelUrl"
          @commit="onCommit"
        />
        <em>{{ free || '（空）' }}</em>
      </label>
    </div>
    <div v-if="log.length" class="log">
      最近上屏：<code v-for="(t, i) in log" :key="i">{{ t }}</code>
    </div>
  </section>

  <section class="card">
    <h2>手写板（独立组件）</h2>
    <HandwritingPad
      :model-url="modelUrl"
      :size="300"
      @pick="(c) => (handwritten += c)"
      @error="(e) => (handwritten = '加载失败：' + e)"
    />
    <div class="log">
      识别结果：<em>{{ handwritten || '（还没写）' }}</em>
      <button class="mini" @click="handwritten = ''">清空结果</button>
    </div>
  </section>

  <section class="card">
    <h2>说明</h2>
    <ul class="notes">
      <li>姓名 / 号码类字段会按标题自动切键盘（姓名出姓名候选，号码走数字键盘）</li>
      <li>九宫格默认左右分栏，全键盘上下；切换会写进 localStorage</li>
      <li>长按「删」可以连删</li>
      <li>手写模型放在 <code>playground/public/hw/hz.hzmodel</code></li>
    </ul>
  </section>
</template>

<style>
  .title {
    font-size: 24px;
    margin: 0 0 6px;
  }

  .sub {
    color: #6b7a8c;
    font-size: 14px;
    margin: 0 0 20px;
  }

  .card {
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
    margin-bottom: 20px;
    padding: 18px 20px;
  }

  .card h2 {
    font-size: 16px;
    margin: 0 0 14px;
  }

  .grid {
    display: grid;
    gap: 16px;
    grid-template-columns: 1fr 1fr;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field > span {
    color: #4a5866;
    font-size: 13px;
  }

  .field em {
    color: #8ba0b6;
    font-size: 13px;
    font-style: normal;
    min-height: 18px;
  }

  .field.span2 {
    grid-column: 1 / -1;
  }

  .log {
    color: #6b7a8c;
    font-size: 13px;
    margin-top: 14px;
  }

  .log code {
    background: #eef3f9;
    border-radius: 4px;
    margin-right: 6px;
    padding: 2px 6px;
  }

  .mini {
    background: #f2f5f9;
    border: 1px solid #d6e2ee;
    border-radius: 4px;
    cursor: pointer;
    margin-left: 8px;
    padding: 2px 8px;
  }

  .notes {
    color: #4a5866;
    font-size: 13px;
    line-height: 1.9;
    margin: 0;
    padding-left: 18px;
  }

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>

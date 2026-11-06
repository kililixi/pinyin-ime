<!-- 候选条：拼音串 + 候选 + 翻页（行内固定高度，不挤动键盘） -->
<script setup lang="ts">
  import type { Candidate } from '@startsi/pinyin-core'

  withDefaults(
    defineProps<{
      preedit: string
      candidates: Candidate[]
      page: number
      pageCount: number
      /** 竖排（左右分栏时用） */
      column?: boolean
      /** 九宫格音节候选（kong / kou / lou…） */
      syllables?: string[]
      /** 当前选中的音节 */
      activeSyllable?: string | null
    }>(),
    { column: false, syllables: () => [], activeSyllable: null }
  )

  const emit = defineEmits<{
    (e: 'select', index: number): void
    (e: 'prev'): void
    (e: 'next'): void
    (e: 'cancel'): void
    /** 点音节：传 null 表示取消过滤 */
    (e: 'pickSyllable', py: string | null): void
  }>()

  const label = (index: number) =>
    index < 9 ? String(index + 1) : index === 9 ? '0' : ''
</script>

<template>
  <div :class="['pi-cand', column ? 'is-column' : 'is-row']">
    <div class="pi-cand-head">
      <span v-if="preedit" class="pi-preedit">{{ preedit }}</span>
      <span v-else class="pi-hint">拼音候选</span>
      <div v-if="syllables.length" class="pi-syllables">
        <button
          v-for="py in syllables"
          :key="py"
          type="button"
          :class="['pi-syllable', py === activeSyllable ? 'is-active' : '']"
          @click="emit('pickSyllable', py === activeSyllable ? null : py)"
        >
          {{ py }}
        </button>
      </div>
      <button
        v-if="preedit"
        class="pi-cancel"
        type="button"
        title="取消组词"
        @click="emit('cancel')"
      >
        ×
      </button>
      <div v-if="pageCount > 1" class="pi-pager">
        <button type="button" :disabled="page <= 0" @click="emit('prev')">▲</button>
        <span>{{ page + 1 }}/{{ pageCount }}</span>
        <button
          type="button"
          :disabled="page >= pageCount - 1"
          @click="emit('next')"
        >
          ▼
        </button>
      </div>
    </div>

    <div v-if="candidates.length" class="pi-cands">
      <button
        v-for="(item, index) in candidates"
        :key="item.w + '_' + index"
        type="button"
        :class="['pi-cand-item', index === 0 ? 'is-first' : '', 't-' + item.type]"
        @click="emit('select', index)"
      >
        <em v-if="label(index)">{{ label(index) }}</em>
        <span class="pi-word">{{ item.w }}</span>
      </button>
    </div>
    <div v-else class="pi-cands pi-cands-empty">
      {{ preedit ? '没有匹配的拼音' : '点键盘开始输入' }}
    </div>
  </div>
</template>

<style>
  .pi-cand {
    background: #fff;
    border: 1px solid #b5c5d2;
    border-radius: 6px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 4px 10px 8px;
  }

  .pi-cand.is-row {
    height: 150px;
  }

  .pi-cand-head {
    align-items: center;
    column-gap: 8px;
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: space-between;
    min-height: 40px;
    row-gap: 4px;
  }

  .pi-preedit {
    color: #0057c2;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 22px;
    letter-spacing: 1px;
    overflow: hidden;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 4px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pi-hint {
    color: #a8b6c5;
    font-size: 15px;
  }

  .pi-syllables {
    display: flex;
    flex: 1 1 auto;
    gap: 6px;
    margin-left: 10px;
    min-width: 0;
    overflow: hidden;
  }

  .pi-syllable {
    background: #f2f5f9;
    border: 1px solid #d6e2ee;
    border-radius: 999px;
    color: #4a5866;
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 12px;
    min-height: 26px;
    padding: 1px 9px;
    white-space: nowrap;
  }

  .pi-syllable.is-active {
    background: #0057c2;
    border-color: #0057c2;
    color: #fff;
  }

  .pi-cancel {
    background: #f2f5f9;
    border: none;
    border-radius: 50%;
    color: #778899;
    cursor: pointer;
    font-size: 18px;
    height: 30px;
    line-height: 1;
    margin-left: 8px;
    width: 30px;
  }

  .pi-pager {
    align-items: center;
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .pi-pager button {
    background: #f2f5f9;
    border: 1px solid #badbff;
    border-radius: 4px;
    color: #0057c2;
    cursor: pointer;
    font-size: 16px;
    height: 34px;
    width: 40px;
  }

  .pi-pager button[disabled] {
    color: #c8d2dc;
  }

  .pi-pager span {
    color: #8ba0b6;
    font-size: 13px;
  }

  .pi-cands {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: nowrap;
    gap: 8px;
    overflow: hidden;
  }

  .pi-cand.is-column .pi-cands {
    align-content: start;
    display: grid;
    gap: 8px;
    grid-auto-rows: 52px;
    grid-template-columns: 1fr 1fr;
    overflow-y: auto;
  }

  .pi-cand-item {
    align-items: center;
    background: #f5f8fc;
    border: 1px solid #d6e2ee;
    border-radius: 6px;
    color: #1c1e21;
    cursor: pointer;
    display: flex;
    flex: 1 1 0;
    font-size: 25px;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .pi-cand.is-column .pi-cand-item {
    justify-content: flex-start;
  }

  .pi-cand-item:active {
    background: #cfe3ff;
    border-color: #0057c2;
  }

  .pi-cand-item.is-first {
    background: #e8f1fd;
    border-color: #0057c2;
    color: #0057c2;
  }

  .pi-cand-item em {
    color: #8ba0b6;
    flex: 0 0 auto;
    font-size: 13px;
    font-style: normal;
    margin-right: 4px;
  }

  .pi-cand-item .pi-word {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pi-cand-item.t-name {
    border-style: dashed;
  }

  .pi-cands-empty {
    align-items: center;
    color: #a8b6c5;
    font-size: 15px;
  }
</style>

/**
 * 设置持久化工具 - 使用 localStorage 存储用户设置
 */

import type { EncoderSettings } from '../types'
import { DEFAULT_ENCODER_SETTINGS } from '../types'

const SETTINGS_KEY = 'screen-share-settings'

/**
 * 保存编码设置到 localStorage
 */
export function saveSettings(settings: EncoderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    // 忽略存储错误 (如隐私模式)
  }
}

/**
 * 从 localStorage 加载编码设置
 * 如果没有保存的设置或解析失败，返回默认设置
 */
export function loadSettings(): EncoderSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<EncoderSettings>
      // 合并默认设置，确保所有字段都有值
      return {
        ...DEFAULT_ENCODER_SETTINGS,
        ...parsed,
      }
    }
  } catch (e) {
    // 解析失败，返回默认设置
  }
  return { ...DEFAULT_ENCODER_SETTINGS }
}

/**
 * 清除保存的设置
 */
export function clearSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY)
  } catch (e) {
    // 忽略错误
  }
}

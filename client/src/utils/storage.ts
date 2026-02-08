/**
 * 设置持久化工具 - 使用 localStorage 存储用户设置
 */

import type { EncoderSettings, RoomMode } from '../types'
import { DEFAULT_ENCODER_SETTINGS } from '../types'

const SETTINGS_KEY = 'screen-share-settings'
const USERNAME_KEY = 'screen-share-username'
const ROOM_HISTORY_KEY = 'screen-share-room-history'
const SESSION_KEY = 'screen-share-session'

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

/**
 * 保存用户名
 */
export function saveUsername(name: string): void {
  try {
    localStorage.setItem(USERNAME_KEY, name)
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 加载用户名
 */
export function loadUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 保存房间号到历史记录（最近 10 条，去重，新的在前）
 */
export function saveRoomHistory(roomId: string): void {
  try {
    const history = loadRoomHistory()
    const filtered = history.filter(id => id !== roomId)
    filtered.unshift(roomId)
    localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)))
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 加载房间历史记录
 */
export function loadRoomHistory(): string[] {
  try {
    const saved = localStorage.getItem(ROOM_HISTORY_KEY)
    if (saved) {
      return JSON.parse(saved) as string[]
    }
  } catch (e) {
    // 忽略错误
  }
  return []
}

/**
 * 从历史记录中删除指定房间号
 */
export function removeRoomHistory(roomId: string): void {
  try {
    const history = loadRoomHistory()
    localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(history.filter(id => id !== roomId)))
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 会话信息（用于刷新恢复）
 */
export interface SessionInfo {
  roomId: string
  mode: RoomMode
  isHost?: boolean
}

/**
 * 保存当前会话
 */
export function saveSession(session: SessionInfo): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (e) {
    // 忽略错误
  }
}

/**
 * 加载当前会话
 */
export function loadSession(): SessionInfo | null {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      return JSON.parse(saved) as SessionInfo
    }
  } catch (e) {
    // 忽略错误
  }
  return null
}

/**
 * 清除当前会话
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (e) {
    // 忽略错误
  }
}

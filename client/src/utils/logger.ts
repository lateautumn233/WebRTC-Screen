/**
 * 日志工具 - 根据环境自动控制日志输出
 * 开发环境: 显示所有日志
 * 生产环境: 只显示 error 级别日志
 */

const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    // 错误日志始终保留
    console.error(...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args)
  },
}

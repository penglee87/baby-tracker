// utils/util.ts
// 通用工具函数模块

/**
 * 格式化日期时间
 * @param date Date对象
 * @returns 格式化后的字符串 "YYYY/MM/DD HH:mm:ss"
 */
export const formatTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':')
  )
}

/**
 * 数字补零辅助函数
 * 将 1 转换为 '01'
 */
const formatNumber = (n: number) => {
  const s = n.toString()
  return s[1] ? s : '0' + s
}

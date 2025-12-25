// app.ts
import { initCloud } from './utils/storage'

App<IAppOption>({
  globalData: {},
  /**
   * 小程序启动时的生命周期函数
   */
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 尝试初始化云开发能力
    // 如果未配置云开发环境，这里会静默失败，自动降级使用本地存储
    try {
      initCloud()
    } catch (_e) {}

    // 登录流程
    wx.login({
      success: res => {
        console.log(res.code)
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      },
    })
  },
})

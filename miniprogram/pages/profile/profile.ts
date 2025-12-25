// pages/profile/profile.ts
// 个人中心/宝宝管理页逻辑
// 负责宝宝列表的展示、添加、编辑、删除以及当前宝宝的切换

import {
  getCurrentBabyId,
  setCurrentBabyId,
  listBabies,
  upsertBaby,
  deleteBabyById,
  BabyProfile,
} from '../../utils/storage'

Component({
  /**
   * 组件的初始数据
   */
  data: {
    currentBabyId: '',
    babies: [] as BabyProfile[],
    currentBaby: {} as BabyProfile,
    otherBabies: [] as BabyProfile[], // 除当前宝宝外的其他宝宝列表
    
    // 编辑弹窗状态
    showEditModal: false,
    isCreate: false,
    editId: '',
    editName: '',
    editAvatarUrl: '',
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      const currentBabyId = getCurrentBabyId()
      const babies = listBabies()
      this.setData({ currentBabyId, babies })
      this.refresh()
    },
  },

  methods: {
    /**
     * 刷新页面数据
     * 重新加载宝宝列表，并分离当前宝宝和其他宝宝
     */
    refresh() {
      const currentBabyId = getCurrentBabyId()
      const babies = listBabies()
      const current = babies.find(b => b.id === currentBabyId) || babies[0] || { id: 'default', name: '默认宝宝' }
      const others = babies.filter(b => b.id !== current.id)
      this.setData({ currentBabyId: current.id, babies, currentBaby: current, otherBabies: others })
    },

    // --- 弹窗操作 ---
    openCreate() {
      this.setData({
        showEditModal: true,
        isCreate: true,
        editId: '',
        editName: '',
        editAvatarUrl: '',
      })
    },
    openEdit(e: any) {
      const id = e.currentTarget.dataset.id
      const babies: BabyProfile[] = this.data.babies || []
      const b = babies.find((x) => x.id === id)
      if (!b) return
      this.setData({
        showEditModal: true,
        isCreate: false,
        editId: b.id,
        editName: b.name,
        editAvatarUrl: b.avatarUrl || '',
      })
    },

    // --- 表单输入 ---
    onEditIdInput(e: any) {
      this.setData({ editId: (e.detail.value || '').trim() })
    },
    onEditNameInput(e: any) {
      this.setData({ editName: (e.detail.value || '').trim() })
    },

    /**
     * 选择头像图片
     * 选择后会自动保存到本地文件系统
     */
    async chooseAvatar() {
      try {
        const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
        const temp = res.tempFilePaths?.[0]
        if (!temp) return
        // 将临时文件保存为永久文件，避免下次启动丢失
        const saved = await new Promise<string>((resolve) => {
          try {
            wx.saveFile({
              tempFilePath: temp,
              success: (r) => resolve(r.savedFilePath),
              fail: () => resolve(temp),
            })
          } catch (_e) {
            resolve(temp)
          }
        })
        this.setData({ editAvatarUrl: saved })
      } catch (_e) {}
    },

    cancelEdit() {
      this.setData({ showEditModal: false })
    },

    /**
     * 保存编辑结果
     * 处理新建和更新逻辑，包括ID校验
     */
    saveEdit() {
      const isCreate = this.data.isCreate
      const id = (this.data.editId || '').trim()
      const name = (this.data.editName || '').trim() || '未命名宝宝'
      const avatarUrl = this.data.editAvatarUrl || ''
      const babies = listBabies()
      if (isCreate) {
        if (!id) {
          wx.showToast({ title: '请输入共享码', icon: 'none' })
          return
        }
        if (babies.some((b) => b.id === id)) {
          wx.showToast({ title: '共享码已存在', icon: 'none' })
          return
        }
        upsertBaby({ id, name, avatarUrl })
        this.refresh()
        this.setData({ showEditModal: false })
        wx.showToast({ title: '已创建', icon: 'success' })
      } else {
        if (!id) return
        upsertBaby({ id, name, avatarUrl })
        this.refresh()
        this.setData({ showEditModal: false })
        wx.showToast({ title: '已更新', icon: 'success' })
      }
    },

    /**
     * 切换当前显示的宝宝
     */
    setCurrent(e: any) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      setCurrentBabyId(id)
      this.refresh()
      wx.showToast({ title: '已切换', icon: 'success' })
    },

    /**
     * 删除宝宝记录
     * 需保证至少保留一个宝宝
     */
    deleteBaby(e: any) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      const babies = listBabies()
      if (babies.length <= 1) {
        wx.showToast({ title: '至少保留一个宝宝', icon: 'none' })
        return
      }
      wx.showModal({
        title: '删除确认',
        content: '删除后数据不会自动迁移，请确认该宝宝记录不再需要',
        success: (res) => {
          if (res.confirm) {
            deleteBabyById(id)
            this.refresh()
            wx.showToast({ title: '已删除', icon: 'success' })
          }
        },
      })
    },
  },

  /**
   * 页面生命周期
   */
  pageLifetimes: {
    show() {
      this.refresh()
    }
  }
})

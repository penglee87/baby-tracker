import { getCurrentBabyId, setCurrentBabyId } from '../../utils/storage'

Component({
  data: {
    babyId: '',
    inputBabyId: '',
  },
  lifetimes: {
    attached() {
      const babyId = getCurrentBabyId()
      this.setData({ babyId, inputBabyId: babyId })
    }
  },
  methods: {
    onInput(e: any) {
      this.setData({ inputBabyId: e.detail.value })
    },
    save() {
      const id = (this.data.inputBabyId || '').trim() || 'default'
      if (id !== this.data.babyId) {
        setCurrentBabyId(id)
        this.setData({ babyId: id })
        wx.showToast({ title: '已更新', icon: 'success' })
        // 简单重启或通知其他页面刷新较复杂，这里依赖页面onShow或自动重刷
        // 由于是tabbar页面，切换回来时会触发onShow(如果改为Page)，或组件的pageLifetimes.show
      }
    }
  },
  pageLifetimes: {
    show() {
      const babyId = getCurrentBabyId()
      if (babyId !== this.data.babyId) {
        this.setData({ babyId, inputBabyId: babyId })
      }
    }
  }
})

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
  generateShareCode,
  createInvitation,
  confirmJoinFamily,
  listFamilyMembers,
  updateLocalBaby,
  JoinRequest,
  checkMyJoinStatus,
  syncBabies,
  exitFamily,
  softDeleteBaby,
} from '../../utils/storage'

// Avatar cache to avoid redundant network requests
const avatarCache: Record<string, string> = {}

Component({
  /**
   * 组件的初始数据
   */
  data: {
    currentBabyId: '',
    babies: [] as BabyProfile[],
    currentBaby: {} as BabyProfile,
    otherBabies: [] as BabyProfile[], // 除当前宝宝外的其他宝宝列表
    
    // 邀请相关
    familyMembers: [] as JoinRequest[],
    showShareModal: false,
    shareCode: '',
    shareExpire: '',
    
    // 编辑弹窗状态
    showEditModal: false,
    isCreate: false,
    isMember: false,
    isUploading: false,
    showLocalAvatarWarning: false,
    editId: '',
    editName: '',
    editAvatarUrl: '',
    editGender: 'boy',
    editBirthday: '',

    // Join Modal
    showJoinModal: false,
    joinCode: '',
    joinNickName: '',
    joinAvatarUrl: '',
    
    // Creator Info (for Create Modal)
    creatorNickName: '',
    creatorAvatarUrl: '',
    
    // Permission Warning
    showPermissionTip: false,
    showDBPermissionError: false, // DB权限错误提示
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
    async refresh() {
      const currentBabyId = getCurrentBabyId()
      const babies = listBabies()
      
      let showPermissionTip = false
      
      // 1. 解析头像 (解决云存储图片在其他设备无法显示的问题)
      if (wx.cloud) {
        const fileList = babies
          .filter(b => b.avatarUrl && b.avatarUrl.startsWith('cloud://'))
          .filter(b => !avatarCache[b.avatarUrl!]) // Filter out cached
          .map(b => b.avatarUrl!)
        
        if (fileList.length > 0) {
          try {
            const res = await wx.cloud.getTempFileURL({ fileList })
            res.fileList.forEach(item => {
              if (item.tempFileURL) {
                 avatarCache[item.fileID] = item.tempFileURL
              } else {
                showPermissionTip = true
              }
            })
          } catch (e) {
            console.error('Resolve avatars failed:', e)
            showPermissionTip = true
          }
        }

        // Apply cache to babies list
        babies.forEach(b => {
           if (b.avatarUrl && avatarCache[b.avatarUrl]) {
              b.avatarUrl = avatarCache[b.avatarUrl]
           }
        })
      }

      const current = babies.find(b => b.id === currentBabyId) || babies[0] || null
      const others = current ? babies.filter(b => b.id !== current.id) : []
      
      this.setData({ 
        currentBabyId: current ? current.id : '', 
        babies, 
        currentBaby: current || {}, 
        otherBabies: others,
        showPermissionTip
      })
      
      // 2. 加载当前宝宝的家庭成员 (任何角色都可见，增加透明度)
      if (current && current.id) {
        this.loadFamilyMembers(current.id)
      } else {
        this.setData({ familyMembers: [], showDBPermissionError: false })
      }
    },

    async loadFamilyMembers(babyId: string) {
      try {
        const list = await listFamilyMembers(babyId)
        this.setData({ familyMembers: list, showDBPermissionError: false })
      } catch (e: any) {
        // 权限错误捕获
        const errStr = e.message || e.errMsg || JSON.stringify(e)
        if (errStr.includes('permission') || errStr.includes('not exist')) {
           this.setData({ showDBPermissionError: true })
        }
      }
    },

    // --- 邀请与分享 ---
    async openShare() {
      const babyId = this.data.currentBaby.id
      if (!babyId || babyId === 'default') return
      
      wx.showLoading({ title: '生成中...' })
      try {
        const code = await createInvitation(babyId)
        this.setData({
          showShareModal: true,
          shareCode: code,
          shareExpire: '30分钟内有效'
        })
      } catch (e: any) {
        wx.showToast({ title: e.message || '生成失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },

    closeShare() {
      this.setData({ showShareModal: false })
    },

    copyShareCode() {
      wx.setClipboardData({
        data: this.data.shareCode,
        success: () => wx.showToast({ title: '已复制邀请码', icon: 'none' })
      })
    },

    // --- 弹窗操作 ---
    openCreate() {
      const newCode = generateShareCode()
      this.setData({
        showEditModal: true,
        isCreate: true,
        showLocalAvatarWarning: false,
        editId: newCode,
        editName: '',
        editAvatarUrl: '',
        editGender: 'boy',
        editBirthday: '',
      })
    },

    // --- 用户身份获取 (Join) ---
    onChooseJoinAvatar(e: any) {
      const { avatarUrl } = e.detail
      this.setData({ joinAvatarUrl: avatarUrl })
    },
    onJoinNicknameInput(e: any) {
       this.setData({ joinNickName: e.detail.value })
    },

    // --- 用户身份获取 (Creator) ---
    onChooseCreatorAvatar(e: any) {
      const { avatarUrl } = e.detail
      this.setData({ creatorAvatarUrl: avatarUrl })
    },
    onCreatorNicknameInput(e: any) {
      this.setData({ creatorNickName: e.detail.value })
    },

    openJoin() {
      this.setData({ showJoinModal: true, joinCode: '', joinNickName: '', joinAvatarUrl: '' })
    },
    
    closeJoin() {
      this.setData({ showJoinModal: false })
    },
    
    onJoinCodeInput(e: any) {
      this.setData({ joinCode: e.detail.value })
    },
    
    async submitJoin() {
      if (!this.data.joinCode) {
        wx.showToast({ title: '请输入邀请码', icon: 'none' })
        return
      }

      // Check if avatar/nickname provided (optional but recommended)
      let userInfo: any = undefined
      if (this.data.joinNickName || this.data.joinAvatarUrl) {
        userInfo = {
           nickName: this.data.joinNickName || '微信用户',
           avatarUrl: this.data.joinAvatarUrl || ''
        }
      }

      wx.showLoading({ title: '加入中...' })
      try {
        const res = await confirmJoinFamily(this.data.joinCode, userInfo)
        
        if (res.success) {
          wx.showToast({ title: '加入成功', icon: 'success' })
          
          // 如果返回了 baby 信息，更新到本地
          if (res.baby) {
            updateLocalBaby(res.baby)
          }

          this.setData({ showJoinModal: false, joinCode: '' })
          this.refresh()
        } else {
          wx.showToast({ title: res.message, icon: 'none' })
        }
      } catch (e: any) {
        wx.showToast({ title: '加入失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },

    openEdit(e: any) {
      const id = e.currentTarget.dataset.id
      const babies: BabyProfile[] = this.data.babies || []
      const b = babies.find((x) => x.id === id)
      if (!b) return

      const isLocal = (b.avatarUrl || '').startsWith('http://tmp') || (b.avatarUrl || '').startsWith('wxfile://')

      this.setData({
        showEditModal: true,
        isCreate: false,
        isMember: b.role === 'member',
        showLocalAvatarWarning: isLocal,
        editId: b.id,
        editName: b.name,
        editAvatarUrl: b.avatarUrl || '',
        editGender: b.gender || 'boy',
        editBirthday: b.birthday || '',
        creatorNickName: b.creatorInfo?.nickName || '',
        creatorAvatarUrl: b.creatorInfo?.avatarUrl || '',
      })
    },

    // --- 表单输入 ---
    onEditIdInput(e: any) {
      this.setData({ editId: (e.detail.value || '').trim() })
    },
    onEditNameInput(e: any) {
      this.setData({ editName: (e.detail.value || '').trim() })
    },
    onEditGenderChange(e: any) {
      this.setData({ editGender: e.detail.value })
    },
    onEditBirthdayChange(e: any) {
      this.setData({ editBirthday: e.detail.value })
    },

    /**
     * 复制共享码
     */
    copyId(e: any) {
      const id = e.currentTarget.dataset.id
      if (id) {
        wx.setClipboardData({
          data: id,
          success: () => wx.showToast({ title: '已复制共享码', icon: 'none' })
        })
      }
    },

    /**
     * 选择头像图片
     * 优先上传到云存储，以便家庭共享
     */
    async chooseAvatar() {
      try {
        const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
        const temp = res.tempFilePaths?.[0]
        if (!temp) return

        this.setData({ editAvatarUrl: temp, isUploading: true }) // 先展示本地预览

        // 尝试上传到云存储
        if (wx.cloud) {
          wx.showLoading({ title: '上传中...' })
          try {
            const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}${temp.match(/\.[^.]+?$/)?.[0] || '.jpg'}`
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath,
              filePath: temp,
            })
            this.setData({ editAvatarUrl: uploadRes.fileID, showLocalAvatarWarning: false })
            console.log('[Avatar] Uploaded:', uploadRes.fileID)
          } catch (e) {
            console.error('[Avatar] Upload failed:', e)
            wx.showToast({ title: '上传失败，仅本地可见', icon: 'none' })
          } finally {
            wx.hideLoading()
            this.setData({ isUploading: false })
          }
        } else {
           this.setData({ isUploading: false })
        }
      } catch (_e) {
        this.setData({ isUploading: false })
      }
    },

    cancelEdit() {
      this.setData({ showEditModal: false })
    },

    /**
     * 保存编辑结果
     * 处理新建和更新逻辑，包括ID校验
     */
    async saveEdit() {
      if (this.data.isUploading) {
         wx.showToast({ title: '图片上传中，请稍候', icon: 'none' })
         return
      }
      const isCreate = this.data.isCreate
      const id = (this.data.editId || '').trim()
      const name = (this.data.editName || '').trim() || '未命名宝宝'
      const avatarUrl = this.data.editAvatarUrl || ''
      const gender = this.data.editGender as 'boy' | 'girl'
      const birthday = this.data.editBirthday || ''

      const babies = listBabies()
      
      // 尝试获取创建者信息 (从 Input 获取)
      let creatorInfo: any = undefined
      if (this.data.creatorNickName || this.data.creatorAvatarUrl) {
        creatorInfo = {
          nickName: this.data.creatorNickName || '创建者',
          avatarUrl: this.data.creatorAvatarUrl || ''
        }
      }

      if (isCreate) {
        if (!id) {
          wx.showToast({ title: '请输入共享码', icon: 'none' })
          return
        }
        if (babies.some((b) => b.id === id)) {
          wx.showToast({ title: '共享码已存在', icon: 'none' })
          return
        }

        upsertBaby({ id, name, avatarUrl, gender, birthday, creatorInfo }).then(success => {
           if (!success) {
              wx.showToast({ title: '保存成功(未同步云端)', icon: 'none' })
           } else {
              wx.showToast({ title: '已创建', icon: 'success' })
           }
        })
        this.refresh()
        this.setData({ showEditModal: false })
      } else {
        if (!id) return
        // 更新时同时也更新 creatorInfo (如果是 owner)
        upsertBaby({ id, name, avatarUrl, gender, birthday, creatorInfo }).then(success => {
           if (!success) {
              wx.showToast({ title: '保存成功(未同步云端)', icon: 'none' })
           } else {
              wx.showToast({ title: '已更新', icon: 'success' })
           }
        })
        this.refresh()
        this.setData({ showEditModal: false })
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
     * 区分 创建者(移除本地) 和 成员(退出家庭)
     */
    async deleteBaby(e: any) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      
      const babies = this.data.babies || []
      const baby = babies.find(b => b.id === id)
      const isMember = baby?.role === 'member'
      
      const title = isMember ? '退出家庭' : '删除确认'
      const content = isMember 
         ? '确定要退出该家庭吗？\n退出后将无法查看宝宝记录，需重新申请加入。'
         : '确定要删除该宝宝档案吗？\n删除后所有家庭成员将无法查看，数据将被标记为已删除。'
      const confirmText = isMember ? '退出' : '删除'
      
      wx.showModal({
        title,
        content,
        confirmText,
        confirmColor: '#FF4D4F',
        success: async (res) => {
          if (res.confirm) {
            if (isMember) {
               wx.showLoading({ title: '处理中...' })
               const success = await exitFamily(id)
               wx.hideLoading()
               if (success) {
                 wx.showToast({ title: '已退出家庭', icon: 'success' })
                 this.refresh()
               } else {
                 wx.showToast({ title: '退出失败，请重试', icon: 'none' })
               }
            } else {
               wx.showLoading({ title: '删除中...' })
               const success = await softDeleteBaby(id)
               wx.hideLoading()
               if (success) {
                  wx.showToast({ title: '已删除', icon: 'success' })
                  this.refresh()
               } else {
                  wx.showToast({ title: '删除失败，请检查网络', icon: 'none' })
               }
            }
            
            // Close edit modal if open
            if (this.data.showEditModal && this.data.editId === id) {
               this.setData({ showEditModal: false })
            }
          }
        },
      })
    },

    /**
     * 下拉刷新
     */
    async onPullDownRefresh() {
       wx.showNavigationBarLoading()
       try {
          await checkMyJoinStatus()
          await syncBabies()
          await this.refresh()
          wx.showToast({ title: '已同步最新数据', icon: 'none' })
       } catch (e) {
          console.error('Pull down refresh failed:', e)
       } finally {
          wx.hideNavigationBarLoading()
          wx.stopPullDownRefresh()
       }
    },
  },

  /**
   * 页面生命周期
   */
  pageLifetimes: {
    show() {
      // 检查是否有通过的申请
      checkMyJoinStatus().then((newJoin) => {
        if (newJoin) {
          wx.showToast({ title: '新家庭已加入', icon: 'success' })
          this.refresh()
        } else {
          this.refresh()
        }
      })

      // 尝试后台同步最新数据
      syncBabies().then(() => {
        this.refresh() // 同步完成后再次刷新UI以显示最新头像等
      })
    }
  }
})

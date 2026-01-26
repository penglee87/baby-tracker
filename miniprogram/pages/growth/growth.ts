// pages/growth/growth.ts
import { 
  getCurrentBabyId, 
  listBabies, 
  BabyProfile, 
  GrowthRecord, 
  MilestoneRecord,
  listGrowthRecords,
  addGrowthRecord,
  listMilestones,
  addMilestone
} from '../../utils/storage'

Page({
  data: {
    currentBaby: {} as BabyProfile,
    ageStr: '',
    height: 0,
    weight: 0,
    growthStandard: {
      height: '--',
      weight: '--'
    },
    milestones: [] as MilestoneRecord[],

    // Modals
    showGrowthModal: false,
    inputHeight: '',
    inputWeight: '',
    inputDate: '',

    showMilestoneModal: false,
    inputTitle: '',
    inputDesc: '',
    inputPhotoPath: '',
    inputMilestoneDate: '',
  },

  onShow() {
    this.initData()
  },

  async initData() {
    const id = getCurrentBabyId()
    const babies = listBabies()
    const baby = babies.find(b => b.id === id) || babies[0]
    
    this.setData({ currentBaby: baby })
    this.calculateAge(baby)
    
    // Load real data
    const growthList = await listGrowthRecords(baby.id)
    const milestoneList = await listMilestones(baby.id)

    if (growthList.length > 0) {
      const latest = growthList[0] // sorted by date desc
      this.setData({
        height: latest.height || 0,
        weight: latest.weight || 0
      })
    }

    this.setData({ milestones: milestoneList })
    this.updateStandard(baby)
  },

  updateStandard(baby: BabyProfile) {
    // 简易标准对照逻辑 (仅示例)
    // 实际应用应引入完整的 WHO 数据表
    if (!baby.birthday) return
    // ... logic to calc standard based on age
    this.setData({
      growthStandard: { height: '60-75', weight: '5.5-9.0' }
    })
  },

  calculateAge(baby: BabyProfile) {
    if (!baby.birthday) {
      this.setData({ ageStr: '未设置生日' })
      return
    }
    const birth = new Date(baby.birthday)
    const now = new Date()
    const diffTime = now.getTime() - birth.getTime()
    if (diffTime < 0) {
       this.setData({ ageStr: '未出生' })
       return
    }
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) 
    
    let str = ''
    if (diffDays < 30) {
      str = `${diffDays}天`
    } else if (diffDays < 365) {
      const m = Math.floor(diffDays / 30)
      const d = diffDays % 30
      str = `${m}个月${d}天`
    } else {
      const y = Math.floor(diffDays / 365)
      const m = Math.floor((diffDays % 365) / 30)
      str = `${y}岁${m}个月`
    }
    this.setData({ ageStr: str })
  },

  // --- Growth Actions ---
  addGrowthRecord() {
    const nowStr = new Date().toISOString().split('T')[0]
    this.setData({
      showGrowthModal: true,
      inputHeight: '',
      inputWeight: '',
      inputDate: nowStr
    })
  },
  
  onHeightInput(e: any) { this.setData({ inputHeight: e.detail.value }) },
  onWeightInput(e: any) { this.setData({ inputWeight: e.detail.value }) },
  onDateChange(e: any) { this.setData({ inputDate: e.detail.value }) },
  cancelGrowth() { this.setData({ showGrowthModal: false }) },

  async saveGrowth() {
    const h = parseFloat(this.data.inputHeight)
    const w = parseFloat(this.data.inputWeight)
    if (!h && !w) {
      wx.showToast({ title: '请至少输入一项', icon: 'none' })
      return
    }
    
    await addGrowthRecord({
      babyId: this.data.currentBaby.id,
      date: this.data.inputDate,
      height: h,
      weight: w
    })
    
    this.setData({ showGrowthModal: false })
    wx.showToast({ title: '已记录', icon: 'success' })
    this.initData()
  },

  // --- Milestone Actions ---
  addMilestone() {
    const nowStr = new Date().toISOString().split('T')[0]
    this.setData({
      showMilestoneModal: true,
      inputTitle: '',
      inputDesc: '',
      inputPhotoPath: '',
      inputMilestoneDate: nowStr
    })
  },

  onTitleInput(e: any) { this.setData({ inputTitle: e.detail.value }) },
  onDescInput(e: any) { this.setData({ inputDesc: e.detail.value }) },
  onMilestoneDateChange(e: any) { this.setData({ inputMilestoneDate: e.detail.value }) },
  
  async choosePhoto() {
    try {
      const res = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
      const tempPath = res.tempFiles[0].tempFilePath
      this.setData({ inputPhotoPath: tempPath })
    } catch (e) {}
  },

  cancelMilestone() { this.setData({ showMilestoneModal: false }) },

  async saveMilestone() {
    if (!this.data.inputTitle) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }

    const rec: MilestoneRecord = {
      babyId: this.data.currentBaby.id,
      date: this.data.inputMilestoneDate,
      title: this.data.inputTitle,
      description: this.data.inputDesc,
    }

    if (this.data.inputPhotoPath) {
       // 如果有云环境，应该上传文件
       // 这里先简单处理为保存本地路径或尝试上传
       if (wx.cloud) {
         try {
           const fileID = `cloud://baby-tracker/milestones/${Date.now()}.jpg`
           // const res = await wx.cloud.uploadFile({ cloudPath: ..., filePath: ... })
           // rec.photoFileId = res.fileID
           rec.photoLocalPath = this.data.inputPhotoPath // 暂存本地路径用于显示
         } catch (e) {
           rec.photoLocalPath = this.data.inputPhotoPath
         }
       } else {
         // 本地模式，尝试保存文件到永久目录
         try {
           const fs = wx.getFileSystemManager()
           const savedPath = `${wx.env.USER_DATA_PATH}/ms_${Date.now()}.jpg`
           fs.saveFileSync(this.data.inputPhotoPath, savedPath)
           rec.photoLocalPath = savedPath
         } catch (e) {
           rec.photoLocalPath = this.data.inputPhotoPath
         }
       }
    }

    await addMilestone(rec)
    this.setData({ showMilestoneModal: false })
    wx.showToast({ title: '已发布', icon: 'success' })
    this.initData()
  }
})

/**
 * Mind Elixir 思维导图编辑器集成模块
 * 
 * 提供思维导图的创建、编辑和保存功能
 * 设计参考 DrawIO 集成模块，保持 API 和交互风格一致
 */

import MindElixir from 'mind-elixir'
import 'mind-elixir/dist/MindElixir.css'
// import { snapdom } from '@zumer/snapdom'

/**
 * 思维导图编辑器类
 */
export 
// 获取思维导图导出格式配置（默认 svg）
function getMindmapExportFormat() {
    return (window.mindmapConfig && window.mindmapConfig.exportFormat) || 'svg'
}

class MindmapEditor {
    constructor(options = {}) {
        this.options = options
        this.modal = null
        this.mindElixir = null
        this.container = null
        this.currentFileId = null
        this.currentData = null
        this.onSaveCallback = null
        this.isMaximized = false
        this.isSaving = false
    }

    /**
     * 打开思维导图编辑器
     * @param {Object} options - 选项
     * @param {string} options.fileId - 已有图形的文件 ID（用于二次编辑）
     * @param {Function} options.onSave - 保存成功后的回调函数
     */
    open(options = {}) {
        this.currentFileId = options.fileId || null
        this.onSaveCallback = options.onSave || null

        // 如果有文件 ID，先获取数据
        if (this.currentFileId) {
            this.fetchDataAndOpen()
        } else {
            this.showEditor(null)
        }
    }

    /**
     * 获取已有的 JSON 数据并打开编辑器
     */
    async fetchDataAndOpen() {
        try {
            const response = await fetch(`/mindmap/${this.currentFileId}`)
            if (response.ok) {
                this.currentData = await response.json()
                this.showEditor(this.currentData)
            } else {
                console.error('获取思维导图数据失败')
                // 如果获取失败，作为新建处理
                this.showEditor(null)
            }
        } catch (e) {
            console.error('获取思维导图数据错误:', e)
            this.showEditor(null)
        }
    }

    /**
     * 显示编辑器模态框
     * @param {Object|null} data - 要加载的思维导图数据
     */
    showEditor(data) {
        // 创建模态框
        this.createModal()

        // 保存数据用于加载
        this.pendingData = data

        // 初始化 Mind Elixir
        this.initMindElixir(data)
    }

    /**
     * 创建模态框 DOM 结构
     */
    createModal() {
        // 移除已存在的模态框
        const existing = document.getElementById('mindmap-modal')
        if (existing) {
            existing.remove()
        }

        // 创建模态框容器
        this.modal = document.createElement('div')
        this.modal.id = 'mindmap-modal'
        this.modal.className = 'mindmap-modal'
        this.modal.innerHTML = `
      <div class="mindmap-modal-backdrop"></div>
      <div class="mindmap-modal-content">
        <div class="mindmap-modal-header">
          <span class="mindmap-modal-title">思维导图编辑器</span>
          <div class="mindmap-modal-header-buttons">
            <button class="mindmap-modal-btn mindmap-modal-copy-json" title="复制 JSON">📋</button>
            <button class="mindmap-modal-btn mindmap-modal-import-json" title="导入 JSON">📥</button>
            <button class="mindmap-modal-btn mindmap-modal-save" title="保存并关闭">保存</button>
            <button class="mindmap-modal-btn mindmap-modal-maximize" title="最大化">&#x26F6;</button>
            <button class="mindmap-modal-btn mindmap-modal-close" title="关闭">&times;</button>
          </div>
        </div>
        <div class="mindmap-modal-body">
          <div class="mindmap-loading">
            <div class="mindmap-spinner"></div>
            <span>正在加载思维导图编辑器...</span>
          </div>
          <div class="mindmap-container" id="mindmap-container"></div>
        </div>
      </div>
    `

        // 获取元素引用
        this.container = this.modal.querySelector('#mindmap-container')
        const closeBtn = this.modal.querySelector('.mindmap-modal-close')
        const maximizeBtn = this.modal.querySelector('.mindmap-modal-maximize')
        const saveBtn = this.modal.querySelector('.mindmap-modal-save')
        const backdrop = this.modal.querySelector('.mindmap-modal-backdrop')
        const header = this.modal.querySelector('.mindmap-modal-header')

        // 绑定关闭事件
        closeBtn.addEventListener('click', () => this.close())
        backdrop.addEventListener('click', () => this.close())

        // 绑定保存事件
        saveBtn.addEventListener('click', () => this.save())

        // 绑定复制/导入 JSON 事件
        const copyJsonBtn = this.modal.querySelector('.mindmap-modal-copy-json')
        const importJsonBtn = this.modal.querySelector('.mindmap-modal-import-json')
        copyJsonBtn.addEventListener('click', () => this.copyJsonToClipboard())
        importJsonBtn.addEventListener('click', () => this.showImportDialog())

        // 绑定最大化事件
        maximizeBtn.addEventListener('click', () => this.toggleMaximize())
        // 双击标题栏也可以最大化/还原
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.mindmap-modal-header-buttons')) return
            this.toggleMaximize()
        })

        // 添加到页面
        document.body.appendChild(this.modal)

        // 防止页面滚动
        document.body.style.overflow = 'hidden'
    }

    /**
     * 初始化 Mind Elixir 实例
     * @param {Object|null} data - 要加载的数据
     */
    initMindElixir(data) {
        try {
            // 隐藏加载指示器
            const loading = this.modal.querySelector('.mindmap-loading')
            if (loading) {
                loading.style.display = 'none'
            }

            // 显示容器
            this.container.style.display = 'block'

            // 创建 Mind Elixir 实例
            // 使用 MindElixir.THEME（浅色主题）防止跟随浏览器 prefers-color-scheme 设置
            const options = {
                el: this.container,
                direction: MindElixir.LEFT,
                draggable: true,
                contextMenu: true,
                toolBar: true,
                nodeMenu: true,
                keypress: true,
                locale: 'zh_CN',
                overflowHidden: false,
                mainLinkStyle: 2,
                theme: MindElixir.THEME, // 强制使用浅色主题，不跟随浏览器深色模式
                contextMenuOption: {
                    focus: true,
                    link: true,
                    extend: []
                }
            }

            this.mindElixir = new MindElixir(options)

            // 加载数据或创建新数据
            if (data && data.nodeData) {
                this.mindElixir.init(data)
            } else {
                // 创建默认的新思维导图
                const newData = MindElixir.new('新思维导图')
                this.mindElixir.init(newData)
            }
        } catch (e) {
            console.error('Mind Elixir 初始化失败:', e)
            alert('思维导图编辑器初始化失败，请检查控制台日志。')
            this.close()
        }
    }

    /**
     * 切换最大化/还原状态
     */
    toggleMaximize() {
        const content = this.modal.querySelector('.mindmap-modal-content')
        const maximizeBtn = this.modal.querySelector('.mindmap-modal-maximize')

        this.isMaximized = !this.isMaximized

        if (this.isMaximized) {
            content.classList.add('maximized')
            maximizeBtn.innerHTML = '&#x2750;'  // 还原图标
            maximizeBtn.title = '还原'
        } else {
            content.classList.remove('maximized')
            maximizeBtn.innerHTML = '&#x26F6;'  // 最大化图标
            maximizeBtn.title = '最大化'
        }

        // 触发 Mind Elixir 重新调整大小
        if (this.mindElixir) {
            setTimeout(() => {
                this.mindElixir.toCenter()
            }, 300)
        }
    }

    /**
     * 复制当前思维导图 JSON 到剪贴板
     */
    async copyJsonToClipboard() {
        if (!this.mindElixir) {
            alert('思维导图编辑器未初始化')
            return
        }

        try {
            // 获取当前数据
            const data = this.mindElixir.getData()
            const jsonString = JSON.stringify(data, null, 2)

            await navigator.clipboard.writeText(jsonString)

            // 显示成功提示
            const btn = this.modal.querySelector('.mindmap-modal-copy-json')
            const originalText = btn.textContent
            btn.textContent = '✅'
            setTimeout(() => {
                btn.textContent = originalText
            }, 1500)
        } catch (e) {
            console.error('复制到剪贴板失败:', e)
            // 降级方案：使用旧的 execCommand
            try {
                const data = this.mindElixir.getData()
                const jsonString = JSON.stringify(data, null, 2)
                const textarea = document.createElement('textarea')
                textarea.value = jsonString
                document.body.appendChild(textarea)
                textarea.select()
                document.execCommand('copy')
                document.body.removeChild(textarea)
                alert('JSON 已复制到剪贴板')
            } catch (fallbackError) {
                alert('复制失败: ' + e.message)
            }
        }
    }

    /**
     * 显示导入 JSON 对话框
     */
    showImportDialog() {
        const json = prompt('请粘贴思维导图 JSON 数据：\n\n（提示：JSON 应包含 nodeData 字段）')

        if (!json || !json.trim()) {
            return
        }

        try {
            const data = JSON.parse(json.trim())

            // 验证基本结构
            if (!data.nodeData) {
                alert('无效的思维导图 JSON 格式！\n\nJSON 必须包含 nodeData 字段。')
                return
            }

            // 重新加载思维导图
            this.mindElixir.init(data)

            // 更新当前数据引用
            this.currentData = data
        } catch (e) {
            alert('JSON 解析失败！\n\n错误: ' + e.message)
        }
    }

    /**
     * 保存思维导图
     */
    async save() {
        if (this.isSaving) return
        this.isSaving = true

        const saveBtn = this.modal.querySelector('.mindmap-modal-save')
        const originalText = saveBtn.textContent
        saveBtn.textContent = '保存中...'
        saveBtn.disabled = true

        try {
            // 获取思维导图数据
            const mindData = this.mindElixir.getData()

            // 导出为图片
            const imageData = await this.exportToImage()

            if (!imageData) {
                throw new Error('图片导出失败')
            }

            // 上传到服务器
            const result = await this.uploadToServer(mindData, imageData)

            if (result && result.imageUrl) {
                // 调用保存回调
                if (this.onSaveCallback) {
                    this.onSaveCallback({
                        fileId: result.fileId,
                        imageUrl: result.imageUrl
                    })
                }

                // 关闭编辑器
                this.close()
            } else {
                throw new Error('上传失败')
            }
        } catch (e) {
            console.error('保存错误:', e)
            alert('保存失败: ' + e.message)
        } finally {
            this.isSaving = false
            saveBtn.textContent = originalText
            saveBtn.disabled = false
        }
    }

    /**
     * 导出思维导图为图片
     * @returns {Promise<string>} Base64 图片数据
     */
    async exportToImage() {
        const format = getMindmapExportFormat()
        
        // 根据格式选择导出方法
        if (format === 'svg') {
            if (!this.mindElixir || !this.mindElixir.exportSvg) {
                throw new Error('Mind Elixir 实例未初始化或不支持 SVG 导出功能')
            }
        } else {
            if (!this.mindElixir || !this.mindElixir.exportPng) {
                throw new Error('Mind Elixir 实例未初始化或不支持 PNG 导出功能')
            }
        }

        try {
            // 根据配置调用对应的导出方法
            const blob = format === 'svg' 
                ? await this.mindElixir.exportSvg(false)  // false = 保留 foreignObject
                : await this.mindElixir.exportPng()

            if (!blob) {
                throw new Error('导出过程未返回数据')
            }

            // 转换为 Base64
            return new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result)
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })
        } catch (e) {
            console.error('导出图片错误:', e)
            throw new Error('图片导出失败: ' + e.message)
        }
    }

    /**
     * 备用导出方法
     * @returns {Promise<string>} Base64 图片数据
     */
    // fallbackExport 已被移除，因为 snapdom 依赖已移除且优先使用原生导出


    /**
     * 上传数据到服务器
     * @param {Object} jsonData - 思维导图 JSON 数据
     * @param {string} imageData - 图片 Base64 数据
     */
    async uploadToServer(jsonData, imageData) {
        const formData = new FormData()
        formData.append('json', JSON.stringify(jsonData))
        formData.append('image', imageData)
        formData.append('format', getMindmapExportFormat())

        // 如果是更新已有图形，传递文件 ID
        if (this.currentFileId) {
            formData.append('fileId', this.currentFileId)
        }

        const response = await fetch('/uploadmindmap', {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            // 尝试解析 JSON 错误响应
            let errorInfo = { message: response.statusText }
            try {
                errorInfo = await response.json()
            } catch (e) {
                // 如果不是 JSON，使用默认的 statusText
            }

            // 构建友好的错误信息
            let errorMessage = errorInfo.message || '上传失败'
            if (errorInfo.hint) {
                errorMessage += '\n\n' + errorInfo.hint
            }

            throw new Error(errorMessage)
        }

        return await response.json()
    }

    /**
     * 关闭编辑器
     */
    close() {
        // 销毁 Mind Elixir 实例
        if (this.mindElixir) {
            // Mind Elixir 没有显式的销毁方法，清空容器即可
            this.container.innerHTML = ''
            this.mindElixir = null
        }

        // 移除模态框
        if (this.modal) {
            this.modal.remove()
            this.modal = null
        }

        // 恢复页面滚动
        document.body.style.overflow = ''

        // 重置状态
        this.container = null
        this.currentFileId = null
        this.currentData = null
        this.pendingData = null
        this.isSaving = false
    }
}

/**
 * 从图片 URL 中提取思维导图文件 ID
 * @param {string} url - 图片 URL
 * @returns {string|null} 文件 ID 或 null
 */
export function getMindmapFileIdFromUrl(url) {
    // 匹配 mindmap-xxx.png 或 mindmap-xxx.svg 格式
    const match = url.match(/\/(mindmap-[a-f0-9-]+)\.(png|svg)/i)
    return match ? match[1] : null
}

/**
 * 检查 URL 是否是思维导图图片
 * @param {string} url - 图片 URL
 * @returns {boolean}
 */
export function isMindmapImage(url) {
    return getMindmapFileIdFromUrl(url) !== null
}

// 创建默认实例
const mindmapEditor = new MindmapEditor()

export default mindmapEditor

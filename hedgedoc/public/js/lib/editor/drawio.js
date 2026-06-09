/**
 * DrawIO 编辑器集成模块
 * 
 * 通过 iframe 嵌入 DrawIO 编辑器，使用 postMessage API 进行通信
 * 支持创建新图形和二次编辑已有图形
 */

// 获取 DrawIO 服务地址（运行时获取，确保 window.drawioConfig 已加载）
function getDrawioUrl() {
    return (window.drawioConfig && window.drawioConfig.url) || window.DRAWIO_URL || ''
}

/**
 * DrawIO 编辑器类
 */
export class DrawioEditor {
    constructor(options = {}) {
        this.options = options
        this.modal = null
        this.iframe = null
        this.currentFileId = null
        this.currentXml = null
        this.onSaveCallback = null
        this.messageHandler = this.handleMessage.bind(this)
        this.isMaximized = false
        this.isSaving = false
        this.editorReady = false
        this.hasPotentialUnsavedChanges = false
        this.initialXmlSnapshot = null
        this.pendingClosePrompt = null
        this.resolveClosePrompt = null
        this.pendingExportFormat = null
        this.pendingSaveTimer = null
        this.hasSaveXmlForCurrentSave = false
        this.requireExportXmlForCurrentSave = false
    }

    /**
     * 打开 DrawIO 编辑器
     * @param {Object} options - 选项
     * @param {string} options.fileId - 已有图形的文件 ID（用于二次编辑）
     * @param {Function} options.onSave - 保存成功后的回调函数
     */
    open(options = {}) {
        this.currentFileId = options.fileId || null
        this.onSaveCallback = options.onSave || null

        // 如果有文件 ID，先获取 XML 数据
        if (this.currentFileId) {
            this.fetchXmlAndOpen()
        } else {
            this.showEditor(null)
        }
    }

    /**
     * 获取已有的 XML 数据并打开编辑器
     */
    async fetchXmlAndOpen() {
        try {
            const response = await fetch(`/drawio/${this.currentFileId}`)
            if (response.ok) {
                this.currentXml = await response.text()
                this.showEditor(this.currentXml)
            } else {
                console.error('获取 DrawIO 数据失败')
                // 如果获取失败，作为新建处理
                this.showEditor(null)
            }
        } catch (e) {
            console.error('获取 DrawIO 数据错误:', e)
            this.showEditor(null)
        }
    }

    /**
     * 显示编辑器模态框
     * @param {string|null} xml - 要加载的 XML 数据
     */
    showEditor(xml) {
        // 创建模态框
        this.createModal()

        // 监听 postMessage 消息
        window.addEventListener('message', this.messageHandler)

        // 保存 XML 数据用于加载
        this.pendingXml = xml
        this.currentXml = xml || ''
        this.editorReady = false
        this.hasPotentialUnsavedChanges = false
        this.initialXmlSnapshot = this.getXmlSnapshot(this.currentXml)

        // 构建 DrawIO URL
        // 使用 ui=atlas 和 dark=0 强制浅色主题
        const params = new URLSearchParams({
            embed: '1',
            proto: 'json',
            spin: '1',
            saveAndExit: '1',
            noSaveBtn: '0',
            noExitBtn: '0',
            ui: 'atlas',    // 使用浅色 Atlas 主题
            dark: '0'       // 禁用深色模式
        })

        // 设置 iframe src
        const drawioUrl = getDrawioUrl()
        console.log('DrawIO Debug - window.drawioConfig:', window.drawioConfig)
        console.log('DrawIO Debug - drawioUrl:', drawioUrl)
        if (!drawioUrl) {
            console.error('DrawIO URL 未配置，请设置 CMD_DRAWIO_URL 或 CMD_DRAWIO_PORT 环境变量')
            alert('DrawIO 编辑器地址未配置，请联系管理员')
            this.close()
            return
        }
        this.iframe.src = `${drawioUrl}/?${params.toString()}`
    }

    /**
     * 创建模态框 DOM 结构
     */
    createModal() {
        // 移除已存在的模态框
        const existing = document.getElementById('drawio-modal')
        if (existing) {
            existing.remove()
        }

        // 创建模态框容器
        this.modal = document.createElement('div')
        this.modal.id = 'drawio-modal'
        this.modal.className = 'drawio-modal'
        this.modal.innerHTML = `
      <div class="drawio-modal-backdrop"></div>
      <div class="drawio-modal-content">
        <div class="drawio-modal-header">
          <span class="drawio-modal-title">DrawIO 图形编辑器</span>
          <div class="drawio-modal-header-buttons">
            <button class="drawio-modal-btn drawio-modal-copy-xml" title="复制 XML">📋</button>
            <button class="drawio-modal-btn drawio-modal-import-xml" title="导入 XML">📥</button>
            <button class="drawio-modal-btn drawio-modal-maximize" title="最大化">&#x26F6;</button>
            <button class="drawio-modal-btn drawio-modal-close" title="关闭">&times;</button>
          </div>
        </div>
        <div class="drawio-modal-body">
          <div class="drawio-loading">
            <div class="drawio-spinner"></div>
            <span>正在加载 DrawIO 编辑器...</span>
          </div>
          <iframe class="drawio-iframe" frameborder="0"></iframe>
        </div>
        <div class="drawio-close-confirm" role="dialog" aria-modal="true" aria-labelledby="drawio-close-confirm-title" hidden>
          <div class="drawio-close-confirm-dialog">
            <h3 id="drawio-close-confirm-title">保存 DrawIO 修改？</h3>
            <p>当前图形有未保存的修改，请选择关闭方式。</p>
            <div class="drawio-close-confirm-actions">
              <button class="drawio-close-confirm-save" type="button">保存并关闭</button>
              <button class="drawio-close-confirm-discard" type="button">不保存关闭</button>
              <button class="drawio-close-confirm-cancel" type="button">取消</button>
            </div>
          </div>
        </div>
      </div>
    `

        // 获取元素引用
        this.iframe = this.modal.querySelector('.drawio-iframe')
        const closeBtn = this.modal.querySelector('.drawio-modal-close')
        const maximizeBtn = this.modal.querySelector('.drawio-modal-maximize')
        const backdrop = this.modal.querySelector('.drawio-modal-backdrop')
        const header = this.modal.querySelector('.drawio-modal-header')
        const closeConfirm = this.modal.querySelector('.drawio-close-confirm')
        const closeConfirmSave = this.modal.querySelector('.drawio-close-confirm-save')
        const closeConfirmDiscard = this.modal.querySelector('.drawio-close-confirm-discard')
        const closeConfirmCancel = this.modal.querySelector('.drawio-close-confirm-cancel')

        // 绑定关闭事件
        closeBtn.addEventListener('click', () => this.requestClose())
        backdrop.addEventListener('click', () => this.requestClose())
        closeConfirm.addEventListener('click', (e) => {
            if (e.target === closeConfirm && this.resolveClosePrompt) this.resolveClosePrompt('cancel')
        })
        closeConfirmSave.addEventListener('click', () => {
            if (this.resolveClosePrompt) this.resolveClosePrompt('save')
        })
        closeConfirmDiscard.addEventListener('click', () => {
            if (this.resolveClosePrompt) this.resolveClosePrompt('discard')
        })
        closeConfirmCancel.addEventListener('click', () => {
            if (this.resolveClosePrompt) this.resolveClosePrompt('cancel')
        })

        // 绑定最大化事件
        maximizeBtn.addEventListener('click', () => this.toggleMaximize())
        // 双击标题栏也可以最大化/还原
        header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.drawio-modal-header-buttons')) return
            this.toggleMaximize()
        })

        // 绑定复制/导入 XML 事件
        const copyXmlBtn = this.modal.querySelector('.drawio-modal-copy-xml')
        const importXmlBtn = this.modal.querySelector('.drawio-modal-import-xml')
        copyXmlBtn.addEventListener('click', () => this.copyXmlToClipboard())
        importXmlBtn.addEventListener('click', () => this.showImportDialog())

        // 添加到页面
        document.body.appendChild(this.modal)

        // 防止页面滚动
        document.body.style.overflow = 'hidden'
    }

    /**
     * 切换最大化/还原状态
     */
    toggleMaximize() {
        const content = this.modal.querySelector('.drawio-modal-content')
        const maximizeBtn = this.modal.querySelector('.drawio-modal-maximize')

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
    }

    /**
     * 复制当前 XML 到剪贴板
     */
    async copyXmlToClipboard() {
        // 优先使用已加载的 XML，否则请求 DrawIO 导出
        const xmlToCopy = this.currentXml || this.pendingXml

        if (!xmlToCopy) {
            alert('当前没有可复制的 XML 数据')
            return
        }

        try {
            await navigator.clipboard.writeText(xmlToCopy)
            // 显示成功提示
            const btn = this.modal.querySelector('.drawio-modal-copy-xml')
            const originalText = btn.textContent
            btn.textContent = '✅'
            setTimeout(() => {
                btn.textContent = originalText
            }, 1500)
        } catch (e) {
            console.error('复制到剪贴板失败:', e)
            // 降级方案：使用旧的 execCommand
            const textarea = document.createElement('textarea')
            textarea.value = xmlToCopy
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            alert('XML 已复制到剪贴板')
        }
    }

    /**
     * 显示导入 XML 对话框
     */
    showImportDialog() {
        const xml = prompt('请粘贴 DrawIO XML 数据：\n\n（提示：XML 通常以 <mxfile 或 <mxGraphModel 开头）')

        if (!xml || !xml.trim()) {
            return
        }

        // 简单验证 XML 格式
        const trimmedXml = xml.trim()
        if (!trimmedXml.startsWith('<mxfile') && !trimmedXml.startsWith('<mxGraphModel')) {
            alert('无效的 DrawIO XML 格式！\n\nXML 应以 <mxfile 或 <mxGraphModel 开头。')
            return
        }

        // 更新当前 XML 并加载到编辑器
        this.currentXml = trimmedXml
        this.hasPotentialUnsavedChanges = true
        this.postMessage({ action: 'load', autosave: 1, modified: true, xml: trimmedXml })
    }

    /**
     * 处理来自 DrawIO 的 postMessage 消息
     */
    handleMessage(event) {
        // 验证消息来源
        if (!event.data || typeof event.data !== 'string') {
            return
        }

        try {
            const msg = JSON.parse(event.data)

            switch (msg.event) {
                case 'init':
                    // DrawIO 编辑器已准备就绪
                    this.onEditorReady()
                    break

                case 'save':
                    // 用户点击了保存
                    this.onSave(msg)
                    break

                case 'exit':
                    // 用户退出编辑器
                    this.requestClose(!!msg.modified)
                    break

                case 'autosave':
                    // DrawIO 内容已变化，记录最新 XML 用于关闭保护
                    this.onAutosave(msg)
                    break

                case 'export':
                    // 收到导出结果
                    this.onExport(msg)
                    break
            }
        } catch (e) {
            // 忽略非 JSON 消息
        }
    }

    /**
     * DrawIO 编辑器准备就绪
     */
    onEditorReady() {
        // 隐藏加载指示器
        const loading = this.modal.querySelector('.drawio-loading')
        if (loading) {
            loading.style.display = 'none'
        }

        // 显示 iframe
        this.iframe.style.display = 'block'
        this.editorReady = true
        this.hasPotentialUnsavedChanges = true

        // 加载已有的 XML 数据
        const loadMsg = {
            action: 'load',
            autosave: 1,
            modified: false,
            xml: this.pendingXml || ''
        }

        this.postMessage(loadMsg)
    }

    /**
     * 请求关闭编辑器。存在未保存修改时提示先保存。
     * @param {boolean} forcePrompt - DrawIO 明确报告有未保存修改时强制提示
     */
    async requestClose(forcePrompt = false) {
        if (this.isSaving || this.pendingClosePrompt) return

        if (!forcePrompt && !this.hasUnsavedChanges()) {
            this.close()
            return
        }

        const action = await this.showCloseConfirm()

        if (action === 'save') {
            this.save()
        } else if (action === 'discard') {
            this.close()
        }
    }

    /**
     * 判断当前图形是否存在未保存修改
     * @returns {boolean}
     */
    hasUnsavedChanges() {
        return this.editorReady || this.hasPotentialUnsavedChanges || this.initialXmlSnapshot !== this.getXmlSnapshot(this.currentXml)
    }

    /**
     * 获取用于比较的 XML 快照
     * @param {string|null|undefined} xml - DrawIO XML 数据
     * @returns {string}
     */
    getXmlSnapshot(xml) {
        return typeof xml === 'string' ? xml : ''
    }

    /**
     * 显示关闭确认层
     * @returns {Promise<string>} save/discard/cancel
     */
    showCloseConfirm() {
        const closeConfirm = this.modal.querySelector('.drawio-close-confirm')
        const saveButton = this.modal.querySelector('.drawio-close-confirm-save')

        closeConfirm.hidden = false
        saveButton.focus()

        this.pendingClosePrompt = new Promise(resolve => {
            this.resolveClosePrompt = (action) => {
                closeConfirm.hidden = true
                this.pendingClosePrompt = null
                this.resolveClosePrompt = null
                resolve(action)
            }
        })

        return this.pendingClosePrompt
    }

    /**
     * 处理 DrawIO 自动保存事件，记录最新 XML 但不上传服务器
     */
    onAutosave(msg) {
        if (typeof msg.xml === 'string') {
            this.currentXml = msg.xml
            this.hasPotentialUnsavedChanges = this.initialXmlSnapshot !== this.getXmlSnapshot(msg.xml)
        } else {
            this.hasPotentialUnsavedChanges = true
        }
    }

    /**
     * 获取 DrawIO 导出配置
     * @returns {Object}
     */
    getExportOptions() {
        return {
            format: (window.drawioConfig && window.drawioConfig.exportFormat) || 'svg',
            keepTheme: (window.drawioConfig && typeof window.drawioConfig.keepTheme !== 'undefined') ? window.drawioConfig.keepTheme : false
        }
    }

    /**
     * 保存 DrawIO 图形
     */
    save() {
        if (this.isSaving) return
        this.isSaving = true
        this.setSavingState(true)
        this.hasSaveXmlForCurrentSave = false
        this.requireExportXmlForCurrentSave = true

        this.postMessage({ action: 'save' })

        this.pendingSaveTimer = setTimeout(() => {
            this.pendingSaveTimer = null
            if (this.isSaving && !this.hasSaveXmlForCurrentSave) {
                this.requestExport(true)
            }
        }, 3000)
    }

    /**
     * 请求 DrawIO 导出当前图形
     * @param {boolean} requireExportXml - 是否要求导出事件必须携带 XML
     */
    requestExport(requireExportXml = false) {
        const exportOptions = this.getExportOptions()
        this.pendingExportFormat = exportOptions.format
        this.requireExportXmlForCurrentSave = requireExportXml

        this.postMessage({
            action: 'export',
            format: exportOptions.format,   // 动态格式: svg 或 png
            keepTheme: exportOptions.keepTheme,   // 动态主题模式: false=强制浅色, true=原有主题
            background: exportOptions.format === 'svg' ? '#ffffff' : undefined, // SVG 强制背景
            shadow: true,           // 阴影
            embedImages: true,      // 嵌入图片
            scale: 1,
            border: 0,
            spin: 'Exporting...'
        })
    }

    /**
     * 处理保存事件
     */
    onSave(msg) {
        // 保存 XML 数据
        if (typeof msg.xml === 'string') {
            this.currentXml = msg.xml
            this.hasSaveXmlForCurrentSave = true
        }

        if (this.pendingSaveTimer) {
            clearTimeout(this.pendingSaveTimer)
            this.pendingSaveTimer = null
        }

        if (!this.isSaving) {
            this.isSaving = true
            this.setSavingState(true)
        }

        this.requestExport(false)
    }

    /**
     * 处理导出结果
     */
    async onExport(msg) {
        if (!msg.data) {
            console.error('导出数据为空')
            alert('保存失败，请重试')
            this.finishSave()
            return
        }

        try {
            const hasExportXml = typeof msg.xml === 'string'
            const xml = hasExportXml ? msg.xml : this.currentXml
            if (this.requireExportXmlForCurrentSave && !hasExportXml && !this.hasSaveXmlForCurrentSave) {
                throw new Error('未能获取最新 DrawIO XML 数据，请在 DrawIO 内点击保存后重试')
            }
            if (!xml) {
                throw new Error('未能获取 DrawIO XML 数据')
            }

            // 上传到服务器
            const result = await this.uploadToServer(xml, msg.data, this.pendingExportFormat || msg.format || 'svg')

            if (result && result.imageUrl) {
                this.currentXml = xml
                this.initialXmlSnapshot = this.getXmlSnapshot(xml)
                this.hasPotentialUnsavedChanges = false

                // 调用保存回调
                if (this.onSaveCallback) {
                    this.onSaveCallback({
                        fileId: result.fileId,
                        imageUrl: result.imageUrl
                    })
                }

                // 关闭编辑器
                this.finishSave()
                this.close()
            } else {
                console.error('上传失败')
                alert('保存失败，请重试')
                this.finishSave()
            }
        } catch (e) {
            console.error('上传错误:', e)
            alert('保存失败: ' + e.message)
            this.finishSave()
        }
    }

    /**
     * 结束保存流程
     */
    finishSave() {
        if (this.pendingSaveTimer) {
            clearTimeout(this.pendingSaveTimer)
            this.pendingSaveTimer = null
        }

        this.isSaving = false
        this.setSavingState(false)
        this.pendingExportFormat = null
        this.hasSaveXmlForCurrentSave = false
        this.requireExportXmlForCurrentSave = false
    }

    /**
     * 设置保存中的按钮状态
     * @param {boolean} isSaving - 是否正在保存
     */
    setSavingState(isSaving) {
        if (!this.modal) return

        const saveButton = this.modal.querySelector('.drawio-close-confirm-save')
        if (saveButton) {
            saveButton.disabled = isSaving
            saveButton.textContent = isSaving ? '保存中...' : '保存并关闭'
        }
    }

    /**
     * 上传数据到服务器
     * @param {string} xml - DrawIO XML 数据
     * @param {string} imageData - 图片 Base64 数据
     */
    async uploadToServer(xml, imageData, format) {
        const formData = new FormData()
        formData.append('xml', xml)
        formData.append('image', imageData)
        formData.append('format', format)  // 导出格式

        // 如果是更新已有图形，传递文件 ID
        if (this.currentFileId) {
            formData.append('fileId', this.currentFileId)
        }

        const response = await fetch('/uploaddrawio', {
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
     * 向 DrawIO iframe 发送消息
     */
    postMessage(msg) {
        if (this.iframe && this.iframe.contentWindow) {
            this.iframe.contentWindow.postMessage(JSON.stringify(msg), '*')
        }
    }

    /**
     * 关闭编辑器
     */
    close() {
        // 移除消息监听
        window.removeEventListener('message', this.messageHandler)

        // 移除模态框
        if (this.modal) {
            this.modal.remove()
            this.modal = null
        }

        // 恢复页面滚动
        document.body.style.overflow = ''

        // 重置状态
        this.iframe = null
        this.currentFileId = null
        this.currentXml = null
        this.pendingXml = null
        this.initialXmlSnapshot = null
        this.isSaving = false
        this.editorReady = false
        this.hasPotentialUnsavedChanges = false
        this.pendingClosePrompt = null
        this.resolveClosePrompt = null
        this.pendingExportFormat = null
        if (this.pendingSaveTimer) {
            clearTimeout(this.pendingSaveTimer)
        }
        this.pendingSaveTimer = null
        this.hasSaveXmlForCurrentSave = false
        this.requireExportXmlForCurrentSave = false
    }
}

/**
 * 从图片 URL 中提取 DrawIO 文件 ID
 * @param {string} url - 图片 URL
 * @returns {string|null} 文件 ID 或 null
 */
export function getDrawioFileIdFromUrl(url) {
    // 匹配 drawio-xxx.png 或 drawio-xxx.svg 格式
    const match = url.match(/\/(drawio-[a-f0-9-]+)\.(png|svg)/i)
    return match ? match[1] : null
}

/**
 * 检查 URL 是否是 DrawIO 图片
 * @param {string} url - 图片 URL
 * @returns {boolean}
 */
export function isDrawioImage(url) {
    return getDrawioFileIdFromUrl(url) !== null
}

// 创建默认实例
const drawioEditor = new DrawioEditor()

export default drawioEditor

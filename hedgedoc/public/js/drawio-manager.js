/**
 * DrawIO 文件管理页面脚本
 * 
 * 功能：
 * - 加载和显示文件列表
 * - 孤立文件检测和清理
 * - 单文件删除和批量删除
 * - 文件下载
 */

(function () {
    'use strict';

    // DOM 元素引用
    const elements = {
        // 统计数据
        statTotal: document.getElementById('stat-total'),
        statXmlSize: document.getElementById('stat-xml-size'),
        statImageSize: document.getElementById('stat-image-size'),
        statOrphan: document.getElementById('stat-orphan'),

        // 工具栏
        btnRefresh: document.getElementById('btn-refresh'),
        btnSelectAll: document.getElementById('btn-select-all'),
        btnCleanup: document.getElementById('btn-cleanup'),

        // 表格
        filesTable: document.getElementById('files-table'),
        filesTbody: document.getElementById('files-tbody'),
        checkboxAll: document.getElementById('checkbox-all'),

        // 状态
        loadingOverlay: document.getElementById('loading-overlay'),
        emptyState: document.getElementById('empty-state'),

        // 模态框
        modalOverlay: document.getElementById('modal-overlay'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        modalClose: document.getElementById('modal-close'),
        modalCancel: document.getElementById('modal-cancel'),
        modalConfirm: document.getElementById('modal-confirm'),

        // Toast
        toastContainer: document.getElementById('toast-container')
    };

    // 当前文件列表数据
    let currentFiles = [];
    let selectedFiles = new Set();
    let modalCallback = null;

    /**
     * 格式化文件大小
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小
     */
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 格式化日期
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期
     */
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 显示加载状态
     * @param {boolean} show - 是否显示
     */
    function showLoading(show) {
        if (show) {
            elements.loadingOverlay.classList.remove('hidden');
            elements.loadingOverlay.style.display = 'flex';
        } else {
            elements.loadingOverlay.classList.add('hidden');
            elements.loadingOverlay.style.display = 'none';
        }
    }

    /**
     * 显示 Toast 提示
     * @param {string} message - 提示消息
     * @param {string} type - 类型 (success/error/info)
     */
    function showToast(message, type = 'info') {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
      <i class="fa ${icons[type]}"></i>
      <span class="toast-message">${message}</span>
    `;

        elements.toastContainer.appendChild(toast);

        // 3秒后自动消失
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 显示确认模态框
     * @param {string} title - 标题
     * @param {string} body - 内容 HTML
     * @param {Function} onConfirm - 确认回调
     */
    function showModal(title, body, onConfirm) {
        elements.modalTitle.textContent = title;
        elements.modalBody.innerHTML = body;
        modalCallback = onConfirm;
        elements.modalOverlay.style.display = 'flex';
    }

    /**
     * 隐藏模态框
     */
    function hideModal() {
        elements.modalOverlay.style.display = 'none';
        modalCallback = null;
    }

    /**
     * 更新统计信息
     * @param {Object} summary - 统计摘要
     */
    function updateStats(summary) {
        elements.statTotal.textContent = summary.totalFiles || 0;
        elements.statXmlSize.textContent = formatSize(summary.totalXmlSize || 0);
        elements.statImageSize.textContent = formatSize(summary.totalImageSize || 0);
        elements.statOrphan.textContent = summary.orphanCount || 0;

        // 更新清理按钮状态
        elements.btnCleanup.disabled = (summary.orphanCount || 0) === 0;
    }

    /**
     * 渲染文件列表
     * @param {Array} files - 文件列表
     */
    function renderFiles(files) {
        currentFiles = files;
        selectedFiles.clear();

        if (files.length === 0) {
            elements.filesTbody.innerHTML = '';
            elements.emptyState.style.display = 'block';
            elements.filesTable.style.display = 'none';
            return;
        }

        elements.emptyState.style.display = 'none';
        elements.filesTable.style.display = 'table';

        const html = files.map((file, index) => {
            const isOrphan = file.isOrphan;
            const rowClass = isOrphan ? 'orphan-row' : '';

            // 预览图片 URL
            const previewUrl = file.imagePath || '/uploads/drawio/placeholder.png';

            // 格式标签
            const formatBadge = file.format
                ? `<span class="format-badge format-${file.format}">${file.format.toUpperCase()}</span>`
                : '-';

            // 状态标签
            const statusBadge = isOrphan
                ? '<span class="status-badge status-orphan"><i class="fa fa-exclamation-triangle"></i> 孤立</span>'
                : '<span class="status-badge status-normal"><i class="fa fa-check"></i> 正常</span>';

            // 原始XML文件显示
            const xmlFileHtml = file.xmlPath
                ? `<div class="file-download-cell">
                     <a href="/api/drawio/download/${file.fileId}/xml" class="download-link" title="点击下载 XML 文件">
                       <i class="fa fa-file-code-o"></i>
                       <span class="file-name">${file.fileId}.xml</span>
                     </a>
                     <span class="file-size">(${formatSize(file.xmlSize || 0)})</span>
                   </div>`
                : '<span class="no-file">-</span>';

            // 渲染图片文件显示
            const imageFileHtml = file.imagePath
                ? `<div class="file-download-cell">
                     <a href="/api/drawio/download/${file.fileId}/image" class="download-link" title="点击下载渲染图片">
                       <i class="fa fa-file-image-o"></i>
                       <span class="file-name">${file.fileId}.${file.format || 'png'}</span>
                     </a>
                     <span class="file-size">(${formatSize(file.imageSize || 0)})</span>
                   </div>`
                : '<span class="no-file">-</span>';

            return `
        <tr class="${rowClass}" data-file-id="${file.fileId}" data-index="${index}">
          <td class="col-checkbox">
            <input type="checkbox" class="file-checkbox" data-file-id="${file.fileId}">
          </td>
          <td class="col-preview">
            <img src="${previewUrl}" alt="preview" class="preview-thumbnail" 
                 onerror="this.src='/icons/icon_128x128.png'" 
                 onclick="window.open('${previewUrl}', '_blank')">
          </td>
          <td class="col-fileid">
            <span class="file-id-cell">${file.fileId}</span>
          </td>
          <td class="col-format">${formatBadge}</td>
          <td class="col-filepath">${xmlFileHtml}</td>
          <td class="col-filepath">${imageFileHtml}</td>
          <td class="col-date">${formatDate(file.createdAt)}</td>
          <td class="col-status">${statusBadge}</td>
          <td class="col-actions">
            <div class="action-buttons">
              <button class="action-btn btn-delete" title="删除此文件" 
                      onclick="confirmDelete('${file.fileId}')">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
        }).join('');

        elements.filesTbody.innerHTML = html;

        // 绑定复选框事件
        document.querySelectorAll('.file-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', onFileCheckboxChange);
        });
    }

    /**
     * 加载文件列表
     */
    async function loadFiles() {
        showLoading(true);

        try {
            const response = await fetch('/api/drawio/files');
            const data = await response.json();

            if (data.success) {
                updateStats(data.summary);
                renderFiles(data.files);
            } else {
                showToast('加载文件列表失败: ' + data.error, 'error');
            }
        } catch (e) {
            console.error('Load files error:', e);
            showToast('加载文件列表失败: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /**
     * 下载文件
     * @param {string} fileId - 文件 ID
     * @param {string} type - 类型 (xml/image)
     */
    window.downloadFile = function (fileId, type) {
        const url = `/api/drawio/download/${fileId}/${type}`;
        window.open(url, '_blank');
    };

    /**
     * 确认删除单个文件
     * @param {string} fileId - 文件 ID
     */
    window.confirmDelete = function (fileId) {
        showModal(
            '确认删除',
            `<p>确定要删除文件 <strong>${fileId}</strong> 吗？</p>
       <p style="color: #ef5350; margin-top: 12px;">
         <i class="fa fa-exclamation-triangle"></i> 此操作不可撤销！
       </p>`,
            () => deleteFile(fileId)
        );
    };

    /**
     * 删除单个文件
     * @param {string} fileId - 文件 ID
     */
    async function deleteFile(fileId) {
        hideModal();
        showLoading(true);

        try {
            const response = await fetch(`/api/drawio/files/${fileId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                showToast(`已删除: ${data.deletedFiles.join(', ')}`, 'success');
                loadFiles(); // 刷新列表
            } else {
                showToast('删除失败: ' + data.error, 'error');
            }
        } catch (e) {
            console.error('Delete error:', e);
            showToast('删除失败: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /**
     * 确认清理孤立文件
     */
    function confirmCleanup() {
        const orphans = currentFiles.filter(f => f.isOrphan);

        if (orphans.length === 0) {
            showToast('没有需要清理的孤立文件', 'info');
            return;
        }

        const fileList = orphans.map(f => `<div class="file-list-item">${f.fileId}</div>`).join('');

        showModal(
            '确认清理孤立文件',
            `<p>将删除以下 <strong>${orphans.length}</strong> 个孤立文件：</p>
       <div class="file-list">${fileList}</div>
       <p style="color: #ef5350; margin-top: 12px;">
         <i class="fa fa-exclamation-triangle"></i> 此操作不可撤销！
       </p>`,
            cleanupOrphans
        );
    }

    /**
     * 执行清理孤立文件
     */
    async function cleanupOrphans() {
        hideModal();
        showLoading(true);

        try {
            const response = await fetch('/api/drawio/cleanup', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                showToast(`已清理 ${data.deletedCount} 个文件，释放 ${formatSize(data.freedSpace)}`, 'success');
                loadFiles(); // 刷新列表
            } else {
                showToast('清理失败: ' + data.error, 'error');
            }
        } catch (e) {
            console.error('Cleanup error:', e);
            showToast('清理失败: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    /**
     * 文件复选框变化处理
     */
    function onFileCheckboxChange(e) {
        const fileId = e.target.dataset.fileId;
        if (e.target.checked) {
            selectedFiles.add(fileId);
        } else {
            selectedFiles.delete(fileId);
        }
        updateSelectAllCheckbox();
    }

    /**
     * 全选/取消全选
     */
    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.file-checkbox');
        const allChecked = selectedFiles.size === currentFiles.length;

        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
            if (!allChecked) {
                selectedFiles.add(cb.dataset.fileId);
            }
        });

        if (allChecked) {
            selectedFiles.clear();
        }

        updateSelectAllCheckbox();
    }

    /**
     * 更新全选复选框状态
     */
    function updateSelectAllCheckbox() {
        if (currentFiles.length === 0) {
            elements.checkboxAll.checked = false;
            elements.checkboxAll.indeterminate = false;
        } else if (selectedFiles.size === 0) {
            elements.checkboxAll.checked = false;
            elements.checkboxAll.indeterminate = false;
        } else if (selectedFiles.size === currentFiles.length) {
            elements.checkboxAll.checked = true;
            elements.checkboxAll.indeterminate = false;
        } else {
            elements.checkboxAll.checked = false;
            elements.checkboxAll.indeterminate = true;
        }
    }

    /**
     * 初始化事件绑定
     */
    function initEventListeners() {
        // 刷新按钮
        elements.btnRefresh.addEventListener('click', loadFiles);

        // 全选按钮
        elements.btnSelectAll.addEventListener('click', toggleSelectAll);
        elements.checkboxAll.addEventListener('change', toggleSelectAll);

        // 清理按钮
        elements.btnCleanup.addEventListener('click', confirmCleanup);

        // 模态框关闭
        elements.modalClose.addEventListener('click', hideModal);
        elements.modalCancel.addEventListener('click', hideModal);
        elements.modalConfirm.addEventListener('click', () => {
            if (modalCallback) modalCallback();
        });

        // 点击遮罩关闭模态框
        elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.modalOverlay) {
                hideModal();
            }
        });

        // ESC 键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideModal();
            }
        });
    }

    /**
     * 页面初始化
     */
    function init() {
        initEventListeners();
        loadFiles();
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

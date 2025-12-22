'use strict'

/**
 * DrawIO 文件管理路由模块
 * 
 * 提供 DrawIO 文件的管理功能:
 * - 文件列表查看
 * - 孤立文件检测
 * - 文件删除和批量清理
 * - 文件下载
 */

const Router = require('express').Router
const path = require('path')
const fs = require('fs')

const config = require('../config')
const logger = require('../logger')
const errors = require('../errors')
const models = require('../models')

const drawioManagerRouter = module.exports = Router()

// DrawIO 文件存储目录
const uploadsPath = config.uploadsPath
const drawioDir = path.join(uploadsPath, 'drawio')

/**
 * 确保 DrawIO 目录存在
 */
function ensureDrawioDir() {
    if (!fs.existsSync(drawioDir)) {
        fs.mkdirSync(drawioDir, { recursive: true })
    }
}

/**
 * 获取文件统计信息
 * @param {string} filePath - 文件路径
 * @returns {Object|null} 文件统计信息
 */
function getFileStats(filePath) {
    try {
        const stats = fs.statSync(filePath)
        return {
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        }
    } catch (e) {
        return null
    }
}

/**
 * 获取所有 DrawIO 文件
 * @returns {Array} DrawIO 文件列表
 */
function getAllDrawioFiles() {
    ensureDrawioDir()

    const files = []

    // 获取 uploads 目录下的渲染图片 (drawio-*.svg 或 drawio-*.png)
    const uploadsFiles = fs.readdirSync(uploadsPath).filter(f => {
        return (f.startsWith('drawio-') && (f.endsWith('.svg') || f.endsWith('.png')))
    })

    // 获取 drawio 目录下的 XML 原始文件
    const xmlFiles = fs.readdirSync(drawioDir).filter(f => {
        return f.startsWith('drawio-') && f.endsWith('.xml')
    })

    // 创建文件 ID 到信息的映射
    const fileMap = new Map()

    // 处理 XML 文件
    for (const xmlFile of xmlFiles) {
        const fileId = xmlFile.replace('.xml', '')
        const xmlPath = path.join(drawioDir, xmlFile)
        const xmlStats = getFileStats(xmlPath)

        if (xmlStats) {
            fileMap.set(fileId, {
                fileId,
                xmlPath: `/uploads/drawio/${xmlFile}`,
                xmlFullPath: xmlPath,
                imagePath: null,
                imageFullPath: null,
                format: null,
                xmlSize: xmlStats.size,
                imageSize: 0,
                createdAt: xmlStats.createdAt
            })
        }
    }

    // 处理图片文件
    for (const imgFile of uploadsFiles) {
        const ext = path.extname(imgFile)
        const fileId = imgFile.replace(ext, '')
        const imgPath = path.join(uploadsPath, imgFile)
        const imgStats = getFileStats(imgPath)

        if (imgStats) {
            if (fileMap.has(fileId)) {
                // 已有 XML，更新图片信息
                const entry = fileMap.get(fileId)
                entry.imagePath = `/uploads/${imgFile}`
                entry.imageFullPath = imgPath
                entry.format = ext === '.svg' ? 'svg' : 'png'
                entry.imageSize = imgStats.size
            } else {
                // 只有图片没有 XML (异常情况)
                fileMap.set(fileId, {
                    fileId,
                    xmlPath: null,
                    xmlFullPath: null,
                    imagePath: `/uploads/${imgFile}`,
                    imageFullPath: imgPath,
                    format: ext === '.svg' ? 'svg' : 'png',
                    xmlSize: 0,
                    imageSize: imgStats.size,
                    createdAt: imgStats.createdAt
                })
            }
        }
    }

    return Array.from(fileMap.values())
}

/**
 * 获取所有文档中引用的 DrawIO 文件 ID
 * @returns {Promise<Set<string>>} 被引用的文件 ID 集合
 */
async function getReferencedDrawioFileIds() {
    const referencedIds = new Set()

    try {
        // 查询所有 Note 的内容
        const notes = await models.Note.findAll({
            attributes: ['id', 'content']
        })

        // 正则匹配 DrawIO 图片引用
        // 匹配格式: /uploads/drawio-xxx.png 或 /uploads/drawio-xxx.svg
        const drawioPattern = /\/uploads\/(drawio-[a-zA-Z0-9_-]+)\.(png|svg)/g

        for (const note of notes) {
            if (note.content) {
                let match
                while ((match = drawioPattern.exec(note.content)) !== null) {
                    referencedIds.add(match[1])
                }
            }
        }
    } catch (e) {
        logger.error(`获取文档引用时出错: ${e.message}`)
    }

    return referencedIds
}

/**
 * 检查认证状态，仅允许登录用户访问
 * 未登录时重定向到首页
 */
function requireAuth(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect('/')
    }
    next()
}

// ========== 路由定义 ==========

/**
 * 渲染管理页面
 * GET /drawio-manager
 */
drawioManagerRouter.get('/drawio-manager', requireAuth, function (req, res) {
    res.render('drawio-manager', {
        title: 'DrawIO 文件管理'
    })
})

/**
 * 获取所有 DrawIO 文件列表
 * GET /api/drawio/files
 */
drawioManagerRouter.get('/api/drawio/files', requireAuth, async function (req, res) {
    try {
        const files = getAllDrawioFiles()
        const referencedIds = await getReferencedDrawioFileIds()

        // 标记孤立文件
        let orphanCount = 0
        for (const file of files) {
            file.isOrphan = !referencedIds.has(file.fileId)
            if (file.isOrphan) orphanCount++

            // 移除内部使用的完整路径
            delete file.xmlFullPath
            delete file.imageFullPath
        }

        // 计算统计信息
        const summary = {
            totalFiles: files.length,
            totalXmlSize: files.reduce((sum, f) => sum + (f.xmlSize || 0), 0),
            totalImageSize: files.reduce((sum, f) => sum + (f.imageSize || 0), 0),
            orphanCount
        }

        res.json({
            success: true,
            files,
            summary
        })
    } catch (e) {
        logger.error(`获取 DrawIO 文件列表失败: ${e.message}`)
        res.status(500).json({
            success: false,
            error: e.message
        })
    }
})

/**
 * 获取孤立文件列表
 * GET /api/drawio/orphans
 */
drawioManagerRouter.get('/api/drawio/orphans', requireAuth, async function (req, res) {
    try {
        const files = getAllDrawioFiles()
        const referencedIds = await getReferencedDrawioFileIds()

        const orphans = files.filter(f => !referencedIds.has(f.fileId))

        // 移除内部使用的完整路径
        for (const file of orphans) {
            file.isOrphan = true
            delete file.xmlFullPath
            delete file.imageFullPath
        }

        res.json({
            success: true,
            orphans,
            count: orphans.length
        })
    } catch (e) {
        logger.error(`获取孤立文件失败: ${e.message}`)
        res.status(500).json({
            success: false,
            error: e.message
        })
    }
})

/**
 * 删除指定文件
 * DELETE /api/drawio/files/:fileId
 */
drawioManagerRouter.delete('/api/drawio/files/:fileId', requireAuth, function (req, res) {
    const fileId = req.params.fileId

    // 安全检查：防止路径穿越
    if (!fileId || fileId.includes('..') || fileId.includes('/') || !fileId.startsWith('drawio-')) {
        return res.status(400).json({
            success: false,
            error: '无效的文件 ID'
        })
    }

    try {
        let deletedFiles = []

        // 删除 XML 文件
        const xmlPath = path.join(drawioDir, `${fileId}.xml`)
        if (fs.existsSync(xmlPath)) {
            fs.unlinkSync(xmlPath)
            deletedFiles.push(`${fileId}.xml`)
            logger.info(`已删除 DrawIO XML 文件: ${fileId}.xml`)
        }

        // 删除图片文件 (SVG 或 PNG)
        const svgPath = path.join(uploadsPath, `${fileId}.svg`)
        const pngPath = path.join(uploadsPath, `${fileId}.png`)

        if (fs.existsSync(svgPath)) {
            fs.unlinkSync(svgPath)
            deletedFiles.push(`${fileId}.svg`)
            logger.info(`已删除 DrawIO SVG 文件: ${fileId}.svg`)
        }

        if (fs.existsSync(pngPath)) {
            fs.unlinkSync(pngPath)
            deletedFiles.push(`${fileId}.png`)
            logger.info(`已删除 DrawIO PNG 文件: ${fileId}.png`)
        }

        if (deletedFiles.length === 0) {
            return res.status(404).json({
                success: false,
                error: '文件不存在'
            })
        }

        res.json({
            success: true,
            deletedFiles,
            message: `已删除 ${deletedFiles.length} 个文件`
        })
    } catch (e) {
        logger.error(`删除 DrawIO 文件失败: ${e.message}`)
        res.status(500).json({
            success: false,
            error: e.message
        })
    }
})

/**
 * 批量清理孤立文件
 * POST /api/drawio/cleanup
 */
drawioManagerRouter.post('/api/drawio/cleanup', requireAuth, async function (req, res) {
    try {
        const files = getAllDrawioFiles()
        const referencedIds = await getReferencedDrawioFileIds()

        const orphans = files.filter(f => !referencedIds.has(f.fileId))

        if (orphans.length === 0) {
            return res.json({
                success: true,
                message: '没有需要清理的孤立文件',
                deletedCount: 0,
                freedSpace: 0
            })
        }

        let deletedCount = 0
        let freedSpace = 0
        const deletedFiles = []

        for (const orphan of orphans) {
            try {
                // 删除 XML 文件
                if (orphan.xmlFullPath && fs.existsSync(orphan.xmlFullPath)) {
                    fs.unlinkSync(orphan.xmlFullPath)
                    freedSpace += orphan.xmlSize || 0
                    deletedFiles.push(orphan.xmlPath)
                }

                // 删除图片文件
                if (orphan.imageFullPath && fs.existsSync(orphan.imageFullPath)) {
                    fs.unlinkSync(orphan.imageFullPath)
                    freedSpace += orphan.imageSize || 0
                    deletedFiles.push(orphan.imagePath)
                }

                deletedCount++
                logger.info(`已清理孤立文件: ${orphan.fileId}`)
            } catch (e) {
                logger.error(`清理文件 ${orphan.fileId} 失败: ${e.message}`)
            }
        }

        res.json({
            success: true,
            message: `已清理 ${deletedCount} 个孤立文件`,
            deletedCount,
            deletedFiles,
            freedSpace
        })
    } catch (e) {
        logger.error(`批量清理孤立文件失败: ${e.message}`)
        res.status(500).json({
            success: false,
            error: e.message
        })
    }
})

/**
 * 下载 XML 原始文件
 * GET /api/drawio/download/:fileId/xml
 */
drawioManagerRouter.get('/api/drawio/download/:fileId/xml', requireAuth, function (req, res) {
    const fileId = req.params.fileId

    // 安全检查
    if (!fileId || fileId.includes('..') || fileId.includes('/') || !fileId.startsWith('drawio-')) {
        return res.status(400).json({
            success: false,
            error: '无效的文件 ID'
        })
    }

    const xmlPath = path.join(drawioDir, `${fileId}.xml`)

    if (!fs.existsSync(xmlPath)) {
        return res.status(404).json({
            success: false,
            error: '文件不存在'
        })
    }

    res.download(xmlPath, `${fileId}.xml`)
})

/**
 * 下载图片文件
 * GET /api/drawio/download/:fileId/image
 */
drawioManagerRouter.get('/api/drawio/download/:fileId/image', requireAuth, function (req, res) {
    const fileId = req.params.fileId

    // 安全检查
    if (!fileId || fileId.includes('..') || fileId.includes('/') || !fileId.startsWith('drawio-')) {
        return res.status(400).json({
            success: false,
            error: '无效的文件 ID'
        })
    }

    // 优先查找 SVG
    let imagePath = path.join(uploadsPath, `${fileId}.svg`)
    let fileName = `${fileId}.svg`

    if (!fs.existsSync(imagePath)) {
        // 尝试 PNG
        imagePath = path.join(uploadsPath, `${fileId}.png`)
        fileName = `${fileId}.png`
    }

    if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
            success: false,
            error: '文件不存在'
        })
    }

    res.download(imagePath, fileName)
})

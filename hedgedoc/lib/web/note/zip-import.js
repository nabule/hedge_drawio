'use strict'

/**
 * ZIP 导入模块
 * 
 * 将 HedgeDoc 导出的 ZIP 包导入为新笔记
 * 支持还原：Markdown 文档、DrawIO 图形（含 XML）、思维导图（含 JSON）、普通图片
 */

const AdmZip = require('adm-zip')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { v4: uuidv4 } = require('uuid')
const rimraf = require('rimraf')

const config = require('../../config')
const logger = require('../../logger')
const models = require('../../models')

/**
 * 确保目录存在
 * @param {string} dir - 目录路径
 */
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

/**
 * 从文件名中提取资源 ID
 * @param {string} filename - 文件名，如 drawio-xxx.svg 或 mindmap-xxx.png
 * @returns {Object|null} { type: 'drawio'|'mindmap'|'image', id: 'drawio-xxx' }
 */
function extractResourceInfo(filename) {
    // DrawIO 图片
    const drawioMatch = filename.match(/^(drawio-[a-f0-9-]+)\.(png|svg)$/i)
    if (drawioMatch) {
        return { type: 'drawio', id: drawioMatch[1], ext: drawioMatch[2] }
    }

    // 思维导图图片
    const mindmapMatch = filename.match(/^(mindmap-[a-f0-9-]+)\.(png|svg)$/i)
    if (mindmapMatch) {
        return { type: 'mindmap', id: mindmapMatch[1], ext: mindmapMatch[2] }
    }

    // 普通图片
    const imageMatch = filename.match(/^(.+)\.(png|jpg|jpeg|gif|svg|webp)$/i)
    if (imageMatch) {
        return { type: 'image', id: imageMatch[1], ext: imageMatch[2] }
    }

    return null
}

/**
 * 处理 ZIP 导入
 * @param {Buffer} zipBuffer - ZIP 文件的 Buffer
 * @returns {Promise<Object>} { success: boolean, noteUrl?: string, message?: string }
 */
async function processZipImport(zipBuffer) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hedgedoc-import-'))

    try {
        // 1. 解压 ZIP
        const zip = new AdmZip(zipBuffer)
        zip.extractAllTo(tempDir, true)
        logger.debug(`ZIP 已解压到临时目录: ${tempDir}`)

        // 2. 检查必需文件
        const noteOriginalPath = path.join(tempDir, 'note-original.md')
        const noteTransformedPath = path.join(tempDir, 'note.md')

        let markdownPath
        if (fs.existsSync(noteOriginalPath)) {
            markdownPath = noteOriginalPath
        } else if (fs.existsSync(noteTransformedPath)) {
            markdownPath = noteTransformedPath
        } else {
            throw new Error('无效的导出包：缺少 note-original.md 或 note.md')
        }

        let markdown = fs.readFileSync(markdownPath, 'utf8')
        logger.debug(`读取 Markdown 文件: ${markdownPath}`)

        // 3. 构建 oldId -> newId 映射表
        const idMap = new Map()

        // 4. 处理 assets 目录下的图片
        const assetsDir = path.join(tempDir, 'assets')
        if (fs.existsSync(assetsDir)) {
            const assetFiles = fs.readdirSync(assetsDir)

            for (const filename of assetFiles) {
                const resourceInfo = extractResourceInfo(filename)
                if (!resourceInfo) continue

                const oldId = resourceInfo.id
                let newId

                // 根据资源类型生成新 ID
                if (resourceInfo.type === 'drawio') {
                    newId = 'drawio-' + uuidv4()
                } else if (resourceInfo.type === 'mindmap') {
                    newId = 'mindmap-' + uuidv4()
                } else {
                    // 普通图片：保持原名或生成新名
                    newId = uuidv4()
                }

                idMap.set(oldId, { newId, ext: resourceInfo.ext, type: resourceInfo.type })

                // 复制图片到 /uploads 目录
                const srcPath = path.join(assetsDir, filename)
                const destPath = path.join(config.uploadsPath, newId + '.' + resourceInfo.ext)
                fs.copyFileSync(srcPath, destPath)
                logger.debug(`复制资源: ${filename} -> ${newId}.${resourceInfo.ext}`)
            }
        }

        // 5. 处理 drawio-source 目录下的 XML 文件
        const drawioSourceDir = path.join(tempDir, 'drawio-source')
        if (fs.existsSync(drawioSourceDir)) {
            const drawioDir = path.join(config.uploadsPath, 'drawio')
            ensureDir(drawioDir)

            const xmlFiles = fs.readdirSync(drawioSourceDir)
            for (const xmlFile of xmlFiles) {
                const match = xmlFile.match(/^(drawio-[a-f0-9-]+)\.xml$/i)
                if (!match) continue

                const oldId = match[1]
                const mapping = idMap.get(oldId)
                if (!mapping) continue

                const srcPath = path.join(drawioSourceDir, xmlFile)
                const destPath = path.join(drawioDir, mapping.newId + '.xml')
                fs.copyFileSync(srcPath, destPath)
                logger.debug(`复制 DrawIO XML: ${xmlFile} -> ${mapping.newId}.xml`)
            }
        }

        // 6. 处理 mindmap-source 目录下的 JSON 文件
        const mindmapSourceDir = path.join(tempDir, 'mindmap-source')
        if (fs.existsSync(mindmapSourceDir)) {
            const mindmapDir = path.join(config.uploadsPath, 'mindmap')
            ensureDir(mindmapDir)

            const jsonFiles = fs.readdirSync(mindmapSourceDir)
            for (const jsonFile of jsonFiles) {
                const match = jsonFile.match(/^(mindmap-[a-f0-9-]+)\.json$/i)
                if (!match) continue

                const oldId = match[1]
                const mapping = idMap.get(oldId)
                if (!mapping) continue

                const srcPath = path.join(mindmapSourceDir, jsonFile)
                const destPath = path.join(mindmapDir, mapping.newId + '.json')
                fs.copyFileSync(srcPath, destPath)
                logger.debug(`复制思维导图 JSON: ${jsonFile} -> ${mapping.newId}.json`)
            }
        }

        // 7. 将完整 URL（含域名和端口）转换为相对路径
        // 匹配 https://any-domain:any-port/uploads/ 格式的 URL
        markdown = markdown.replace(/https?:\/\/[^\/]+\/uploads\//g, '/uploads/')

        // 8. 将相对路径 ./assets/ 替换为 /uploads/
        markdown = markdown.replace(/\.\/assets\//g, '/uploads/')

        // 9. 替换 Markdown 中的所有旧 ID 为新 ID
        for (const [oldId, mapping] of idMap) {
            // 替换文件名（包含扩展名）
            const oldFilename = oldId + '.' + mapping.ext
            const newFilename = mapping.newId + '.' + mapping.ext
            markdown = markdown.split(oldFilename).join(newFilename)

            // 替换纯 ID（可能用于其他引用）
            markdown = markdown.split(oldId).join(mapping.newId)
        }

        // 10. 创建新笔记
        const note = await models.Note.create({
            content: markdown
        })

        logger.info(`ZIP 导入成功: 创建笔记 ${note.shortid}, 包含 ${idMap.size} 个资源`)

        // 10. 清理临时目录
        rimraf.sync(tempDir)

        return {
            success: true,
            noteUrl: '/' + note.shortid
        }

    } catch (e) {
        // 清理临时目录
        rimraf.sync(tempDir)

        logger.error(`ZIP 导入失败: ${e.message}`)
        return {
            success: false,
            message: e.message
        }
    }
}

module.exports = {
    processZipImport
}

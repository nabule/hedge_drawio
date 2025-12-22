'use strict'

/**
 * ZIP 导出模块
 * 
 * 将 HedgeDoc 文档及其引用的所有资源打包为 ZIP 文件
 * 包含：Markdown 文档、DrawIO 渲染图片、DrawIO 原始 XML、普通上传图片
 */

const archiver = require('archiver')
const path = require('path')
const fs = require('fs')
const config = require('../../config')
const logger = require('../../logger')

/**
 * 从 URL 中移除查询参数，获取纯净的路径
 * @param {string} url - 可能带有查询参数的 URL
 * @returns {string} 不含查询参数的 URL
 */
function removeQueryParams(url) {
    const questionIndex = url.indexOf('?')
    return questionIndex > -1 ? url.substring(0, questionIndex) : url
}

/**
 * 从 Markdown 内容中解析所有图片引用
 * @param {string} markdown - Markdown 内容
 * @returns {Object} { urlList: 所有URL引用, fileMap: 文件映射表(用于去重) }
 */
function parseImageReferences(markdown) {
    const urlList = []      // 所有 URL 引用（包括重复文件的不同 URL）
    const fileMap = new Map()  // 文件名 -> 文件信息（去重后）

    // 匹配 Markdown 图片语法: ![alt](url) 或 ![alt](url "title")
    // 注意：URL 可能包含查询参数如 ?t=xxx
    const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    let match

    while ((match = imageRegex.exec(markdown)) !== null) {
        const url = match[2]

        // 只处理本地上传的图片（/uploads/ 路径）
        if (url.includes('/uploads/')) {
            // 移除查询参数获取纯净 URL
            const cleanUrl = removeQueryParams(url)
            const filename = path.basename(cleanUrl)

            // 检查是否是 DrawIO 图片
            const drawioMatch = filename.match(/^(drawio-[a-f0-9-]+)\.(png|svg)$/i)

            // 保存 URL 到 filename 的映射（用于替换）
            urlList.push({
                url: url,
                filename: filename
            })

            // 文件信息（去重，只保留一份）
            if (!fileMap.has(filename)) {
                fileMap.set(filename, {
                    filename: filename,
                    isDrawio: !!drawioMatch,
                    fileId: drawioMatch ? drawioMatch[1] : null
                })
            }
        }
    }

    return { urlList, fileMap }
}

/**
 * 转换 Markdown 中的图片路径为相对路径
 * @param {string} markdown - 原始 Markdown 内容
 * @param {Array} urlList - URL 列表
 * @returns {string} 转换后的 Markdown 内容
 */
function transformMarkdownPaths(markdown, urlList) {
    let transformed = markdown

    for (const item of urlList) {
        // 将原始 URL（可能带参数）替换为相对路径
        const relativePath = `./assets/${item.filename}`
        transformed = transformed.split(item.url).join(relativePath)
    }

    return transformed
}

/**
 * 构建 ZIP 包并发送给客户端
 * @param {Object} note - 笔记对象
 * @param {Object} res - Express response 对象
 * @param {string} title - 文档标题
 */
async function buildZipArchive(note, res, title) {
    const markdown = note.content
    const { urlList, fileMap } = parseImageReferences(markdown)

    // 创建 ZIP 归档，启用 UTF-8 文件名编码
    const archive = archiver('zip', {
        zlib: { level: 6 },  // 压缩级别
        forceZip64: false,   // 避免兼容性问题
        // 启用 UTF-8 文件名编码（语言编码标志）
        namePrependSlash: false
    })

    // 处理文件名：移除非法字符，保留中文
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_')

    // 设置响应头，使用 RFC 5987 编码支持中文文件名
    res.setHeader('Content-Type', 'application/zip')
    // 同时设置 ASCII 和 UTF-8 编码的文件名以兼容不同浏览器
    const asciiFilename = safeTitle.replace(/[^\x00-\x7F]/g, '_') + '.zip'
    const utf8Filename = encodeURIComponent(safeTitle) + '.zip'
    res.setHeader('Content-Disposition',
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`)

    // 管道连接
    archive.pipe(res)

    // 错误处理
    archive.on('error', function (err) {
        logger.error('ZIP 打包错误: ' + err)
        throw err
    })

    // 转换 Markdown 路径并添加到归档（使用 urlList 确保所有 URL 都被替换）
    const transformedMarkdown = transformMarkdownPaths(markdown, urlList)
    archive.append(Buffer.from(transformedMarkdown, 'utf8'), { name: 'note.md' })

    // 添加原始 Markdown（不转换路径）作为备份
    archive.append(Buffer.from(markdown, 'utf8'), { name: 'note-original.md' })

    // 添加图片文件（使用 fileMap 确保每个文件只添加一次）
    const uploadsPath = config.uploadsPath
    const drawioDir = path.join(uploadsPath, 'drawio')

    for (const [filename, fileInfo] of fileMap) {
        const imagePath = path.join(uploadsPath, filename)

        // 检查文件是否存在
        if (fs.existsSync(imagePath)) {
            archive.file(imagePath, { name: `assets/${filename}` })
            logger.debug(`ZIP: 添加图片 ${filename}`)
        } else {
            logger.warn(`ZIP: 图片文件不存在 ${imagePath}`)
        }

        // 如果是 DrawIO 图片，添加原始 XML
        if (fileInfo.isDrawio && fileInfo.fileId) {
            const xmlPath = path.join(drawioDir, `${fileInfo.fileId}.xml`)
            if (fs.existsSync(xmlPath)) {
                archive.file(xmlPath, { name: `drawio-source/${fileInfo.fileId}.xml` })
                logger.debug(`ZIP: 添加 DrawIO XML ${fileInfo.fileId}.xml`)
            } else {
                logger.warn(`ZIP: DrawIO XML 不存在 ${xmlPath}`)
            }
        }
    }

    // 添加 README 说明文件
    const readme = `# 导出说明

本 ZIP 包含以下内容：

- \`note.md\` - 主文档（图片路径已转换为相对路径）
- \`note-original.md\` - 原始文档（保留原始 URL）
- \`assets/\` - 所有图片资源
- \`drawio-source/\` - DrawIO 原始 XML 文件（可用于再次编辑）

## 使用说明

1. 解压后，使用 Markdown 编辑器打开 \`note.md\` 即可查看文档
2. DrawIO 原始文件可导入 draw.io 进行编辑

导出时间: ${new Date().toISOString()}
`
    archive.append(Buffer.from(readme, 'utf8'), { name: 'README.md' })

    // 完成归档
    await archive.finalize()

    logger.info(`ZIP 打包完成: ${title}, 包含 ${fileMap.size} 个图片`)
}

module.exports = {
    parseImageReferences,
    transformMarkdownPaths,
    buildZipArchive
}


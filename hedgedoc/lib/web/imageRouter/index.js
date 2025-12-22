'use strict'

const Router = require('express').Router
const formidable = require('formidable')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const os = require('os')
const rimraf = require('rimraf')
const isSvg = require('is-svg')

const config = require('../../config')
const logger = require('../../logger')
const errors = require('../../errors')

const imageRouter = (module.exports = Router())

async function checkUploadType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const FileType = await import('file-type')
  let typeFromMagic = await FileType.fileTypeFromFile(filePath)
  if (extension === '.svg' && (typeFromMagic === undefined || typeFromMagic.mime === 'application/xml')) {
    const fileContent = fs.readFileSync(filePath)
    if (isSvg(fileContent)) {
      typeFromMagic = {
        ext: 'svg',
        mime: 'image/svg+xml'
      }
    }
  }
  if (typeFromMagic === undefined) {
    logger.error('Image upload error: Could not determine MIME-type')
    return false
  }
  // .jpeg, .jfif, .jpe files are identified by FileType to have the extension jpg
  if (['.jpeg', '.jfif', '.jpe'].includes(extension) && typeFromMagic.ext === 'jpg') {
    typeFromMagic.ext = extension.substr(1)
  }
  if (extension !== '.' + typeFromMagic.ext) {
    logger.error(
      'Image upload error: Provided file extension does not match MIME-type'
    )
    return false
  }
  if (!config.allowedUploadMimeTypes.includes(typeFromMagic.mime)) {
    logger.error(
      `Image upload error: MIME-type "${typeFromMagic.mime
      }" of uploaded file not allowed, only "${config.allowedUploadMimeTypes.join(
        ', '
      )}" are allowed`
    )
    return false
  }
  return true
}

// upload image
imageRouter.post('/uploadimage', function (req, res) {
  if (
    !req.isAuthenticated() &&
    !config.allowAnonymous &&
    !config.allowAnonymousEdits
  ) {
    logger.error(
      'Image upload error: Anonymous edits and therefore uploads are not allowed'
    )
    return errors.errorForbidden(res)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hedgedoc-'))
  const form = formidable({
    keepExtensions: true,
    uploadDir: tmpDir,
    filename: function (filename, ext) {
      if (typeof ext !== 'string') {
        ext = '.invalid'
      }
      return uuidv4() + ext
    }
  })

  form.parse(req, async function (err, fields, files) {
    if (err) {
      logger.error(`Image upload error: formidable error: ${err}`)
      rimraf.sync(tmpDir)
      return errors.errorForbidden(res)
    } else if (!files.image || !files.image.filepath) {
      logger.error('Image upload error: Upload didn\'t contain file)')
      rimraf.sync(tmpDir)
      return errors.errorBadRequest(res)
    } else if (!(await checkUploadType(files.image.filepath))) {
      rimraf.sync(tmpDir)
      return errors.errorBadRequest(res)
    } else {
      logger.debug(
        `SERVER received uploadimage: ${JSON.stringify(files.image)}`
      )

      const uploadProvider = require('./' + config.imageUploadType)
      logger.debug(
        `imageRouter: Uploading ${files.image.filepath} using ${config.imageUploadType}`
      )
      uploadProvider.uploadImage(files.image.filepath, function (err, url) {
        rimraf.sync(tmpDir)
        if (err !== null) {
          logger.error(err)
          return res.status(500).end('upload image error')
        }
        logger.debug(`SERVER sending ${url} to client`)
        res.send({
          link: url
        })
      })
    }
  })
})

// ========== DrawIO 集成 API ==========

// DrawIO 文件存储目录
const drawioDir = path.join(config.uploadsPath, 'drawio')

// 确保 DrawIO 目录存在
function ensureDrawioDir() {
  if (!fs.existsSync(drawioDir)) {
    fs.mkdirSync(drawioDir, { recursive: true })
    logger.info(`创建 DrawIO 存储目录: ${drawioDir}`)
  }
}

// 上传 DrawIO 图形（包含 XML 数据和 PNG 图片）
imageRouter.post('/uploaddrawio', function (req, res) {
  if (
    !req.isAuthenticated() &&
    !config.allowAnonymous &&
    !config.allowAnonymousEdits
  ) {
    logger.error('DrawIO upload error: Anonymous edits are not allowed')
    return errors.errorForbidden(res)
  }

  ensureDrawioDir()

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hedgedoc-drawio-'))
  const form = formidable({
    keepExtensions: true,
    uploadDir: tmpDir,
    maxFileSize: 10 * 1024 * 1024 // 10MB 限制
  })

  form.parse(req, async function (err, fields, files) {
    if (err) {
      logger.error(`DrawIO upload error: formidable error: ${err}`)
      rimraf.sync(tmpDir)
      return errors.errorForbidden(res)
    }

    try {
      // 获取 XML 数据（可以是字段或文件）
      let xmlData = fields.xml
      if (Array.isArray(xmlData)) {
        xmlData = xmlData[0]
      }

      // 获取图片数据（Base64 格式）
      // 兼容旧的 png 字段和新的 image 字段
      let imageData = fields.image || fields.png
      if (Array.isArray(imageData)) {
        imageData = imageData[0]
      }

      // 获取导出格式（默认为 png，兼容旧版本）
      let format = fields.format
      if (Array.isArray(format)) {
        format = format[0]
      }
      format = format || 'png'

      // 获取可选的文件 ID（用于更新已有图形）
      let fileId = fields.fileId
      if (Array.isArray(fileId)) {
        fileId = fileId[0]
      }

      if (!xmlData || !imageData) {
        logger.error('DrawIO upload error: Missing xml or image data')
        rimraf.sync(tmpDir)
        return errors.errorBadRequest(res)
      }

      // 生成或使用已有的文件 ID
      if (!fileId) {
        fileId = 'drawio-' + uuidv4()
      }

      // 保存 XML 文件
      const xmlPath = path.join(drawioDir, fileId + '.xml')
      fs.writeFileSync(xmlPath, xmlData, 'utf8')
      logger.debug(`DrawIO XML saved: ${xmlPath}`)

      // 根据格式保存图片文件
      let base64Data, ext, mimeType
      if (format === 'svg') {
        // SVG 格式
        base64Data = imageData.replace(/^data:image\/svg\+xml;base64,/, '')
        ext = '.svg'
        mimeType = 'image/svg+xml'

        // 处理 SVG 内容：移除 light-dark() 自适应颜色，强制使用浅色值
        let svgContent = Buffer.from(base64Data, 'base64').toString('utf8')

        // 移除 color-scheme 属性
        svgContent = svgContent.replace(/color-scheme:[^;\"]+;?/g, '')

        // 替换 light-dark() 函数，使用第一个值（浅色）
        // 匹配 light-dark(light-value, dark-value) 并替换为 light-value
        svgContent = svgContent.replace(/light-dark\(([^,]+),\s*[^)]+\)/g, '$1')

        // 移除 background-color 中的 light-dark 残留
        svgContent = svgContent.replace(/background-color:\s*;/g, '')

        // 强制设置背景为白色
        svgContent = svgContent.replace(/background:\s*#ffffff;?/g, 'background: #ffffff;')

        const imageBuffer = Buffer.from(svgContent, 'utf8')
        const imagePath = path.join(config.uploadsPath, fileId + ext)
        fs.writeFileSync(imagePath, imageBuffer)
        logger.debug(`DrawIO SVG saved (light mode forced): ${imagePath}`)
      } else {
        // PNG 格式（默认）
        base64Data = imageData.replace(/^data:image\/png;base64,/, '')
        ext = '.png'
        mimeType = 'image/png'

        const imageBuffer = Buffer.from(base64Data, 'base64')
        const imagePath = path.join(config.uploadsPath, fileId + ext)
        fs.writeFileSync(imagePath, imageBuffer)
        logger.debug(`DrawIO PNG saved: ${imagePath}`)
      }

      rimraf.sync(tmpDir)

      // 构建返回的 URL
      const imageUrl = (new URL(fileId + ext, config.serverURL + '/uploads/')).href

      logger.info(`DrawIO 图形上传成功: ${fileId} (${format})`)
      res.send({
        fileId: fileId,
        imageUrl: imageUrl,
        // 兼容旧版本
        pngUrl: imageUrl
      })
    } catch (e) {
      logger.error(`DrawIO upload error: ${e.message}`)
      rimraf.sync(tmpDir)

      // 检测错误类型，返回友好的错误信息
      let errorType = 'unknown'
      let errorMessage = '保存失败，请重试'
      let errorHint = ''

      if (e.code === 'EACCES' || e.message.includes('permission denied')) {
        errorType = 'permission'
        errorMessage = '权限不足，无法写入文件'
        errorHint = '请检查 data/uploads 目录的写入权限。运行: chmod -R 777 data/uploads'
      } else if (e.code === 'ENOENT') {
        errorType = 'not_found'
        errorMessage = '目录不存在'
        errorHint = '请检查 data/uploads 目录是否存在'
      } else if (e.code === 'ENOSPC') {
        errorType = 'disk_full'
        errorMessage = '磁盘空间不足'
        errorHint = '请清理磁盘空间后重试'
      }

      return res.status(500).json({
        error: true,
        type: errorType,
        message: errorMessage,
        hint: errorHint,
        detail: e.message
      })
    }
  })
})

// 获取 DrawIO XML 数据（用于二次编辑）
imageRouter.get('/drawio/:fileId', function (req, res) {
  const fileId = req.params.fileId

  // 安全检查：防止路径穿越
  if (!fileId || fileId.includes('..') || fileId.includes('/')) {
    return errors.errorBadRequest(res)
  }

  ensureDrawioDir()

  const xmlPath = path.join(drawioDir, fileId + '.xml')

  if (!fs.existsSync(xmlPath)) {
    logger.error(`DrawIO file not found: ${xmlPath}`)
    return errors.errorNotFound(res)
  }

  try {
    const xmlData = fs.readFileSync(xmlPath, 'utf8')
    res.set('Content-Type', 'application/xml')
    res.send(xmlData)
  } catch (e) {
    logger.error(`DrawIO read error: ${e.message}`)
    return errors.errorInternalError(res)
  }
})

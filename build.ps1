<# 
.SYNOPSIS
    HedgeDoc + DrawIO 编译脚本 (Windows PowerShell)

.DESCRIPTION
    用于构建 DrawIO 和 HedgeDoc 的 Docker 镜像

.PARAMETER Target
    构建目标: drawio, hedgedoc, all (默认: all)

.PARAMETER Tag
    镜像标签 (默认: local)

.EXAMPLE
    .\build.ps1 -Target all
    .\build.ps1 -Target drawio -Tag v1.0.0
#>

param(
    [ValidateSet("hedgedoc")]
    [string]$Target = "hedgedoc",
    
    [string]$Tag = "local"
)

$ErrorActionPreference = "Stop"

# 获取脚本所在目录作为项目根目录
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "HedgeDoc 镜像构建脚本" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "项目目录: $ProjectRoot"
Write-Host "构建目标: $Target"
Write-Host "镜像标签: $Tag"
Write-Host ""

function Build-HedgeDoc {
    Write-Host ">>> 开始构建 HedgeDoc 镜像..." -ForegroundColor Yellow
    
    $imageName = "hedge_drawio/hedgedoc:$Tag"
    
    # 检查源码目录是否存在 (实际上Dockerfile会clone，但保留检查不影响)
    if (-not (Test-Path "$ProjectRoot\hedgedoc")) {
        Write-Host "警告: 本地 HedgeDoc 源码目录不存在 (Dockerfile 将直接克隆)" -ForegroundColor Yellow
    }
    
    # 构建镜像
    docker build -t $imageName -f "$ProjectRoot\docker\hedgedoc\Dockerfile" $ProjectRoot
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ">>> HedgeDoc 镜像构建成功: $imageName" -ForegroundColor Green
    }
    else {
        Write-Host ">>> HedgeDoc 镜像构建失败" -ForegroundColor Red
        exit 1
    }
}

# 执行构建
if ($Target -eq "hedgedoc") {
    Build-HedgeDoc
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "构建完成!" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "已构建的镜像:"
docker images | Select-String "hedge_drawio"

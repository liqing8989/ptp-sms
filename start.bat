@echo off
chcp 65001 >nul
title PTP SMS 1.0 短信营销管理后台
cd /d %~dp0

if not exist node_modules (
  echo [信息] 首次运行，正在安装依赖（npm install）...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
)

echo [信息] 正在启动 PTP SMS 1.0 后台 ...
echo [信息] 启动完成后浏览器将自动打开 http://localhost:3000/login
echo [信息] 默认管理员账号：admin / admin123
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/login"
call npm start
pause

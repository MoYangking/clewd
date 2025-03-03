@echo off
chcp 65001
echo 正在重启服务器...
timeout /t 1 >nul
cd /d "F:\\tool\\liaotian\\clewd"
cmd /c "node "F:\\tool\\liaotian\\clewd\\clewd.js" "
exit
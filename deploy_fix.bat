@echo off
echo [DEPLOY] Starting deployment sequence...

echo [DEPLOY] Adding changes...
git add .

echo [DEPLOY] Committing fix...
git commit -m "refactor: complete architecture overhaul (server.js split), security hardening (rate-limit, db-pool), and runtime validation"

echo [DEPLOY] Pushing to remote...
git push

echo [DEPLOY] Connecting to remote server to pull and restart...
ssh remote "cd /home/al-hemam/ultra_agent_os_starter && git pull && docker compose down && docker compose up -d --build"

echo [DEPLOY] Done!
pause

@echo off
echo [DEPLOY] Starting deployment sequence...

echo [DEPLOY] Adding changes...
git add .

echo [DEPLOY] Committing fix...
git commit -m "refactor: complete architecture overhaul (server.js split), security hardening (rate-limit, db-pool), and runtime validation"

echo [DEPLOY] Pushing to remote...
git push

echo [DEPLOY] Connecting to remote server to force update and restart...
ssh remote "cd /home/al-hemam/ultra_agent_os_starter && git fetch --all && git reset --hard origin/main && docker compose down && docker compose up -d --build"

echo [DEPLOY] Done!
pause

.PHONY: setup deploy logs status health

setup:
@echo "🚂 Setting up Railway project..."
railway login
railway init
@echo "✅ Done! Run 'make deploy' to deploy"

deploy:
git add .
git commit -m "Deploy to Railway - $(shell date)"
railway up
@echo "✅ Deploy complete!"

logs:
railway logs -f

status:
railway status

health:
@echo "🔍 Checking service health..."
railway status --json | jq '.data.project.services.edges[].node'

reset:
@echo "🔄 Resetting Railway project..."
railway down
make setup

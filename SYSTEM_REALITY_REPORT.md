# System Reality Report

## Services
- API service: [package.json](file:///home/al-hemam/ultra_agent_os_starter/apps/api/package.json)
- Worker service: [package.json](file:///home/al-hemam/ultra_agent_os_starter/apps/worker/package.json)
- UI single-entry: [index.html](file:///home/al-hemam/ultra_agent_os_starter/apps/ui/src/index.html)

## Dashboard Entry Points
- Single entry verified: index.html is served by [server.js](file:///home/al-hemam/ultra_agent_os_starter/apps/ui/src/server.js)

## Endpoints
- Metrics: [metrics.routes.js](file:///home/al-hemam/ultra_agent_os_starter/apps/api/src/routes/metrics.routes.js)
- Jobs: [jobs.controller.js](file:///home/al-hemam/ultra_agent_os_starter/apps/api/src/controllers/jobs.controller.js)
- Adapters: [adapter.controller.js](file:///home-al-hemam/ultra_agent_os_starter/apps/api/src/controllers/adapter.controller.js)

## Worker Connectivity
- Redis usage: tenant-scoped queues in [worker.js](file:///home-al-hemam/ultra_agent_os_starter/apps/worker/src/worker.js#L671-L679)
- Database connectivity required by worker bootstrap

## Summary
Environment validated. Real API wiring present. Worker queue bindings implemented. No duplicate dashboards.  
Freeze not executed in this phase.

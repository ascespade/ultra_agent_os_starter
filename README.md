# Ultra Agent OS

A production-ready, secure Agent OS system with authentication, job processing, and real-time WebSocket communication.

## Quick Start

```bash
# Install dependencies
npm install

# Start API server
cd api && npm start

# Start UI server  
cd ui && npm start

# Start worker process
cd api && node worker.js
```

## Environment Variables

```bash
PORT=3005                    # API server port
WS_PORT=3010                 # WebSocket port
REDIS_URL=redis://localhost:6379
DATA_DIR=./data              # Local data directory
OLLAMA_URL=http://localhost:11434
JWT_SECRET=your-secret-key   # Change in production
```

## Default Credentials

- Username: `admin`
- Password: `admin123`

**Important**: Change default credentials in production!

## Architecture

- **API**: Express.js server with JWT authentication
- **UI**: Static file server with WebSocket client
- **Worker**: Background job processing with Redis queue
- **Redis**: Job queue and data persistence
- **Ollama**: LLM integration (optional)

## Security Features

- JWT authentication with rate limiting
- Input validation and XSS protection
- Security headers via Helmet
- Container isolation (no Docker socket access)
- Zero vulnerabilities (npm audit passed)

## Development

```bash
# Fresh install (zero errors/warnings)
rm -rf node_modules package-lock.json
npm install
npm audit  # Should show 0 vulnerabilities
```

## Production Deployment

1. Set environment variables
2. Change JWT_SECRET and default password
3. Use process manager (PM2/systemd)
4. Configure reverse proxy (nginx)
5. Enable HTTPS

## License

MIT

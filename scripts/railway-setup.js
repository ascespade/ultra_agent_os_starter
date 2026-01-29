#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

const config = {
  projectName: 'ultra-agent-os',
  services: [
    { name: 'ultra-agent-api', type: 'app', source: '.' },
    { name: 'ultra-agent-ui', type: 'app', source: '.' },
    { name: 'ultra-agent-worker', type: 'app', source: '.' },
    { name: 'ultra-agent-db', type: 'database', image: 'postgres:15' },
    { name: 'ultra-agent-redis', type: 'database', image: 'redis:7' },
  ],
  variables: {
    'ultra-agent-api': {
      PORT: '3000',
      NODE_ENV: 'production',
      DATABASE_URL: '${{ultra-agent-db.DATABASE_PRIVATE_URL}}',
      REDIS_URL: '${{ultra-agent-redis.REDIS_PRIVATE_URL}}',
      INTERNAL_API_KEY: '${{GENERATE}}',
      JWT_SECRET: '${{GENERATE}}',
    },
    'ultra-agent-ui': {
      PORT: '3000',
      NODE_ENV: 'production',
      VITE_API_URL: '/api',
      API_INTERNAL_URL: '${{ultra-agent-api.RAILWAY_PRIVATE_URL}}',
    },
    'ultra-agent-worker': {
      NODE_ENV: 'production',
      DATABASE_URL: '${{ultra-agent-db.DATABASE_PRIVATE_URL}}',
      INTERNAL_API_KEY: '${{ultra-agent-api.INTERNAL_API_KEY}}',
      JWT_SECRET: '${{ultra-agent-api.JWT_SECRET}}',
    },
    'ultra-agent-db': {
      POSTGRES_DB: 'ultra_agent_os',
      POSTGRES_USER: 'ultra_agent',
      POSTGRES_PASSWORD: '${{GENERATE}}',
    },
  },
};

function exec(command) {
  console.log(`$ ${command}`);
  return execSync(command, { stdio: 'inherit' });
}

function setup() {
  console.log('🚂 Setting up Railway project...\n');
  
  // 1. Initialize project
  exec(`railway init --name ${config.projectName}`);
  
  // 2. Create services
  config.services.forEach((service) => {
    if (service.type === 'database') {
      if (service.name.includes('postgres')) {
        exec(`railway add --database postgresql --name ${service.name}`);
      } else if (service.name.includes('redis')) {
        exec(`railway add --database redis --name ${service.name}`);
      }
    } else {
      exec(`railway service create ${service.name}`);
    }
  });
  
  // 3. Set variables
  Object.entries(config.variables).forEach(([service, vars]) => {
    Object.entries(vars).forEach(([key, value]) => {
      if (value === '${{GENERATE}}') {
        exec(`railway variables set ${key}=$(openssl rand -hex 32) --service ${service}`);
      } else {
        exec(`railway variables set ${key}="${value}" --service ${service}`);
      }
    });
  });
  
  // 4. Deploy
  exec('railway up');
  
  console.log('\n✅ Setup complete!');
  console.log('Run: railway open');
}

if (require.main === module) {
  setup();
}

module.exports = { config, setup };

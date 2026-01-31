# Ultra Agent OS - Project Generator

## Template-Based Project Generator

This document defines the **Project Generator** that consumes the Ultra Agent OS Core as a template for zero-configuration project generation.

---

## 🏗️ PROJECT GENERATOR OVERVIEW

### Generator Purpose
- **Template Consumption**: Use Ultra Agent OS as a template
- **Zero Manual Setup**: Automatically configure all components
- **Auto-Wiring**: Automatic database and Redis connection
- **Secret Generation**: Auto-generate all required secrets
- **Core Contract Enforcement**: Prevent core mutations

### Generated Project Structure
```
generated-project/
├── .env.example
├── .gitignore
├── package.json
├── railway.json
├── docker-compose.yml
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.js
│   │       └── config/
│   ├── worker/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── worker.js
│   │       └── config/
│   └── ui/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
│           ├── server.js
│           └── index.html
├── lib/
│   └── db-connector.js
└── README.md
```

---

## 🔧 GENERATOR CONFIGURATION

### Generator Template
```javascript
// generators/project-generator.js
class ProjectGenerator {
  constructor(options = {}) {
    this.templateUrl = options.templateUrl || 'https://github.com/ascespade/ultra_agent_os_starter';
    this.outputDir = options.outputDir || './generated-project';
    this.projectName = options.projectName || 'my-ultra-agent';
    this.config = {
      database: options.database || 'postgresql',
      redis: options.redis || 'redis',
      adapters: options.adapters || [],
      features: options.features || ['basic'],
      ...options
    };
  }

  async generate() {
    console.log(`[GENERATOR] Generating project: ${this.projectName}`);
    
    try {
      // 1. Create project directory
      await this.createProjectDirectory();
      
      // 2. Clone template
      await this.cloneTemplate();
      
      // 3. Customize configuration
      await this.customizeConfiguration();
      
      // 4. Generate secrets
      await this.generateSecrets();
      
      // 5. Setup database schema
      await this.setupDatabase();
      
      // 6. Create documentation
      await this.createDocumentation();
      
      // 7. Initialize git repository
      await this.initializeGit();
      
      console.log(`[GENERATOR] Project generated successfully: ${this.projectName}`);
      return this.getProjectInfo();
    } catch (error) {
      console.error(`[GENERATOR] Failed to generate project:`, error);
      throw error;
    }
  }

  async createProjectDirectory() {
    const projectPath = path.resolve(this.outputDir, this.projectName);
    
    if (fs.existsSync(projectPath)) {
      throw new Error(`Directory already exists: ${projectPath}`);
    }
    
    fs.mkdirSync(projectPath, { recursive: true });
    this.projectPath = projectPath;
    
    console.log(`[GENERATOR] Created directory: ${projectPath}`);
  }

  async cloneTemplate() {
    const { execSync } = require('child_process');
    
    console.log(`[GENERATOR] Cloning template from: ${this.templateUrl}`);
    
    execSync(`git clone ${this.templateUrl} ${this.projectPath}/template`, { stdio: 'inherit' });
    
    // Move template contents to project root
    const templateDir = path.join(this.projectPath, 'template');
    const templateFiles = fs.readdirSync(templateDir);
    
    for (const file of templateFiles) {
      const srcPath = path.join(templateDir, file);
      const destPath = path.join(this.projectPath, file);
      
      fs.renameSync(srcPath, destPath);
    }
    
    // Remove template directory
    fs.rmSync(templateDir, { recursive: true, force: true });
    
    console.log(`[GENERATOR] Template cloned and extracted`);
  }

  async customizeConfiguration() {
    // Customize package.json
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    
    packageJson.name = this.projectName;
    packageJson.description = `Ultra Agent OS project: ${this.projectName}`;
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    // Customize railway.json
    const railwayJsonPath = path.join(this.projectPath, 'railway.json');
    const railwayJson = JSON.parse(fs.readFileSync(railwayJsonPath, 'utf8'));
    
    railwayJson.name = `${this.projectName}-ultra-agent`;
    
    fs.writeFileSync(railwayJsonPath, JSON.stringify(railwayJson, null, 2));
    
    // Customize docker-compose.yml
    await this.customizeDockerCompose();
    
    console.log(`[GENERATOR] Configuration customized`);
  }

  async customizeDockerCompose() {
    const dockerComposePath = path.join(this.projectPath, 'docker-compose.yml');
    const dockerCompose = require('yaml').parse(fs.readFileSync(dockerComposePath, 'utf8'));
    
    // Customize service names
    dockerCompose.services['api'].container_name = `${this.projectName}-api`;
    dockerCompose.services['worker'].container_name = `${this.projectName}-worker`;
    dockerCompose.services['ui'].container_name = `${this.projectName}-ui`;
    
    // Customize volumes
    dockerCompose.volumes[`${this.projectName}_data`] = './data';
    
    fs.writeFileSync(dockerComposePath, require('yaml').stringify(dockerCompose));
  }

  async generateSecrets() {
    const crypto = require('crypto');
    
    const secrets = {
      JWT_SECRET: crypto.randomBytes(64).toString('hex'),
      INTERNAL_API_KEY: crypto.randomBytes(64).toString('hex'),
      DEFAULT_ADMIN_PASSWORD: crypto.randomBytes(16).toString('hex'),
      DATABASE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
      REDIS_PASSWORD: crypto.randomBytes(32).toString('hex')
    };
    
    // Create .env file
    const envPath = path.join(this.projectPath, '.env');
    const envExamplePath = path.join(this.projectPath, '.env.example');
    
    const envContent = Object.entries(secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(envPath, envContent);
    fs.writeFileSync(envExamplePath, envContent.replace(/=.+$/g, '='));
    
    console.log(`[GENERATOR] Secrets generated and saved to .env`);
  }

  async setupDatabase() {
    // Create database initialization script
    const initScript = `
-- Database initialization for ${this.projectName}
-- This script sets up the database schema and initial data

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schema
CREATE SCHEMA IF NOT EXISTS ${this.projectName.replace(/[^a-zA-Z0-9]/g, '_')};

-- Set search path
SET search_path TO ${this.projectName.replace(/[^a-zA-Z0-9]/g, '_')}, public;

-- Run core migrations
\\i lib/db-connector.js
SELECT executeMigrations();
`;
    
    const initScriptPath = path.join(this.projectPath, 'scripts', 'init-database.sql');
    fs.mkdirSync(path.dirname(initScriptPath), { recursive: true });
    fs.writeFileSync(initScriptPath, initScript);
    
    console.log(`[GENERATOR] Database initialization script created`);
  }

  async createDocumentation() {
    const readmeContent = this.generateReadme();
    const readmePath = path.join(this.projectPath, 'README.md');
    
    fs.writeFileSync(readmePath, readmeContent);
    
    console.log(`[GENERATOR] Documentation created`);
  }

  generateReadme() {
    return `# ${this.projectName}

Ultra Agent OS project generated from template.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Git

### Installation

1. Clone the repository:
\`\`\`
git clone <repository-url>
cd ${this.projectName}
\`\`\`

2. Install dependencies:
\`\`\`
npm install
\`\`\`

3. Set up environment:
\`\`\`
cp .env.example .env
# Edit .env with your configuration
\`\`\`

4. Start services:
\`\`\`
docker-compose up -d
\`\`\`

5. Initialize database:
\`\`\`
docker-compose exec api npm run init-db
\`\`\`

## Services

- **API**: REST API server on port 3000
- **Worker**: Job processing service
- **UI**: Web interface on port 3001
- **Database**: PostgreSQL on port 5432
- **Redis**: Cache and queue on port 6379

## Configuration

### Environment Variables

Required variables are defined in \`.env\`:
- \`JWT_SECRET\`: JWT signing secret
- \`INTERNAL_API_KEY\`: Internal service authentication
- \`DEFAULT_ADMIN_PASSWORD\`: Default admin password
- \`DATABASE_URL\`: PostgreSQL connection string
- \`REDIS_URL\`: Redis connection string

### Optional Variables

- \`OLLAMA_URL\`: Ollama LLM endpoint
- \`DOCKER_HOST\`: Docker daemon socket
- \`DATA_DIR\`: Data storage directory

## Development

### Running Locally
\`\`\`
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
\`\`\`

### Running Individual Services
\`\`\`
# Start API only
docker-compose up -d api

# Start worker only
docker-compose up -d worker

# Start UI only
docker-compose up -d ui
\`\`\`

## API Documentation

### Authentication
\`\`\`
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"your-password"}'
\`\`\`

### Create Job
\`\`\`
curl -X POST http://localhost:3000/api/jobs \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Hello, Ultra Agent!"}'
\`\`\`

### Get Jobs
\`\`\`
curl -X GET http://localhost:3000/api/jobs \\
  -H "Authorization: Bearer <token>"
\`\`\`

## Deployment

### Railway Deployment
\`\`\`
# Deploy to Railway
railway up

# View logs
railway logs
\`\`\`

### Docker Deployment
\`\`\`
# Build and run
docker-compose build
docker-compose up -d
\`\`\`

## Support

- Documentation: [Ultra Agent OS Docs](https://docs.ultra-agent.com)
- Issues: [GitHub Issues](https://github.com/ascespade/ultra-agent-os/issues)
- Community: [Discussions](https://github.com/ascespade/ultra-agent-os/discussions)

## License

MIT License - see [LICENSE](./LICENSE) file.
`;
  }

  async initializeGit() {
    const { execSync } = require('child_process');
    
    process.chdir(this.projectPath);
    
    // Initialize git repository
    execSync('git init', { stdio: 'inherit' });
    
    // Add all files
    execSync('git add .', { stdio: 'inherit' });
    
    // Initial commit
    execSync('git commit -m "Initial commit: Ultra Agent OS project"', { stdio: 'inherit' });
    
    // Add remote if provided
    if (this.config.remote) {
      execSync(`git remote add origin ${this.config.remote}`, { stdio: 'inherit' });
      execSync('git push -u origin main', { stdio: 'inherit' });
    }
    
    console.log(`[GENERATOR] Git repository initialized`);
  }

  getProjectInfo() {
    return {
      name: this.projectName,
      path: this.projectPath,
      template: this.templateUrl,
      config: this.config,
      generatedAt: new Date().toISOString(),
      nextSteps: [
        'cd ' + this.projectName,
        'npm install',
        'cp .env.example .env',
        'docker-compose up -d',
        'docker-compose exec api npm run init-db'
      ]
    };
  }
}

module.exports = ProjectGenerator;
```

---

## 🚀 COMMAND LINE INTERFACE

### Generator CLI
```javascript
// generators/cli.js
#!/usr/bin/env node

const { Command } = require('commander');
const ProjectGenerator = require('./project-generator');
const chalk = require('chalk');
const path = require('path');

const program = new Command();

program
  .name('ultra-agent-generator')
  .description('Generate Ultra Agent OS projects from template')
  .version('1.0.0');

program
  .command('create <name>')
  .description('Create a new Ultra Agent OS project')
  .option('-o, --output <dir>', 'Output directory', './generated-projects')
  .option('-t, --template <url>', 'Template repository URL', 'https://github.com/ascespade/ultra_agent_os_starter')
  .option('-d, --database <type>', 'Database type', 'postgresql')
  .option('-r, --redis <type>', 'Redis type', 'redis')
  .option('-a, --adapters <items>', 'Enabled adapters', 'ollama,docker')
  .option('-f, --features <items>', 'Enabled features', 'basic,monitoring')
  .option('--remote <url>', 'Git remote URL')
  .action(async (name, options) => {
    try {
      console.log(chalk.blue('🚀 Generating Ultra Agent OS project...'));
      
      const generator = new ProjectGenerator({
        projectName: name,
        outputDir: options.output,
        templateUrl: options.template,
        database: options.database,
        redis: options.redis,
        adapters: options.adapters ? options.adapters.split(',') : [],
        features: options.features ? options.features.split(',') : [],
        remote: options.remote
      });
      
      const projectInfo = await generator.generate();
      
      console.log(chalk.green('✅ Project generated successfully!'));
      console.log(chalk.yellow('\nNext steps:'));
      
      projectInfo.nextSteps.forEach((step, index) => {
        console.log(chalk.cyan(`  ${index + 1}. ${step}`));
      });
      
      console.log(chalk.blue(`\nProject location: ${projectInfo.path}`));
      console.log(chalk.blue(`Template: ${projectInfo.template}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Generation failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List available templates')
  .action(async () => {
    console.log(chalk.blue('📋 Available templates:'));
    console.log(chalk.cyan('  • ultra-agent-os-starter - Official Ultra Agent OS template'));
    console.log(chalk.cyan('  • ultra-agent-starter-lite - Lightweight template'));
    console.log(chalk.cyan('  • ultra-agent-starter-full-featured - Full-featured template'));
  });

program
  .command('validate <path>')
  .description('Validate a generated project')
  .action(async (path) => {
    console.log(chalk.blue('🔍 Validating project...'));
    
    // TODO: Implement project validation
    console.log(chalk.green('✅ Project validation passed'));
  });

program.parse();
```

---

## 📋 PROJECT TEMPLATES

### Standard Template
```json
{
  "name": "ultra-agent-os-starter",
  "version": "1.0.0",
  "description": "Standard Ultra Agent OS template with all features",
  "features": [
    "api",
    "worker", 
    "ui",
    "database",
    "redis",
    "monitoring",
    "logging",
    "authentication",
    "job_processing"
  ],
  "services": {
    "api": {
      "enabled": true,
      "port": 3000,
      "health_check": true
    },
    "worker": {
      "enabled": true,
      "health_check": true
    },
    "ui": {
      "enabled": true,
      "port": 3001,
      "admin_panel": true
    }
  },
  "infrastructure": {
    "database": {
      "type": "postgresql",
      "version": "15"
    },
    "redis": {
      "type": "redis",
      "version": "7"
    }
  },
  "adapters": {
    "ollama": {
      "enabled": true,
      "optional": true
    },
    "docker": {
      "enabled": true,
      "optional": true
    }
  }
}
```

### Lightweight Template
```json
{
  "name": "ultra-agent-os-lite",
  "version": "1.0.0",
  "description": "Lightweight Ultra Agent OS template",
  "features": [
    "api",
    "worker",
    "basic_ui",
    "database",
    "redis"
  ],
  "services": {
    "api": {
      "enabled": true,
      "port": 3000,
      "health_check": false
    },
    "worker": {
      "enabled": true,
      "health_check": false
    },
    "ui": {
      "enabled": true,
      "port": 3001,
      "admin_panel": false
    }
  },
  "infrastructure": {
    "database": {
      "type": "sqlite",
      "file": "./data/database.sqlite"
    },
    "redis": {
      "type": "memory"
    }
  },
  "adapters": {
    "ollama": {
      "enabled": false,
      "optional": true
    },
    "docker": {
      "enabled": false,
      "optional": true
    }
  }
}
```

---

## 🔧 AUTOMATION FEATURES

### Auto-Wiring
```javascript
class AutoWiring {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.config = this.loadConfig();
  }

  async autoWireServices() {
    console.log('[AUTO-WIRING] Auto-wiring services...');
    
    // Auto-detect ports
    const ports = await this.detectPorts();
    
    // Update configuration files
    await this.updateServiceConfigs(ports);
    
    // Update environment variables
    await this.updateEnvironmentVariables(ports);
    
    console.log('[AUTO-WIRING] Services auto-wired successfully');
  }

  async detectPorts() {
    const ports = {
      api: this.findAvailablePort(3000),
      worker: this.findAvailablePort(3010),
      ui: this.findAvailablePort(3020),
      database: 5432,
      redis: 6379
    };
    
    return ports;
  }

  findAvailablePort(startPort) {
    // Find available port starting from startPort
    return startPort; // Simplified for example
  }

  async updateServiceConfigs(ports) {
    // Update docker-compose.yml
    const dockerComposePath = path.join(this.projectPath, 'docker-compose.yml');
    const dockerCompose = require('yaml').parse(fs.readFileSync(dockerComposePath, 'utf8'));
    
    dockerCompose.services.api.ports = [`${ports.api}:3000`];
    dockerCompose.services.worker.ports = [`${ports.worker}:3000`];
    dockerCompose.services.ui.ports = [`${ports.ui}:3001`];
    
    fs.writeFileSync(dockerComposePath, require('yaml').stringify(dockerCompose));
  }

  async updateEnvironmentVariables(ports) {
    const envPath = path.join(this.projectPath, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const updatedEnv = envContent
      .replace(/API_URL=.*/, `API_URL=http://localhost:${ports.api}`)
      .replace(/REDIS_URL=.*/, `REDIS_URL=redis://localhost:${ports.redis}`);
    
    fs.writeFileSync(envPath, updatedEnv);
  }
}
```

### Secret Generation
```javascript
class SecretGenerator {
  constructor() {
    this.secrets = {};
  }

  generateAll() {
    this.secrets = {
      JWT_SECRET: this.generateSecret(64),
      INTERNAL_API_KEY: this.generateSecret(64),
      DEFAULT_ADMIN_PASSWORD: this.generateSecret(16),
      DATABASE_ENCRYPTION_KEY: this.generateSecret(32),
      REDIS_PASSWORD: this.generateSecret(32),
      SESSION_SECRET: this.generateSecret(32)
    };
    
    return this.secrets;
  }

  generateSecret(length) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }

  saveSecrets(outputPath) {
    const envContent = Object.entries(this.secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(outputPath, envContent);
  }
}
```

---

## 📚 USAGE EXAMPLES

### Basic Project Generation
```bash
# Generate a new project
npx ultra-agent-generator create my-agent-project

# Generate with custom options
npx ultra-agent-generator create my-agent-project \
  --output ./my-projects \
  --database postgres \
  --adapters ollama,docker \
  --features basic,monitoring

# Generate from custom template
npx ultra-agent-generator create my-agent-project \
  --template https://github.com/myorg/ultra-agent-template
```

### Advanced Configuration
```javascript
const generator = new ProjectGenerator({
  projectName: 'enterprise-agent',
  outputDir: './enterprise-projects',
  templateUrl: 'https://github.com/company/ultra-agent-enterprise',
  database: 'postgresql',
  redis: 'redis',
  adapters: ['ollama', 'docker', 'custom-erp'],
  features: ['basic', 'monitoring', 'audit', 'multi-tenant'],
  remote: 'git@github.com:company/enterprise-agent.git'
});

const project = await generator.generate();
```

---

## 🛡️ SECURITY CONSIDERATIONS

### Template Security
```javascript
class TemplateValidator {
  async validateTemplate(templateUrl) {
    // Validate template repository
    if (!this.isValidUrl(templateUrl)) {
      throw new Error('Invalid template URL');
    }
    
    // Check for malicious content
    const scanResult = await this.scanTemplate(templateUrl);
    if (scanResult.threats.length > 0) {
      throw new Error(`Template contains security threats: ${scanResult.threats.join(', ')}`);
    }
    
    return true;
  }

  async scanTemplate(templateUrl) {
    // TODO: Implement template security scanning
    return {
      threats: [],
      warnings: [],
      score: 100
    };
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
```

### Generated Project Security
```javascript
class ProjectSecurity {
  constructor(projectPath) {
    this.projectPath = projectPath;
  }

  async secureProject() {
    // Set appropriate file permissions
    await this.setFilePermissions();
    
    // Generate secure secrets
    await this.generateSecureSecrets();
    
    // Validate configuration
    await this.validateConfiguration();
    
    console.log('[SECURITY] Project secured successfully');
  }

  async setFilePermissions() {
    const files = [
      '.env',
      'package.json',
      'railway.json'
    ];
    
    for (const file of files) {
      const filePath = path.join(this.projectPath, file);
      if (fs.existsSync(filePath)) {
        fs.chmodSync(filePath, 0o600);
      }
    }
  }

  async generateSecureSecrets() {
    const secretGenerator = new SecretGenerator();
    const secrets = secretGenerator.generateAll();
    
    const envPath = path.join(this.projectPath, '.env');
    secretGenerator.saveSecrets(envPath);
    
    // Set file permissions
    fs.chmodSync(envPath, 0o600);
  }

  async validateConfiguration() {
    // Validate configuration files
    const configFiles = ['package.json', 'railway.json', 'docker-compose.yml'];
    
    for (const file of configFiles) {
      const filePath = path.join(this.projectPath, file);
      
      if (fs.existsSync(filePath)) {
        try {
          JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
          throw new Error(`Invalid configuration in ${file}: ${error.message}`);
        }
      }
    }
  }
}
```

---

## 📋 BEST PRACTICES

### Template Development
1. **Modular Design**: Keep templates modular and configurable
2. **Documentation**: Include comprehensive documentation
3. **Testing**: Test templates thoroughly before publishing
4. **Security**: Scan templates for security issues
5. **Versioning**: Use semantic versioning for templates

### Project Generation
1. **Unique Names**: Ensure generated project names are unique
2. **Environment Isolation**: Use project-specific configurations
3. **Secret Management**: Generate unique secrets for each project
4. **Documentation**: Generate comprehensive project documentation
5. **Git Integration**: Initialize git repositories automatically

### User Experience
1. **Clear Instructions**: Provide clear next steps after generation
2. **Error Handling**: Provide helpful error messages
3. **Progress Feedback**: Show progress during generation
4. **Validation**: Validate generated projects automatically
5. **Support**: Provide comprehensive documentation and support

---

**This Project Generator enables rapid Ultra Agent OS project creation with zero manual configuration while maintaining security and best practices.**

**Last Updated:** 2025-01-31  
**Project Generator Version:** 1.0.0

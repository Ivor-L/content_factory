# 构建流程优化指南

## 1. 消除运行时修补的完整方案

### 1.1 问题分析
运行时"sed"修补通常存在以下问题：
- 性能开销：每次启动都需要执行文本替换
- 可靠性差：容易因文件权限或格式问题失败
- 难以调试：运行时修改难以追踪和回滚
- 环境不一致：不同环境可能需要不同的修补逻辑

### 1.2 预编译替换方案

#### 方案一：环境变量注入（推荐）
```javascript
// config/index.js
const config = {
  development: {
    apiUrl: process.env.API_URL || 'http://localhost:3000/api',
    dbHost: process.env.DB_HOST || 'localhost',
    dbPort: process.env.DB_PORT || 5432,
    // 其他配置...
  },
  production: {
    apiUrl: process.env.API_URL,
    dbHost: process.env.DB_HOST,
    dbPort: process.env.DB_PORT || 5432,
    // 其他配置...
  }
};

module.exports = config[process.env.NODE_ENV || 'development'];
```

#### 方案二：配置文件模板
```javascript
// scripts/prebuild.js
const fs = require('fs');
const path = require('path');

function generateConfig() {
  const env = process.env.NODE_ENV || 'development';
  const templatePath = path.join(__dirname, `../config/template.json`);
  const outputPath = path.join(__dirname, `../src/config.json`);
  
  // 读取模板
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  
  // 替换占位符
  let config = JSON.stringify(template, null, 2);
  config = config.replace(/\$\{API_URL\}/g, process.env.API_URL);
  config = config.replace(/\$\{DB_HOST\}/g, process.env.DB_HOST);
  config = config.replace(/\$\{DB_PORT\}/g, process.env.DB_PORT);
  
  // 写入配置文件
  fs.writeFileSync(outputPath, config);
  console.log(`✅ 配置文件已生成: ${outputPath}`);
}

generateConfig();
```

#### 方案三：Webpack插件方式
```javascript
// webpack.config.js
const webpack = require('webpack');

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(process.env.API_URL),
      'process.env.DB_HOST': JSON.stringify(process.env.DB_HOST),
      'process.env.VERSION': JSON.stringify(require('./package.json').version),
    }),
  ],
};
```

### 1.3 配置管理最佳实践

#### 配置分层结构
```
config/
├── default.json          # 默认配置
├── development.json      # 开发环境配置
├── staging.json         # 测试环境配置
├── production.json      # 生产环境配置
├── local.json           # 本地覆盖配置（gitignored）
└── custom.json          # 自定义配置模板
```

#### 配置加载器
```javascript
// config/loader.js
const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = this.loadConfig();
  }

  loadConfig() {
    const defaultConfig = this.loadFile('default.json');
    const envConfig = this.loadFile(`${this.env}.json`);
    const localConfig = this.loadFile('local.json', true);
    
    // 合并配置
    return this.deepMerge(defaultConfig, envConfig, localConfig);
  }

  loadFile(filename, optional = false) {
    const filepath = path.join(__dirname, filename);
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
      if (optional) {
        return {};
      }
      throw new Error(`配置文件加载失败: ${filename}`);
    }
  }

  deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
    
    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
    
    return this.deepMerge(target, ...sources);
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

module.exports = new ConfigLoader().config;
```

## 2. 构建脚本优化

### 2.1 完整的构建流程
```javascript
// scripts/build.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class BuildManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'production';
    this.startTime = Date.now();
  }

  async build() {
    try {
      console.log(`🚀 开始构建 [环境: ${this.env}]`);
      
      await this.validateEnvironment();
      await this.cleanBuildDirectory();
      await this.generateConfig();
      await this.runPrebuildTasks();
      await this.buildApplication();
      await this.runPostbuildTasks();
      await this.validateBuild();
      
      const duration = (Date.now() - this.startTime) / 1000;
      console.log(`✅ 构建完成 [耗时: ${duration}s]`);
      
    } catch (error) {
      console.error(`❌ 构建失败: ${error.message}`);
      process.exit(1);
    }
  }

  async validateEnvironment() {
    console.log('🔍 验证环境...');
    
    // 检查必需的环境变量
    const requiredEnvVars = ['API_URL', 'DB_HOST'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`缺少必需的环境变量: ${missingVars.join(', ')}`);
    }
    
    // 检查Node.js版本
    const nodeVersion = process.version;
    const requiredVersion = '18.0.0';
    if (!this.checkVersion(nodeVersion, requiredVersion)) {
      throw new Error(`Node.js版本过低，需要 ${requiredVersion} 或更高`);
    }
  }

  async cleanBuildDirectory() {
    console.log('🧹 清理构建目录...');
    const buildDir = path.join(__dirname, '../dist');
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  }

  async generateConfig() {
    console.log('⚙️ 生成配置文件...');
    
    const configContent = {
      apiUrl: process.env.API_URL,
      dbHost: process.env.DB_HOST,
      dbPort: process.env.DB_PORT || 5432,
      version: require('../package.json').version,
      buildTime: new Date().toISOString(),
      environment: this.env,
    };
    
    const configPath = path.join(__dirname, '../src/config.json');
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));
  }

  async runPrebuildTasks() {
    console.log('🔧 执行预构建任务...');
    
    // 运行测试
    if (this.env === 'production') {
      execSync('npm test', { stdio: 'inherit' });
    }
    
    // 代码检查
    execSync('npm run lint', { stdio: 'inherit' });
    
    // 类型检查（如果使用TypeScript）
    if (fs.existsSync('tsconfig.json')) {
      execSync('npm run type-check', { stdio: 'inherit' });
    }
  }

  async buildApplication() {
    console.log('🏗️ 构建应用...');
    
    // 根据项目类型选择构建命令
    const buildCommands = {
      'react': 'npm run build:react',
      'next': 'npm run build:next',
      'vue': 'npm run build:vue',
      'default': 'npm run build'
    };
    
    const buildCommand = buildCommands[this.detectProjectType()] || buildCommands.default;
    execSync(buildCommand, { stdio: 'inherit' });
  }

  async runPostbuildTasks() {
    console.log('📦 执行后构建任务...');
    
    // 生成构建信息
    const buildInfo = {
      version: require('../package.json').version,
      buildTime: new Date().toISOString(),
      environment: this.env,
      gitCommit: this.getGitCommit(),
      nodeVersion: process.version,
    };
    
    fs.writeFileSync(
      path.join(__dirname, '../dist/build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    // 压缩资源（可选）
    if (this.env === 'production') {
      await this.compressAssets();
    }
  }

  async validateBuild() {
    console.log('✅ 验证构建结果...');
    
    const distDir = path.join(__dirname, '../dist');
    
    // 检查构建目录是否存在
    if (!fs.existsSync(distDir)) {
      throw new Error('构建目录不存在');
    }
    
    // 检查关键文件
    const requiredFiles = ['index.html', 'build-info.json'];
    const missingFiles = requiredFiles.filter(file => 
      !fs.existsSync(path.join(distDir, file))
    );
    
    if (missingFiles.length > 0) {
      throw new Error(`缺少关键文件: ${missingFiles.join(', ')}`);
    }
    
    // 检查文件大小
    const maxSize = 10 * 1024 * 1024; // 10MB
    const files = fs.readdirSync(distDir, { recursive: true });
    
    for (const file of files) {
      const filePath = path.join(distDir, file);
      if (fs.statSync(filePath).isFile()) {
        const size = fs.statSync(filePath).size;
        if (size > maxSize) {
          console.warn(`⚠️ 文件过大: ${file} (${(size / 1024 / 1024).toFixed(2)}MB)`);
        }
      }
    }
  }

  detectProjectType() {
    const packageJson = require('../package.json');
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };
    
    if (dependencies.next) return 'next';
    if (dependencies['@vue/cli-service']) return 'vue';
    if (dependencies.react) return 'react';
    return 'default';
  }

  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  checkVersion(current, required) {
    const currentParts = current.replace('v', '').split('.');
    const requiredParts = required.split('.');
    
    for (let i = 0; i < 3; i++) {
      if (parseInt(currentParts[i]) < parseInt(requiredParts[i])) {
        return false;
      }
    }
    return true;
  }

  async compressAssets() {
    console.log('🗜️ 压缩资源文件...');
    
    const distDir = path.join(__dirname, '../dist');
    const files = fs.readdirSync(distDir, { recursive: true });
    
    for (const file of files) {
      const filePath = path.join(distDir, file);
      if (fs.statSync(filePath).isFile() && file.endsWith('.js')) {
        // 这里可以集成Terser或其他压缩工具
        console.log(`压缩: ${file}`);
      }
    }
  }
}

// 运行构建
if (require.main === module) {
  const builder = new BuildManager();
  builder.build();
}

module.exports = BuildManager;
```

### 2.2 构建缓存优化
```javascript
// webpack.config.js
const path = require('path');
const webpack = require('webpack');

module.exports = {
  cache: {
    type: 'filesystem',
    cacheDirectory: path.resolve(__dirname, '.webpack-cache'),
    buildDependencies: {
      config: [__filename],
      tsconfig: [path.resolve(__dirname, 'tsconfig.json')],
      package: [path.resolve(__dirname, 'package.json')],
    },
  },
  
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: -10,
        },
        common: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
};
```

## 3. 版本控制与CI/CD集成

### 3.1 Git工作流配置
```bash
# .gitignore 优化
# 依赖和构建输出
node_modules/
dist/
build/
.next/
*.log
*.pid
*.seed
*.pid.lock

# 环境配置
.env
.env.local
.env.*.local

# IDE和编辑器
.vscode/
.idea/
*.swp
*.swo
*~

# 操作系统
.DS_Store
Thumbs.db

# 临时文件
*.tmp
*.temp
.cache/
.webpack-cache/

# 测试覆盖
coverage/
.nyc_output/

# 数据库
*.db
*.sqlite

# 证书和密钥
*.pem
*.key
*.crt
secrets/
```

### 3.2 GitHub Actions工作流
```yaml
# .github/workflows/build-and-deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run linting
        run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
        env:
          NODE_ENV: production
          API_URL: ${{ secrets.API_URL }}
          DB_HOST: ${{ secrets.DB_HOST }}
      
      - name: Build Docker image
        run: |
          docker build -t myapp:${{ github.sha }} .
          docker tag myapp:${{ github.sha }} myapp:latest
      
      - name: Deploy to production
        run: |
          # 这里添加你的部署脚本
          ./scripts/deploy.sh production ${{ github.sha }}
```

## 4. 监控与日志

### 4.1 健康检查端点
```javascript
// healthcheck.js
const http = require('http');
const fs = require('fs');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 3000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ 健康检查通过');
    process.exit(0);
  } else {
    console.error(`❌ 健康检查失败: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (error) => {
  console.error(`❌ 健康检查错误: ${error.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ 健康检查超时');
  req.destroy();
  process.exit(1);
});

req.end();
```

### 4.2 构建监控
```javascript
// scripts/monitor-build.js
const fs = require('fs');
const path = require('path');

class BuildMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      errors: [],
      warnings: [],
      assets: [],
    };
  }

  logError(error, context) {
    this.metrics.errors.push({
      message: error.message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  logWarning(message, context) {
    this.metrics.warnings.push({
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  logAsset(asset) {
    this.metrics.assets.push({
      name: asset.name,
      size: asset.size,
      type: asset.type,
    });
  }

  generateReport() {
    const duration = Date.now() - this.metrics.startTime;
    const report = {
      ...this.metrics,
      duration,
      success: this.metrics.errors.length === 0,
      timestamp: new Date().toISOString(),
    };

    // 保存报告
    const reportPath = path.join(__dirname, '../dist/build-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // 打印摘要
    console.log('\n📊 构建报告:');
    console.log(`⏱️  耗时: ${duration}ms`);
    console.log(`❌ 错误: ${this.metrics.errors.length}`);
    console.log(`⚠️  警告: ${this.metrics.warnings.length}`);
    console.log(`📁 资源: ${this.metrics.assets.length}`);

    return report;
  }
}

module.exports = BuildMonitor;
```

这个完整的构建流程优化方案将帮助你：
1. 完全消除运行时"sed"修补
2. 实现标准化的构建流程
3. 提高构建速度和可靠性
4. 简化环境管理
5. 增强版本控制和CI/CD集成
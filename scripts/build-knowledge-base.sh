#!/bin/bash
# 知识库建设脚本
# 用于收集项目文档、代码和最佳实践，上传到 Dify 知识库

set -e

# 配置
DIFY_API_URL="${DIFY_API_URL:-http://localhost:9000}"
DIFY_API_KEY="${DIFY_API_KEY:-}"
WORKSPACE_ROOT="${1:-.}"
OUTPUT_DIR="${2:-./knowledge-base}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Dify 知识库建设工具 ===${NC}"
echo ""

# 检查 Dify API Key
if [ -z "$DIFY_API_KEY" ]; then
    echo -e "${RED}错误: 请设置 DIFY_API_KEY 环境变量${NC}"
    echo "用法: DIFY_API_KEY=app-xxx ./scripts/build-knowledge-base.sh [项目目录] [输出目录]"
    exit 1
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"/{project-docs,codebase,best-practices,faq}

echo -e "${YELLOW}1. 收集项目文档...${NC}"

# 收集 README
if [ -f "$WORKSPACE_ROOT/README.md" ]; then
    cp "$WORKSPACE_ROOT/README.md" "$OUTPUT_DIR/project-docs/"
    echo "  ✓ README.md"
fi

# 收集 docs 目录
if [ -d "$WORKSPACE_ROOT/docs" ]; then
    cp -r "$WORKSPACE_ROOT/docs/"* "$OUTPUT_DIR/project-docs/" 2>/dev/null || true
    echo "  ✓ docs/"
fi

# 收集 CHANGELOG
if [ -f "$WORKSPACE_ROOT/CHANGELOG.md" ]; then
    cp "$WORKSPACE_ROOT/CHANGELOG.md" "$OUTPUT_DIR/project-docs/"
    echo "  ✓ CHANGELOG.md"
fi

# 收集配置文件
for config in package.json tsconfig.json .eslintrc.json .prettierrc.json; do
    if [ -f "$WORKSPACE_ROOT/$config" ]; then
        cp "$WORKSPACE_ROOT/$config" "$OUTPUT_DIR/project-docs/"
        echo "  ✓ $config"
    fi
done

echo ""
echo -e "${YELLOW}2. 收集代码库...${NC}"

# 收集源代码
if [ -d "$WORKSPACE_ROOT/src" ]; then
    # 排除 node_modules 和 dist
    rsync -av --exclude='node_modules' --exclude='dist' --exclude='*.js.map' \
        "$WORKSPACE_ROOT/src/" "$OUTPUT_DIR/codebase/src/" 2>/dev/null || \
        cp -r "$WORKSPACE_ROOT/src" "$OUTPUT_DIR/codebase/"
    echo "  ✓ src/"
fi

# 收集测试代码
if [ -d "$WORKSPACE_ROOT/test" ]; then
    cp -r "$WORKSPACE_ROOT/test" "$OUTPUT_DIR/codebase/"
    echo "  ✓ test/"
fi

if [ -d "$WORKSPACE_ROOT/tests" ]; then
    cp -r "$WORKSPACE_ROOT/tests" "$OUTPUT_DIR/codebase/"
    echo "  ✓ tests/"
fi

# 收集示例代码
if [ -d "$WORKSPACE_ROOT/examples" ]; then
    cp -r "$WORKSPACE_ROOT/examples" "$OUTPUT_DIR/codebase/"
    echo "  ✓ examples/"
fi

echo ""
echo -e "${YELLOW}3. 生成最佳实践文档...${NC}"

# 生成编码规范文档
cat > "$OUTPUT_DIR/best-practices/coding-standards.md" << 'EOF'
# 编码规范

## 命名规范

### 变量命名
- 使用 camelCase 命名变量和函数
- 使用 PascalCase 命名类和接口
- 使用 UPPER_SNAKE_CASE 命名常量

### 文件命名
- 使用 kebab-case 命名文件
- 组件文件使用 PascalCase

## 代码风格

### 缩进
- 使用 2 个空格缩进
- 不要使用 Tab

### 分号
- 不使用分号（ASI）

### 引号
- 字符串使用单引号
- JSX 属性使用双引号

## 注释规范

### 函数注释
```typescript
/**
 * 函数描述
 * @param param1 参数1描述
 * @param param2 参数2描述
 * @returns 返回值描述
 */
function example(param1: string, param2: number): boolean {
  // 实现
}
```

### 复杂逻辑注释
```typescript
// 解释为什么这样做
// 而不是简单描述代码在做什么
```

## 错误处理

### 使用 try-catch
```typescript
try {
  // 可能出错的代码
} catch (error) {
  // 处理错误
  console.error('Error:', error);
}
```

### 使用 Result 类型
```typescript
type Result<T, E> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

## 测试规范

### 单元测试
- 每个函数都应该有对应的测试
- 测试覆盖率目标: 80%+

### 测试命名
```typescript
describe('functionName', () => {
  it('should do something when condition', () => {
    // 测试代码
  });
});
```
EOF
echo "  ✓ coding-standards.md"

# 生成设计模式文档
cat > "$OUTPUT_DIR/best-practices/design-patterns.md" << 'EOF'
# 设计模式

## 创建型模式

### 单例模式 (Singleton)
```typescript
class Singleton {
  private static instance: Singleton;
  
  private constructor() {}
  
  static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }
    return Singleton.instance;
  }
}
```

### 工厂模式 (Factory)
```typescript
interface Product {
  operation(): string;
}

class ConcreteProductA implements Product {
  operation(): string {
    return 'Product A';
  }
}

class Factory {
  create(type: string): Product {
    switch (type) {
      case 'A':
        return new ConcreteProductA();
      default:
        throw new Error('Unknown product type');
    }
  }
}
```

## 结构型模式

### 适配器模式 (Adapter)
```typescript
interface Target {
  request(): string;
}

class Adaptee {
  specificRequest(): string {
    return 'Specific request';
  }
}

class Adapter implements Target {
  private adaptee: Adaptee;
  
  constructor(adaptee: Adaptee) {
    this.adaptee = adaptee;
  }
  
  request(): string {
    return this.adaptee.specificRequest();
  }
}
```

### 装饰器模式 (Decorator)
```typescript
interface Component {
  operation(): string;
}

class ConcreteComponent implements Component {
  operation(): string {
    return 'ConcreteComponent';
  }
}

class Decorator implements Component {
  protected component: Component;
  
  constructor(component: Component) {
    this.component = component;
  }
  
  operation(): string {
    return this.component.operation();
  }
}

class ConcreteDecorator extends Decorator {
  operation(): string {
    return `ConcreteDecorator(${super.operation()})`;
  }
}
```

## 行为型模式

### 观察者模式 (Observer)
```typescript
interface Observer {
  update(subject: Subject): void;
}

class Subject {
  private observers: Observer[] = [];
  
  attach(observer: Observer): void {
    this.observers.push(observer);
  }
  
  detach(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }
  
  notify(): void {
    for (const observer of this.observers) {
      observer.update(this);
    }
  }
}
```

### 策略模式 (Strategy)
```typescript
interface Strategy {
  execute(data: string): string;
}

class ConcreteStrategyA implements Strategy {
  execute(data: string): string {
    return `Strategy A: ${data}`;
  }
}

class ConcreteStrategyB implements Strategy {
  execute(data: string): string {
    return `Strategy B: ${data}`;
  }
}

class Context {
  private strategy: Strategy;
  
  constructor(strategy: Strategy) {
    this.strategy = strategy;
  }
  
  setStrategy(strategy: Strategy): void {
    this.strategy = strategy;
  }
  
  executeStrategy(data: string): string {
    return this.strategy.execute(data);
  }
}
```
EOF
echo "  ✓ design-patterns.md"

# 生成安全规范文档
cat > "$OUTPUT_DIR/best-practices/security-guidelines.md" << 'EOF'
# 安全规范

## 输入验证

### 永远不要信任用户输入
```typescript
function validateInput(input: string): boolean {
  // 检查长度
  if (input.length > 1000) {
    return false;
  }
  
  // 检查特殊字符
  if (/[<>\"'&]/.test(input)) {
    return false;
  }
  
  return true;
}
```

### 使用参数化查询
```typescript
// 错误 - SQL 注入风险
const query = `SELECT * FROM users WHERE id = ${userId}`;

// 正确 - 使用参数化查询
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

## 认证与授权

### 密码安全
```typescript
import bcrypt from 'bcrypt';

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### JWT 安全
```typescript
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.JWT_SECRET;

function generateToken(payload: any): string {
  return jwt.sign(payload, SECRET_KEY, {
    expiresIn: '1h',
    algorithm: 'HS256'
  });
}

function verifyToken(token: string): any {
  return jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
}
```

## 数据保护

### 敏感数据加密
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.randomBytes(32);
const IV = crypto.randomBytes(16);

function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${IV.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

## API 安全

### 限流
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 个请求
  message: 'Too many requests'
});

app.use('/api/', limiter);
```

### CORS 配置
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
```

## 日志安全

### 不要记录敏感信息
```typescript
// 错误
logger.info('User login', { password: '123456' });

// 正确
logger.info('User login', { userId: user.id });
```
EOF
echo "  ✓ security-guidelines.md"

echo ""
echo -e "${YELLOW}4. 生成常见问题文档...${NC}"

cat > "$OUTPUT_DIR/faq/setup.md" << 'EOF'
# 常见问题 - 环境搭建

## Q: 如何安装项目依赖？

```bash
npm install
```

或者使用 yarn:
```bash
yarn install
```

## Q: 如何启动开发服务器？

```bash
npm run dev
```

## Q: 如何构建生产版本？

```bash
npm run build
```

## Q: 如何运行测试？

```bash
npm test
```

## Q: 如何配置环境变量？

1. 复制 `.env.example` 到 `.env`
2. 修改 `.env` 中的配置
3. 重启开发服务器

## Q: 如何解决依赖冲突？

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules

# 重新安装
npm install
```

## Q: 如何调试代码？

1. 在 VS Code 中打开项目
2. 按 F5 启动调试
3. 设置断点
4. 执行代码

## Q: 如何提交代码？

```bash
# 添加文件
git add .

# 提交
git commit -m "feat: 添加新功能"

# 推送
git push origin dev
```
EOF
echo "  ✓ setup.md"

cat > "$OUTPUT_DIR/faq/troubleshooting.md" << 'EOF'
# 常见问题 - 故障排除

## Q: 编译错误怎么办？

### TypeScript 错误
```bash
# 检查 TypeScript 版本
npx tsc --version

# 重新编译
npm run compile
```

### 依赖错误
```bash
# 检查依赖
npm ls

# 更新依赖
npm update
```

## Q: 运行时错误怎么办？

### 内存不足
```bash
# 增加内存限制
node --max-old-space-size=4096 your-script.js
```

### 端口被占用
```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 <PID>
```

## Q: Git 问题怎么办？

### 合并冲突
```bash
# 查看冲突文件
git status

# 解决冲突后
git add .
git commit -m "fix: 解决合并冲突"
```

### 误删文件
```bash
# 恢复文件
git checkout -- <file>
```

## Q: 部署问题怎么办？

### 构建失败
```bash
# 检查构建日志
npm run build 2>&1 | tee build.log

# 检查环境变量
echo $NODE_ENV
```

### 服务无法启动
```bash
# 检查日志
pm2 logs

# 重启服务
pm2 restart all
```

## Q: 性能问题怎么办？

### 响应慢
1. 检查数据库查询
2. 检查网络请求
3. 使用性能分析工具

### 内存泄漏
```bash
# 使用 Node.js 调试器
node --inspect your-script.js

# 在 Chrome 中打开 chrome://inspect
```
EOF
echo "  ✓ troubleshooting.md"

echo ""
echo -e "${YELLOW}5. 生成知识库索引...${NC}"

# 生成索引文件
cat > "$OUTPUT_DIR/INDEX.md" << EOF
# 知识库索引

生成时间: $(date)

## 项目文档
$(find "$OUTPUT_DIR/project-docs" -name "*.md" -o -name "*.json" | sort | while read f; do
  echo "- $(basename $f)"
done)

## 代码库
$(find "$OUTPUT_DIR/codebase" -type f | wc -l) 个文件

## 最佳实践
$(find "$OUTPUT_DIR/best-practices" -name "*.md" | sort | while read f; do
  echo "- $(basename $f)"
done)

## 常见问题
$(find "$OUTPUT_DIR/faq" -name "*.md" | sort | while read f; do
  echo "- $(basename $f)"
done)
EOF
echo "  ✓ INDEX.md"

echo ""
echo -e "${GREEN}=== 知识库建设完成 ===${NC}"
echo ""
echo "输出目录: $OUTPUT_DIR"
echo ""
echo "下一步:"
echo "1. 登录 Dify 控制台"
echo "2. 创建知识库"
echo "3. 上传 $OUTPUT_DIR 目录中的文件"
echo "4. 配置分段策略"
echo "5. 测试检索效果"
echo ""
echo "或者使用 Dify API 上传:"
echo "  ./scripts/upload-to-dify.sh $OUTPUT_DIR"

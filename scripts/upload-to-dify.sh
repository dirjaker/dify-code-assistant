#!/bin/bash
# 上传知识库到 Dify
# 用法: DIFY_API_KEY=app-xxx ./scripts/upload-to-dify.sh [知识库目录]

set -e

# 配置
DIFY_API_URL="${DIFY_API_URL:-http://localhost:9000}"
DIFY_API_KEY="${DIFY_API_KEY:-}"
KNOWLEDGE_DIR="${1:-./knowledge-base}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Dify 知识库上传工具 ===${NC}"
echo ""

# 检查 Dify API Key
if [ -z "$DIFY_API_KEY" ]; then
    echo -e "${RED}错误: 请设置 DIFY_API_KEY 环境变量${NC}"
    echo "用法: DIFY_API_KEY=app-xxx ./scripts/upload-to-dify.sh [知识库目录]"
    exit 1
fi

# 检查知识库目录
if [ ! -d "$KNOWLEDGE_DIR" ]; then
    echo -e "${RED}错误: 知识库目录不存在: $KNOWLEDGE_DIR${NC}"
    exit 1
fi

# 创建知识库
echo -e "${YELLOW}1. 创建知识库...${NC}"

create_dataset() {
    local name=$1
    local description=$2
    
    response=$(curl -s -X POST "$DIFY_API_URL/v1/datasets" \
        -H "Authorization: Bearer $DIFY_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"$name\",
            \"description\": \"$description\",
            \"permission\": \"all_team_members\"
        }")
    
    dataset_id=$(echo "$response" | jq -r '.id // empty')
    
    if [ -z "$dataset_id" ]; then
        echo -e "${RED}  ✗ 创建失败: $name${NC}"
        echo "  响应: $response"
        return 1
    fi
    
    echo -e "${GREEN}  ✓ $name (ID: $dataset_id)${NC}"
    echo "$dataset_id"
}

# 创建项目文档知识库
PROJECT_DOCS_ID=$(create_dataset "项目文档" "项目 README、API 文档、配置文件等")
echo "PROJECT_DOCS_ID=$PROJECT_DOCS_ID" >> /tmp/dify-datasets.env

# 创建代码库知识库
CODEBASE_ID=$(create_dataset "代码库" "项目源代码、测试代码、示例代码等")
echo "CODEBASE_ID=$CODEBASE_ID" >> /tmp/dify-datasets.env

# 创建最佳实践知识库
BEST_PRACTICES_ID=$(create_dataset "最佳实践" "编码规范、设计模式、安全规范等")
echo "BEST_PRACTICES_ID=$BEST_PRACTICES_ID" >> /tmp/dify-datasets.env

# 创建常见问题知识库
FAQ_ID=$(create_dataset "常见问题" "环境搭建、故障排除等常见问题")
echo "FAQ_ID=$FAQ_ID" >> /tmp/dify-datasets.env

echo ""
echo -e "${YELLOW}2. 上传文档...${NC}"

# 上传文档函数
upload_document() {
    local dataset_id=$1
    local file_path=$2
    local file_name=$(basename "$file_path")
    
    # 检查文件大小
    file_size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null)
    
    # 根据文件类型选择处理方式
    case "$file_name" in
        *.md|*.txt)
            # Markdown/文本文件
            response=$(curl -s -X POST "$DIFY_API_URL/v1/datasets/$dataset_id/documents" \
                -H "Authorization: Bearer $DIFY_API_KEY" \
                -F "file=@$file_path" \
                -F "data={
                    \"indexing_technique\": \"high_quality\",
                    \"process_rule\": {
                        \"mode\": \"automatic\"
                    }
                };type=text/plain")
            ;;
        *.json)
            # JSON 文件
            response=$(curl -s -X POST "$DIFY_API_URL/v1/datasets/$dataset_id/documents" \
                -H "Authorization: Bearer $DIFY_API_KEY" \
                -F "file=@$file_path" \
                -F "data={
                    \"indexing_technique\": \"high_quality\",
                    \"process_rule\": {
                        \"mode\": \"automatic\"
                    }
                };type=application/json")
            ;;
        *.py|*.js|*.ts|*.jsx|*.tsx|*.java|*.go|*.rs)
            # 代码文件
            response=$(curl -s -X POST "$DIFY_API_URL/v1/datasets/$dataset_id/documents" \
                -H "Authorization: Bearer $DIFY_API_KEY" \
                -F "file=@$file_path" \
                -F "data={
                    \"indexing_technique\": \"high_quality\",
                    \"process_rule\": {
                        \"mode\": \"custom\",
                        \"rules\": {
                            \"pre_processing_rules\": [
                                {\"id\": \"remove_extra_spaces\", \"enabled\": true},
                                {\"id\": \"remove_urls_emails\", \"enabled\": true}
                            ],
                            \"segmentation\": {
                                \"separator\": \"\\n\",
                                \"max_tokens\": 500
                            }
                        }
                    }
                };type=text/plain")
            ;;
        *)
            # 跳过其他文件
            return 0
            ;;
    esac
    
    document_id=$(echo "$response" | jq -r '.document.id // empty')
    
    if [ -z "$document_id" ]; then
        echo -e "${RED}    ✗ 上传失败: $file_name${NC}"
        return 1
    fi
    
    echo -e "${GREEN}    ✓ $file_name${NC}"
    return 0
}

# 上传项目文档
echo -e "${YELLOW}  上传项目文档...${NC}"
if [ -d "$KNOWLEDGE_DIR/project-docs" ]; then
    for file in "$KNOWLEDGE_DIR/project-docs"/*; do
        if [ -f "$file" ]; then
            upload_document "$PROJECT_DOCS_ID" "$file"
        fi
    done
fi

# 上传代码库
echo -e "${YELLOW}  上传代码库...${NC}"
if [ -d "$KNOWLEDGE_DIR/codebase" ]; then
    find "$KNOWLEDGE_DIR/codebase" -type f \( -name "*.py" -o -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.java" -o -name "*.go" -o -name "*.rs" \) | while read file; do
        upload_document "$CODEBASE_ID" "$file"
    done
fi

# 上传最佳实践
echo -e "${YELLOW}  上传最佳实践...${NC}"
if [ -d "$KNOWLEDGE_DIR/best-practices" ]; then
    for file in "$KNOWLEDGE_DIR/best-practices"/*; do
        if [ -f "$file" ]; then
            upload_document "$BEST_PRACTICES_ID" "$file"
        fi
    done
fi

# 上传常见问题
echo -e "${YELLOW}  上传常见问题...${NC}"
if [ -d "$KNOWLEDGE_DIR/faq" ]; then
    for file in "$KNOWLEDGE_DIR/faq"/*; do
        if [ -f "$file" ]; then
            upload_document "$FAQ_ID" "$file"
        fi
    done
fi

echo ""
echo -e "${GREEN}=== 上传完成 ===${NC}"
echo ""
echo "知识库 ID:"
echo "  项目文档: $PROJECT_DOCS_ID"
echo "  代码库: $CODEBASE_ID"
echo "  最佳实践: $BEST_PRACTICES_ID"
echo "  常见问题: $FAQ_ID"
echo ""
echo "请将以下环境变量添加到 .env 文件:"
echo ""
echo "PROJECT_DOCS_DATASET_ID=$PROJECT_DOCS_ID"
echo "CODEBASE_DATASET_ID=$CODEBASE_ID"
echo "BEST_PRACTICES_DATASET_ID=$BEST_PRACTICES_ID"
echo "FAQ_DATASET_ID=$FAQ_ID"
echo ""
echo "或者添加到 VS Code 设置:"
echo ""
echo "{"
echo "  \"dify.knowledge.datasets\": {"
echo "    \"project-docs\": \"$PROJECT_DOCS_ID\","
echo "    \"codebase\": \"$CODEBASE_ID\","
echo "    \"best-practices\": \"$BEST_PRACTICES_ID\","
echo "    \"faq\": \"$FAQ_ID\""
echo "  }"
echo "}"

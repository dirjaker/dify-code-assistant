#!/bin/bash
# Register local tools with Dify
# Usage: ./register-tools.sh <DIFY_API_URL> <DIFY_API_KEY>

DIFY_API_URL="${1:-http://localhost:9000}"
DIFY_API_KEY="${2:-}"

if [ -z "$DIFY_API_KEY" ]; then
    echo "Error: Dify API key is required"
    echo "Usage: $0 <DIFY_API_URL> <DIFY_API_KEY>"
    exit 1
fi

# Tool server port (will be started by VS Code extension)
# For now, we'll register with a placeholder URL that the extension will update
TOOL_SERVER_URL="http://127.0.0.1:PORT/tools"

echo "Registering tools with Dify..."
echo "API URL: $DIFY_API_URL"

# OpenAPI schema for the tools
SCHEMA='{
  "openapi": "3.0.0",
  "info": {
    "title": "VS Code Local Tools",
    "description": "Tools for interacting with VS Code workspace",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "'"$TOOL_SERVER_URL"'"
    }
  ],
  "paths": {
    "/execute": {
      "post": {
        "operationId": "read_file",
        "summary": "Read file content",
        "description": "Read the content of a file in the workspace",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "tool": {
                    "type": "string",
                    "enum": ["read_file"]
                  },
                  "parameters": {
                    "type": "object",
                    "properties": {
                      "path": {
                        "type": "string",
                        "description": "File path (relative to workspace or absolute)"
                      },
                      "start_line": {
                        "type": "integer",
                        "description": "Start line number (1-indexed, optional)"
                      },
                      "end_line": {
                        "type": "integer",
                        "description": "End line number (1-indexed, optional)"
                      }
                    },
                    "required": ["path"]
                  }
                },
                "required": ["tool", "parameters"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "File content",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}'

# Register the tool provider
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$DIFY_API_URL/v1/tools/providers" \
  -H "Authorization: Bearer $DIFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$SCHEMA")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    echo "✓ Tools registered successfully!"
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
else
    echo "✗ Failed to register tools (HTTP $HTTP_CODE)"
    echo "$BODY"
    exit 1
fi

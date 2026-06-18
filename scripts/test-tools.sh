#!/bin/bash
# Test the tool server
# Usage: ./test-tools.sh [PORT]

PORT="${1:-3000}"

echo "Testing tool server on port $PORT..."

# Health check
echo -e "\n1. Health check:"
curl -s "http://127.0.0.1:$PORT/health" | jq . 2>/dev/null || curl -s "http://127.0.0.1:$PORT/health"

# List tools
echo -e "\n2. Available tools:"
curl -s "http://127.0.0.1:$PORT/tools" | jq . 2>/dev/null || curl -s "http://127.0.0.1:$PORT/tools"

# Test read_file
echo -e "\n3. Test read_file (package.json):"
curl -s -X POST "http://127.0.0.1:$PORT/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "parameters": {"path": "package.json"}}' | jq . 2>/dev/null || \
curl -s -X POST "http://127.0.0.1:$PORT/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "parameters": {"path": "package.json"}}'

# Test list_files
echo -e "\n4. Test list_files:"
curl -s -X POST "http://127.0.0.1:$PORT/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_files", "parameters": {"path": "."}}' | jq . 2>/dev/null || \
curl -s -X POST "http://127.0.0.1:$PORT/execute" \
  -H "Content-Type: application/json" \
  -d '{"tool": "list_files", "parameters": {"path": "."}}'

echo -e "\n✓ Tool server tests complete"


import json
import sys

# Load the workflow
try:
    with open('workflow_xNY4qhKT2cwXYi0v.json', 'r') as f:
        workflow = json.load(f)
except FileNotFoundError:
    print("Error: workflow_xNY4qhKT2cwXYi0v.json not found.")
    sys.exit(1)

# Ensure 'nodes' and 'connections' exist
nodes = workflow.get('nodes', [])
connections = workflow.get('connections', {})

# 1. Clear existing connections completely to rebuild from scratch
# This avoids "messy lines" by redefining them explicitly.
new_connections = {}

# Helper to add connection
def add_conn(source, target, source_index=0, target_index=0, type='main'):
    if source not in new_connections:
        new_connections[source] = {type: []}
    
    # Ensure structure exists
    if type not in new_connections[source]:
        new_connections[source][type] = []
        
    # Check if index array exists
    while len(new_connections[source][type]) <= source_index:
        new_connections[source][type].append([])
        
    new_connections[source][type][source_index].append({
        "node": target,
        "type": "main",
        "index": target_index
    })

# 2. Define the Linear Sequence
# Flow:
# Webhook -> Supabase: Status Generating -> Download Reference Image -> Prepare Gemini Data -> 组装请求 -> 分析Agent-提示词撰写 -> JSON转grid_prompt -> 组装生图请求体 -> 生图请求 -> 转换为Binary -> Generate Filename -> Supabase Storage Upload -> Supabase: Status Completed

# Step 1: Webhook -> Supabase: Status Generating
add_conn("Webhook", "Supabase: Status Generating")

# Step 2: Supabase: Status Generating -> Download Reference Image
add_conn("Supabase: Status Generating", "Download Reference Image")

# Step 3: Download Reference Image -> Prepare Gemini Data
add_conn("Download Reference Image", "Prepare Gemini Data")

# Step 4: Prepare Gemini Data -> 组装请求
add_conn("Prepare Gemini Data", "组装请求")

# Step 5: 组装请求 -> 分析Agent-提示词撰写
add_conn("组装请求", "分析Agent-提示词撰写")

# Step 6: 分析Agent-提示词撰写 -> JSON转grid_prompt
add_conn("分析Agent-提示词撰写", "JSON转grid_prompt")

# Step 7: JSON转grid_prompt -> 组装生图请求体
add_conn("JSON转grid_prompt", "组装生图请求体")

# Step 8: 组装生图请求体 -> 生图请求
add_conn("组装生图请求体", "生图请求")

# Step 9: 生图请求 -> 转换为Binary
add_conn("生图请求", "转换为Binary")

# Step 10: 转换为Binary -> Generate Filename
add_conn("转换为Binary", "Generate Filename")

# Step 11: Generate Filename -> Supabase Storage Upload
add_conn("Generate Filename", "Supabase Storage Upload")

# Step 12: Supabase Storage Upload -> Supabase: Status Completed
add_conn("Supabase Storage Upload", "Supabase: Status Completed")

# 3. Update Workflow
workflow['connections'] = new_connections

# 4. Save
with open('workflow_xNY4qhKT2cwXYi0v_fixed.json', 'w') as f:
    json.dump(workflow, f, indent=2)

print("Fixed workflow connections saved to workflow_xNY4qhKT2cwXYi0v_fixed.json")

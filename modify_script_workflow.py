import json
import uuid

# Load
try:
    with open('script_extract_web_pretty.json', 'r') as f:
        wf = json.load(f)
except Exception as e:
    print(f"Error loading JSON: {e}")
    exit(1)

nodes = wf.get('nodes', [])
connections = wf.get('connections', {})

def create_supabase_node(name, status_value, progress_value, position):
    return {
        "parameters": {
            "operation": "update",
            "tableId": "scripts",
            "matchType": "allFilters",
            "filters": {
                "conditions": [
                    {
                        "keyName": "id",
                        "condition": "eq",
                        "keyValue": "={{ $('Webhook').item.json.body.script_id }}"
                    }
                ]
            },
            "fieldsUi": {
                "fieldValues": [
                    {
                        "fieldId": "status",
                        "fieldValue": status_value
                    },
                    {
                        "fieldId": "progress",
                        "fieldValue": progress_value
                    }
                ]
            }
        },
        "id": str(uuid.uuid4()),
        "name": name,
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": position,
        "credentials": {
            "supabaseApi": {
                "id": "5XGJWMLxSG8cgpYd",
                "name": "Supabase account"
            }
        }
    }

# 1. Find relevant nodes
try:
    switch_node = next(n for n in nodes if n['name'] == 'Switch')
    download_node = next(n for n in nodes if n['name'] == '下载视频')
    agent_node = next(n for n in nodes if n['name'] == '分析Agent-视频理解')
    write_node = next(n for n in nodes if n['name'] == '写回Supabase-scripts')
    deduct_node = next(n for n in nodes if n['name'] == '扣除积分')
    
    # Optional: Find existing start node
    start_supabase_node = next((n for n in nodes if n['name'] == 'Supabase-标记extracting'), None)
    
except StopIteration as e:
    print(f"Node not found: {e}")
    exit(1)

# 2. Insert "Respond-Started" after Switch (Async Mode)
respond_started_id = str(uuid.uuid4())
respond_started_node = {
    "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { ok: true, message: \"Started\", script_id: $('Webhook').item.json.body.script_id } }}",
        "options": {}
    },
    "id": respond_started_id,
    "name": "Respond-Started",
    "type": "n8n-nodes-base.respondToWebhook",
    "typeVersion": 1,
    "position": [switch_node['position'][0] + 200, switch_node['position'][1] + 200]
}
nodes.append(respond_started_node)

# Re-route Switch (Pass) -> Respond-Started -> Supabase-标记extracting
# Switch Output 2 (index 2) is "pass"
connections['Switch']['main'][2] = [
    {
        "node": "Respond-Started",
        "type": "main",
        "index": 0
    }
]

# Respond-Started -> Supabase-标记extracting
if start_supabase_node:
    # Update start node to set progress = 10
    # Check if progress field already exists to avoid duplication
    field_values = start_supabase_node['parameters']['fieldsUi']['fieldValues']
    progress_field = next((f for f in field_values if f['fieldId'] == 'progress'), None)
    
    if not progress_field:
        field_values.append({
            "fieldId": "progress",
            "fieldValue": 10
        })
    else:
        progress_field['fieldValue'] = 10
    
    # Remove 'error' field if it has no value and causes issues (optional, but good practice)
    # Based on screenshot, 'error' field is red/invalid because it's empty or schema mismatch.
    # Let's remove it if it's empty to be safe.
    start_supabase_node['parameters']['fieldsUi']['fieldValues'] = [
        f for f in field_values if f['fieldId'] != 'error'
    ]
    
    # 5. Add Error Handling
    # Create Error Node (Supabase Update)
    error_node_id = str(uuid.uuid4())
    error_node = {
        "parameters": {
            "operation": "update",
            "tableId": "scripts",
            "matchType": "allFilters",
            "filters": {
                "conditions": [
                    {
                        "keyName": "id",
                        "condition": "eq",
                        "keyValue": "={{ $('Webhook').item.json.body.script_id }}"
                    }
                ]
            },
            "fieldsUi": {
                "fieldValues": [
                    {
                        "fieldId": "status",
                        "fieldValue": "failed"
                    },
                    {
                        "fieldId": "error",
                        "fieldValue": "={{ $json.message || 'Unknown error' }}"
                    }
                ]
            }
        },
        "id": error_node_id,
        "name": "Supabase-Mark-Error",
        "type": "n8n-nodes-base.supabase",
        "typeVersion": 1,
        "position": [download_node['position'][0], download_node['position'][1] + 300], # Place below download node
        "credentials": {
            "supabaseApi": {
                "id": "5XGJWMLxSG8cgpYd",
                "name": "Supabase account"
            }
        }
    }
    nodes.append(error_node)
    
    # We need to manually add error triggers in n8n UI usually, 
    # or programmatically set 'onError' property of nodes to point to this node.
    # But n8n JSON format for error handling is a bit complex (Error Trigger node).
    # A simpler way is to just have this node available, and let the user connect it in UI.
    # OR, we can attach it to the Workflow Error Trigger if we add one.
    
    # Let's add an Error Trigger node
    error_trigger_id = str(uuid.uuid4())
    error_trigger_node = {
        "parameters": {},
        "id": error_trigger_id,
        "name": "Error Trigger",
        "type": "n8n-nodes-base.errorTrigger",
        "typeVersion": 1,
        "position": [download_node['position'][0] - 200, download_node['position'][1] + 300]
    }
    nodes.append(error_trigger_node)
    
    connections['Error Trigger'] = {
        "main": [
            [
                {
                    "node": "Supabase-Mark-Error",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }

    connections['Respond-Started'] = {
        "main": [
            [
                {
                    "node": start_supabase_node['name'],
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Update position of start_supabase_node
    start_supabase_node['position'] = [respond_started_node['position'][0] + 200, respond_started_node['position'][1]]

# 3. Insert "Supabase-Update-Analyzing" after Download Video
analyzing_node = create_supabase_node(
    "Supabase-Update-Analyzing", 
    "analyzing", 
    40,
    [download_node['position'][0] + 200, download_node['position'][1]]
)
nodes.append(analyzing_node)

# Get target of Download Video (Assemble Request)
download_targets = connections[download_node['name']]['main'][0]
connections[download_node['name']]['main'][0] = [
    {
        "node": analyzing_node['name'],
        "type": "main",
        "index": 0
    }
]
connections[analyzing_node['name']] = {
    "main": [
        download_targets
    ]
}

# 4. Insert "Supabase-Update-Parsing" after Agent
parsing_node = create_supabase_node(
    "Supabase-Update-Parsing", 
    "parsing", 
    80,
    [agent_node['position'][0] + 200, agent_node['position'][1]]
)
nodes.append(parsing_node)

# Get target of Agent (Parse JSON)
agent_targets = connections[agent_node['name']]['main'][0]
connections[agent_node['name']]['main'][0] = [
    {
        "node": parsing_node['name'],
        "type": "main",
        "index": 0
    }
]
connections[parsing_node['name']] = {
    "main": [
        agent_targets
    ]
}

# Update write_node (Write Back) to set progress = 100
write_node['parameters']['fieldsUi']['fieldValues'].append({
    "fieldId": "progress",
    "fieldValue": 100
})

# 5. Remove "Respond-完成" and connect Write -> Deduct directly
# Find Respond-完成 node
respond_complete_node = next((n for n in nodes if n['name'] == 'Respond-完成'), None)

if respond_complete_node:
    # Connect Write -> Deduct
    connections[write_node['name']]['main'][0] = [
        {
            "node": deduct_node['name'],
            "type": "main",
            "index": 0
        }
    ]
    # Remove Respond-Complete node from nodes list (optional, but cleaner)
    nodes = [n for n in nodes if n['name'] != 'Respond-完成']
    if 'Respond-完成' in connections:
        del connections['Respond-完成']

# Update workflow
wf['nodes'] = nodes
wf['connections'] = connections

# Clean up
allowed_keys = ['nodes', 'connections', 'settings', 'name']
cleaned_wf = {k: v for k, v in wf.items() if k in allowed_keys}

with open('script_extract_web_modified.json', 'w') as f:
    json.dump(cleaned_wf, f, indent=2)

print("Modified JSON saved.")

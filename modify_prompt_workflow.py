import json
import uuid

# Load
try:
    with open('farm_Prompt_web.json', 'r') as f:
        wf = json.load(f)
except Exception as e:
    print(f"Error loading JSON: {e}")
    exit(1)

nodes = wf.get('nodes', [])
connections = wf.get('connections', {})

# Find Webhook node
try:
    webhook_node = next(n for n in nodes if n['type'] == 'n8n-nodes-base.webhook')
    webhook_name = webhook_node['name']
except StopIteration:
    print("Webhook node not found")
    exit(1)

# Find "脚本生成器" node (Agent)
try:
    agent_node = next(n for n in nodes if '脚本生成器' in n['name'])
    agent_name = agent_node['name']
except StopIteration:
    # Try finding by type if name changed
    try:
        agent_node = next(n for n in nodes if n['type'] == '@n8n/n8n-nodes-langchain.agent')
        agent_name = agent_node['name']
    except StopIteration:
        print("Agent node not found")
        exit(1)

# Find "解析数据" node (Code)
try:
    code_node = next(n for n in nodes if '解析数据' in n['name'])
    code_name = code_node['name']
except StopIteration:
    try:
        code_node = next(n for n in nodes if n['type'] == 'n8n-nodes-base.code')
        code_name = code_node['name']
    except StopIteration:
        print("Code node not found")
        exit(1)


# 1. Add "Check Source" Switch Node
switch_id = str(uuid.uuid4())
switch_node = {
    "parameters": {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {
                            "caseSensitive": True,
                            "leftValue": "",
                            "typeValidation": "strict",
                            "version": 2
                        },
                        "conditions": [
                            {
                                "id": "web_check",
                                "leftValue": "={{ $json.body.callback_url }}",
                                "rightValue": "",
                                "operator": {
                                    "type": "string",
                                    "operation": "exists"
                                }
                            }
                        ],
                        "combinator": "and"
                    },
                    "renameOutput": True,
                    "outputKey": "web_mode"
                }
            ]
        },
        "options": {
            "fallbackOutput": 1 # Output index 1 for fallback
        }
    },
    "id": switch_id,
    "name": "Check Source",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [webhook_node['position'][0] + 300, webhook_node['position'][1]]
}
nodes.append(switch_node)

# 2. Add "Web Callback" Node (Return Prompt)
callback_id = str(uuid.uuid4())
callback_node = {
    "parameters": {
        "method": "POST",
        "url": "={{ $('Webhook-父入口').item.json.body.callback_url }}",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": """={{
  {
    "task_id": $('Webhook-父入口').item.json.body.replication_id,
    "status": "completed",
    "result": {
      "generatedScript": $json.sora_prompt,
      "videoPrompt": $json.sora_prompt_compact
    }
  }
}}""",
        "options": {}
    },
    "id": callback_id,
    "name": "Web-Callback-Prompt",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [code_node['position'][0] + 300, code_node['position'][1] + 200]
}
nodes.append(callback_node)

# Connections
# 1. Webhook -> Switch
existing_webhook_targets = connections.get(webhook_name, {}).get('main', [])
fallback_targets = existing_webhook_targets[0] if existing_webhook_targets else []

connections[webhook_name] = {
    "main": [
        [
            {
                "node": "Check Source",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

# 2. Switch -> Agent (Web Mode) & Fallback (Original)
# We need to find the original target of Webhook to be the fallback.
# Usually Webhook connects to "获取访问令牌".
# For Web Mode, we connect Switch -> Agent directly.

connections["Check Source"] = {
    "main": [
        [ # Output 0: Web Mode
            {
                "node": agent_name,
                "type": "main",
                "index": 0
            }
        ],
        fallback_targets # Output 1: Feishu Mode
    ]
}

# 3. Agent -> Code
# This connection should already exist in original workflow, we keep it.
# connections[agent_name] -> code_name

# 4. Code -> Callback (Web Mode)
# Code node output connects to "构造子流程payload-sora" in original flow.
# We want to add a branch or just connect it.
# Since n8n connections are list of lists (outputs), we can append to main[0].
# But wait, Code node output might go to multiple places.
# We need to make sure we don't break existing flow.
# The best way is to add a Switch after Code node to check mode again?
# Or, since we came from Web Mode, we know we are in Web Mode?
# No, n8n doesn't remember "path".
# So we need another Switch after Code Node?
# OR, we can just let "Web-Callback-Prompt" be another target of Code Node.
# But "Web-Callback-Prompt" needs `callback_url` which is in Webhook body.
# If we are in Feishu mode, `callback_url` is missing, so expression might fail or be empty.
# It's safer to add a Switch after Code Node too.

# Add "Check Source After Code" Switch
switch_after_id = str(uuid.uuid4())
switch_after_node = {
    "parameters": {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {
                            "caseSensitive": True,
                            "leftValue": "",
                            "typeValidation": "strict",
                            "version": 2
                        },
                        "conditions": [
                            {
                                "id": "web_check_2",
                                "leftValue": "={{ $('Webhook-父入口').item.json.body.callback_url }}",
                                "rightValue": "",
                                "operator": {
                                    "type": "string",
                                    "operation": "exists"
                                }
                            }
                        ],
                        "combinator": "and"
                    },
                    "renameOutput": True,
                    "outputKey": "web_mode"
                }
            ]
        },
        "options": {
            "fallbackOutput": 1
        }
    },
    "id": switch_after_id,
    "name": "Check Source After Code",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [code_node['position'][0] + 200, code_node['position'][1]]
}
nodes.append(switch_after_node)

# Get existing targets of Code Node
existing_code_targets = connections.get(code_name, {}).get('main', [])
original_code_targets = existing_code_targets[0] if existing_code_targets else []

# Re-route Code Node -> Switch After
connections[code_name] = {
    "main": [
        [
            {
                "node": "Check Source After Code",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

# Connect Switch After
connections["Check Source After Code"] = {
    "main": [
        [ # Output 0: Web Mode -> Callback
            {
                "node": "Web-Callback-Prompt",
                "type": "main",
                "index": 0
            }
        ],
        original_code_targets # Output 1: Feishu Mode -> Original targets
    ]
}

# Clean up JSON
allowed_keys = ['nodes', 'connections', 'settings', 'name']
cleaned_wf = {k: v for k, v in wf.items() if k in allowed_keys}
cleaned_wf['nodes'] = nodes
cleaned_wf['connections'] = connections

# Save
with open('farm_Prompt_web_modified.json', 'w') as f:
    json.dump(cleaned_wf, f, indent=2)

print("Modified JSON saved.")

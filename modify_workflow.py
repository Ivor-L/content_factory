import json
import uuid

# Load
try:
    with open('Getway_web.json', 'r') as f:
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
                                "leftValue": "={{ $json.body.product_id }}",
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

# 2. Add "Web Credits Check" Node
credits_check_id = str(uuid.uuid4())
credits_check_node = {
    "parameters": {
        "url": "=http://47.107.158.233:8080/workflow-credits/query?workflow_id={{ $('Webhook-父入口').item.json.body.workflow_id }}",
        "options": {}
    },
    "id": credits_check_id,
    "name": "Web-Credits-Check",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [switch_node['position'][0] + 300, switch_node['position'][1] - 100]
}
nodes.append(credits_check_node)

# 3. Add "Web Auth Check" Node
auth_check_id = str(uuid.uuid4())
auth_check_node = {
    "parameters": {
        "url": "=http://47.107.158.233:8080/api/balance/check?api_key={{ $('Webhook-父入口').item.json.body.api_key }}",
        "sendQuery": True,
        "queryParameters": {
            "parameters": [
                {
                    "name": "required",
                    "value": "={{ $json.data.credit_cost }}"
                }
            ]
        },
        "options": {}
    },
    "id": auth_check_id,
    "name": "Web-Auth-Check",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [credits_check_node['position'][0] + 300, credits_check_node['position'][1]],
    "alwaysOutputData": True,
    "onError": "continueRegularOutput"
}
nodes.append(auth_check_node)

# 4. Add "Web Auth Switch" Node
auth_switch_id = str(uuid.uuid4())
auth_switch_node = {
    "parameters": {
        "rules": {
            "values": [
                {
                    "conditions": {
                        "options": {
                            "caseSensitive": True,
                            "typeValidation": "strict",
                            "version": 2
                        },
                        "conditions": [
                            {
                                "id": "auth_pass",
                                "leftValue": "={{ $json.ok === true && $json.data.sufficient === true }}",
                                "rightValue": "",
                                "operator": {
                                    "type": "boolean",
                                    "operation": "true",
                                    "singleValue": True
                                }
                            }
                        ],
                        "combinator": "and"
                    },
                    "renameOutput": True,
                    "outputKey": "pass"
                }
            ]
        },
        "options": {}
    },
    "id": auth_switch_id,
    "name": "Web-Auth-Switch",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [auth_check_node['position'][0] + 300, auth_check_node['position'][1]]
}
nodes.append(auth_switch_node)

# 5. Add "Web Call Subworkflow" Node
subworkflow_id = str(uuid.uuid4())
subworkflow_node = {
    "parameters": {
        "method": "POST",
        "url": "https://hooks.flowonn.com/webhook/farm_Prompt", # farm_Prompt_web URL
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ $('Webhook-父入口').item.json.body }}", # Pass original body
        "options": {}
    },
    "id": subworkflow_id,
    "name": "Web-Call-Subworkflow",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.3,
    "position": [auth_switch_node['position'][0] + 300, auth_switch_node['position'][1]]
}
nodes.append(subworkflow_node)

# Connections
# 1. Webhook -> Switch
# Check existing connections from Webhook
existing_webhook_targets = connections.get(webhook_name, {}).get('main', [])

# If existing targets are in format [[{...}]], we need to preserve them for index 1 (fallback)
# If empty, we create empty list for index 1
fallback_targets = existing_webhook_targets[0] if existing_webhook_targets else []

# Re-route Webhook to Switch
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

# Connect Switch
connections["Check Source"] = {
    "main": [
        [ # Output 0: Web Mode
            {
                "node": "Web-Credits-Check",
                "type": "main",
                "index": 0
            }
        ],
        fallback_targets # Output 1: Feishu Mode (Original path)
    ]
}

# Connect Web Credits Check -> Web Auth Check
connections["Web-Credits-Check"] = {
    "main": [
        [
            {
                "node": "Web-Auth-Check",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

# Connect Web Auth Check -> Web Auth Switch
connections["Web-Auth-Check"] = {
    "main": [
        [
            {
                "node": "Web-Auth-Switch",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

# Connect Web Auth Switch -> Web Call Subworkflow
connections["Web-Auth-Switch"] = {
    "main": [
        [ # Output 0: Pass
            {
                "node": "Web-Call-Subworkflow",
                "type": "main",
                "index": 0
            }
        ]
    ]
}

# Update workflow object
wf['nodes'] = nodes
wf['connections'] = connections

# Clean up JSON for PUT request
allowed_keys = ['nodes', 'connections', 'settings', 'name']
cleaned_wf = {k: v for k, v in wf.items() if k in allowed_keys}

# Save
with open('Getway_web_modified.json', 'w') as f:
    json.dump(cleaned_wf, f, indent=2)

print("Modified JSON saved.")

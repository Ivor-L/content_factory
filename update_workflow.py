import json
import requests
import uuid

API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk"
BASE_URL = "https://n8n.atomx.top/api/v1"
WORKFLOW_ID = "yNIjqrlSnTeWDFIx"

headers = {
    "X-N8N-API-KEY": API_KEY,
    "Content-Type": "application/json"
}

def main():
    # 1. Get current workflow
    print(f"Fetching workflow {WORKFLOW_ID}...")
    resp = requests.get(f"{BASE_URL}/workflows/{WORKFLOW_ID}", headers=headers)
    if resp.status_code != 200:
        print(f"Failed to get workflow: {resp.text}")
        return
    
    workflow = resp.json()
    
    # 2. Modify Webhook Node
    webhook_node = None
    clean_node_name = "清洗卖点数据"
    clean_node_found = False
    
    for node in workflow['nodes']:
        if node['type'] == 'n8n-nodes-base.webhook':
            webhook_node = node
            if 'options' not in node['parameters']:
                node['parameters']['options'] = {}
            node['parameters']['options']['responseMode'] = 'responseNode'
            print("Modified Webhook node responseMode to 'responseNode'")
        
        if node['name'] == clean_node_name:
            clean_node_found = True
            
    if not webhook_node:
        print("Webhook node not found!")
        return
    if not clean_node_found:
        print(f"Node '{clean_node_name}' not found!")
        return

    # 3. Add Respond to Webhook Node
    respond_node_id = str(uuid.uuid4())
    respond_node = {
        "parameters": {
            "respondWith": "json",
            "responseBody": "={\n \"sellingPoints\": {{ $json.selling_points.marketing_profile.core_selling_points.map(p => p.description) }},\n \"detailedDescription\": {{ JSON.stringify($json.selling_points.visual_description) }},\n \"workflowData\": {{ JSON.stringify($json.selling_points) }}\n}",
            "options": {}
        },
        "id": respond_node_id,
        "name": "返回前端结果",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1,
        "position": [-1200, 750]  # Adjust position to be visible
    }
    
    workflow['nodes'].append(respond_node)
    print("Added 'Respond to Webhook' node")
    
    # 4. Connect '清洗卖点数据' to 'Respond to Webhook'
    if clean_node_name not in workflow['connections']:
        workflow['connections'][clean_node_name] = {"main": []}
    
    # Check if main output exists
    if not workflow['connections'][clean_node_name].get("main"):
        workflow['connections'][clean_node_name]["main"] = []
        
    # Append to the first output (index 0)
    if len(workflow['connections'][clean_node_name]["main"]) == 0:
        workflow['connections'][clean_node_name]["main"].append([])
        
    workflow['connections'][clean_node_name]["main"][0].append({
        "node": "返回前端结果",
        "type": "main",
        "index": 0
    })
    print(f"Connected '{clean_node_name}' to '返回前端结果'")

    # 5. Update Workflow
    print("Updating workflow...")
    update_resp = requests.put(f"{BASE_URL}/workflows/{WORKFLOW_ID}", headers=headers, json=workflow)
    
    if update_resp.status_code == 200:
        print("Workflow updated successfully!")
    else:
        print(f"Failed to update workflow: {update_resp.text}")

if __name__ == "__main__":
    main()

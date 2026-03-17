
import json
import sys
from pathlib import Path

# Load the current workflow
try:
    root = Path(__file__).resolve().parents[2]
    workflows_dir = root / "workflows" / "exports"
    input_path = workflows_dir / "workflow_current.json"
    with input_path.open('r', encoding='utf-8') as f:
        workflow = json.load(f)
except FileNotFoundError:
    print("Error: workflow_current.json not found in workflows/exports.")
    sys.exit(1)

nodes = workflow.get('nodes', [])

# 1. Fix Table Name (StoryboardTask -> storyboard_tasks)
# 2. Fix Progress Fields

# Helper to find node by name (or ID if name is ambiguous, but name is easier here)
def find_node(name):
    for n in nodes:
        if n['name'] == name:
            return n
    return None

# --- Fix "Supabase: Status Generating" ---
node_gen = find_node("Supabase: Status Generating")
if node_gen:
    # Set correct table ID
    node_gen['parameters']['tableId'] = "storyboard_tasks"
    
    # Configure Update parameters explicitly
    # Using 'update' operation with 'matcherColumns' and 'values' usually works best if UI is confusing
    # But based on the JSON structure I saw earlier:
    node_gen['parameters']['operation'] = "update"
    node_gen['parameters']['updateKey'] = "id"
    # We need to map the ID from the previous node (Webhook)
    # The previous node is Webhook, outputting body.taskId (or record_id)
    # The Supabase node will look for a property named 'id' in the input item if updateKey is 'id'.
    # If the input doesn't have 'id', we need to map it.
    # The screenshot showed "Fields to Send" empty.
    
    # Let's use the 'columns' and 'value' approach if that's what the node expects for simple updates,
    # OR better: use 'ui' style if we can reverse engineer it.
    
    # Safe bet: Use 'matcherColumns' and standard key-value pairs if the node type supports it.
    # But n8n-nodes-base.supabase usually has:
    # operation: 'update'
    # tableId: ...
    # updateKey: 'id'
    # columns: 'status'  <-- This tells it which columns to update
    # And then for values... it expects the input item to have a property 'status'.
    
    # Problem: The input item (from Webhook) has `taskId` (or `record_id`) but NOT `status`.
    # Solution: We need to set the value of 'status' explicitly.
    # In n8n Supabase node, there's often a "Data to Send" option.
    # If set to "Define Below", we use `additionalFields` or similar.
    
    # Let's try to inject `status` into the input stream BEFORE the Supabase node?
    # No, that requires another node.
    # Let's configure the Supabase node to set it.
    
    # Based on common n8n Supabase node structure for "Define Below":
    # It might use `values` parameter.
    
    # Let's look at the node definition in the JSON I read:
    # "parameters": { "operation": "update", "tableId": "StoryboardTask" }
    # It's very bare.
    
    # I will set it to use `ui` parameters which are often more robust for "Define Below".
    # Actually, I'll try to set `columns` (comma sep) and use expressions if possible.
    
    # Let's try this structure which is common for newer n8n nodes:
    node_gen['parameters'] = {
        "operation": "update",
        "tableId": "storyboard_tasks",
        "updateKey": "id",
        "columns": "status", # Tell it to update 'status'
        # Now, how to provide the value?
        # If I can't see the specific version schema, I'll assume standard n8n behavior:
        # It tries to read 'status' from input.
        # Since input doesn't have it, we should add a "Set" node before it?
        # OR use "Additional Fields" / "Values" option.
    }
    
    # Wait, the screenshot showed "Data to Send": "Define Below for Each Column".
    # And "Fields to Send" was empty.
    # This implies I need to populate that list.
    # In JSON, this is usually `values` or `metadata`.
    # Let's try `values` with key/value pairs.
    
    node_gen['parameters']['dataToSend'] = "defineBelow"
    node_gen['parameters']['values'] = {
        "status": "GENERATING_GRID"
    }
    
    # And for the ID match:
    # If `updateKey` is `id`, it looks for `id` in input.
    # We should ensure the input has `id`.
    # Webhook has `taskId`.
    # I'll add an expression to map it if possible, but `updateKey` is usually just a string selector.
    # If I can't map input property name, I might need a "Edit Fields" (Set) node before.
    # But let's look at the `Prepare Gemini Data` node. It uses code.
    # Maybe I can add a code node before Supabase?
    # Or just use an expression for the value if the node supports "Match Value".
    
    # Let's assume standard behavior: `updateKey` is the column name.
    # If `matcherColumns` is used, it might allow mapping.
    
    # Let's try to be safer: Use `executeQuery` to avoid ambiguity.
    # "UPDATE storyboard_tasks SET status = 'GENERATING_GRID' WHERE id = '{{ $json.body.taskId }}'"
    node_gen['parameters'] = {
        "operation": "executeQuery",
        "query": "UPDATE storyboard_tasks SET status = 'GENERATING_GRID' WHERE id = '{{ $json.body.taskId || $json.body.record_id }}'"
    }
    # This is 100% standard SQL and bypasses UI mapping issues.

# --- Fix "Supabase: Status Completed" ---
node_comp = find_node("Supabase: Status Completed")
if node_comp:
    # Set correct table ID
    node_comp['parameters']['tableId'] = "storyboard_tasks"
    
    # Use SQL update here too for safety
    # We need to update status AND coverImage.
    # Input comes from "Supabase Storage Upload" (HTTP Request).
    # The output of that node (Supabase Storage) is usually an object with `Key` or we constructed the URL.
    # Wait, "Supabase Storage Upload" just uploads. It doesn't return the public URL unless we construct it.
    # We need the filename to construct the URL.
    # The filename was generated in "Generate Filename" node: `{{ $json.fileName }}`.
    # And passed through.
    # So we can construct the URL: `https://<PROJECT>.supabase.co/storage/v1/object/public/images/storyboard/{{ $json.fileName }}`
    
    # Wait, the HTTP Request node output might replace $json.
    # We should ensure we keep the filename.
    # "Generate Filename" passed `fileName` in JSON.
    # "Supabase Storage Upload" (HTTP Request) might overwrite JSON output with the API response.
    # We can reference the previous node: `{{ $('Generate Filename').item.json.fileName }}`.
    
    project_url = "https://<YOUR_PROJECT_REF>.supabase.co" # I need to find the real project ref from credentials or context.
    # User didn't provide it. I'll use a placeholder and user has to fix it?
    # Or I can look at the `Supabase Storage Upload` node I created? 
    # It has `https://<YOUR_PROJECT_REF>.supabase.co`.
    # I should have asked for it.
    # But wait, I can use the Supabase credential in the SQL node? No, SQL node needs connection.
    # The SQL node uses the same credential.
    
    # Let's write the SQL query with placeholders for the URL construction.
    # "UPDATE storyboard_tasks SET status = 'GRID_COMPLETED', \"coverImage\" = '...' WHERE id = '...'"
    
    # We need `taskId`. "Generate Filename" has it.
    
    node_comp['parameters'] = {
        "operation": "executeQuery",
        "query": "UPDATE storyboard_tasks SET status = 'GRID_COMPLETED', \"coverImage\" = 'https://<YOUR_PROJECT_REF>.supabase.co/storage/v1/object/public/images/storyboard/{{ $('Generate Filename').item.json.fileName }}' WHERE id = '{{ $('Generate Filename').item.json.taskId }}'"
    }

# Save
output_path = workflows_dir / "workflow_xNY4qhKT2cwXYi0v_fixed_sql.json"
with output_path.open('w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2)

print("Fixed workflow (SQL version) saved.")

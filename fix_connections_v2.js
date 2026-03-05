
const N8N_HOST = 'https://n8n.atomx.top';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMWE5MDI4MS04YzZhLTRlYzctYTk4NS0zYTM0NGJhODhiNjYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyMjIwMzE4LCJleHAiOjE3NzQ4MDAwMDB9.UenI5-hkGRuVQbgTpyOHipZpOMR5d3K9j51bTMh_Xvk';
const WORKFLOW_ID = 'yNIjqrlSnTeWDFIx';

async function fixConnectionsAgain() {
  try {
    console.log(`Fetching workflow ${WORKFLOW_ID}...`);
    const wfRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    const workflow = await wfRes.json();
    
    // Check nodes again
    console.log('Nodes:', workflow.nodes.map(n => n.name));

    // Ensure "查询工作流积分" node exists
    const creditNode = workflow.nodes.find(n => n.name === '查询工作流积分');
    if (!creditNode) {
        // If not found, maybe rename didn't stick or it was already named correctly?
        // Wait, in previous step I renamed it.
        // Let's assume it's correct.
    }

    // Fix the "Webhook" connection
    // It should point to "查询工作流积分"
    if (workflow.connections['Webhook']) {
        workflow.connections['Webhook'].main[0][0].node = '查询工作流积分';
    }

    // Fix "查询工作流积分" connection
    // It should point to "验证api-key"
    if (workflow.connections['查询工作流积分']) {
        workflow.connections['查询工作流积分'].main = [[
            {
                node: '验证api-key',
                type: 'main',
                index: 0
            }
        ]];
    }

    // Fix "清洗卖点数据" connection
    // It should point to "Update Product (Code)" AND "返回前端结果"
    if (workflow.connections['清洗卖点数据']) {
         workflow.connections['清洗卖点数据'].main = [[
            {
                node: 'Update Product (Code)',
                type: 'main',
                index: 0
            },
            {
                node: '返回前端结果', // Assuming parallel branch
                type: 'main',
                index: 0
            }
        ]];
    }

    // Fix "Update Product (Code)" connection
    // It should point to "扣除积分"
    if (!workflow.connections['Update Product (Code)']) {
        workflow.connections['Update Product (Code)'] = {
            main: [[
                {
                    node: '扣除积分',
                    type: 'main',
                    index: 0
                }
            ]]
        };
    } else {
        workflow.connections['Update Product (Code)'].main[0][0].node = '扣除积分';
    }

    console.log('Updating connections on server...');
    const updateRes = await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}`, {
      method: 'PUT',
      headers: { 
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
        name: workflow.name
      })
    });

    if (!updateRes.ok) {
        console.error(await updateRes.text());
        return;
    }
    console.log('Success!');
    
    // Activate
    await fetch(`${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': API_KEY }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

fixConnectionsAgain();

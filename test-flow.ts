
import dotenv from 'dotenv';
import { analyzeProduct } from './lib/n8n';

dotenv.config({ path: '.env.local' });

async function test() {
  console.log('--- Starting Backend Flow Test ---');

  // Valid image from DB
  const validImage = "https://api.supabase.atomx.top/storage/v1/object/public/uploads/1772466293303-4912581-image1769085457935pmcyok2.png";

  const testProduct = {
    name: "Test Product (CLI Auto Test)",
    description: "A test product created via CLI to verify N8N integration.",
    images: [validImage],
    productId: "test-id-" + Date.now(),
    apiKey: "sk_S-XJvpVKGGwnac1AlEFs3avCWZpqdOGaMMW27Y8iSPY", // Key from logs
    workflowId: "flow_product_dna", // Added workflowId
  };

  console.log('Input Product:', testProduct);

  // Call analyzeProduct
  console.log('Calling analyzeProduct...');
  try {
    const result = await analyzeProduct(testProduct);
    console.log('--- Analysis Result ---');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.detailedDescription && !result.detailedDescription.includes('Analysis failed')) {
        console.log('\n✅ TEST PASSED: Successfully received analysis from N8N.');
    } else {
        console.log('\n❌ TEST FAILED: Received fallback/error response.');
    }

  } catch (error) {
    console.error('Test Failed:', error);
  }
}

test();

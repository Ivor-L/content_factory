'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProduct, createDraftProduct } from '../actions';

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'complete' | 'failed'>('idle');
  
  // Form state
  const [id, setId] = useState<string | null>(null); // Product ID
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [sellingPoints, setSellingPoints] = useState<string[]>([]);
  const [workflowData, setWorkflowData] = useState<any>(null);
  
  // Inputs
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [sellingPointInput, setSellingPointInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setImages([...images, data.url]);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
      // Reset input value to allow uploading same file again if needed
      e.target.value = '';
    }
  };

  const handleAddImage = () => {
    if (imageUrlInput.trim()) {
      setImages([...images, imageUrlInput.trim()]);
      setImageUrlInput('');
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleAddSellingPoint = () => {
    if (sellingPointInput.trim()) {
      setSellingPoints([...sellingPoints, sellingPointInput.trim()]);
      setSellingPointInput('');
    }
  };

  const handleRemoveSellingPoint = (index: number) => {
    setSellingPoints(sellingPoints.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (!name) return alert('Please enter a product name first.');
    
    // Check API Key
    const apiKey = localStorage.getItem('user_api_key');
    if (!apiKey) {
        alert('Please configure your API Key in Settings first.');
        router.push('/settings');
        return;
    }

    setAnalyzing(true);
    setAnalysisStatus('analyzing');
    try {
      // 1. Create Draft Product if not exists
      let productId = id;
      if (!productId) {
          const formData = new FormData();
          formData.append('name', name);
          formData.append('images', JSON.stringify(images));
          productId = await createDraftProduct(formData);
          setId(productId);
      }

      // 2. Trigger Analysis
      const res = await fetch('/api/products/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            productId,
            apiKey,
            name, 
            description, 
            images 
        }),
      });
      
      if (!res.ok) throw new Error('Analysis trigger failed');
      
      // 3. Handle response
      const data = await res.json();
      
      if (data.sellingPoints && data.sellingPoints.length > 0) {
        // Data returned immediately (Mock case or n8n sync return)
        setSellingPoints(data.sellingPoints);
        if (data.detailedDescription) setDescription(data.detailedDescription);
        if (data.workflowData) setWorkflowData(data.workflowData);
        setAnalysisStatus('complete');
      } else {
        // Real n8n async case - wait for user to refresh or implement real polling
        // For now, we assume local mock always returns data
        alert('Analysis started. Please check back later or refresh.');
        setAnalysisStatus('complete'); 
      }
      
    } catch (error) {
      console.error(error);
      alert('Failed to analyze product');
      setAnalysisStatus('failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData();
      if (id) formData.append('id', id); // Pass ID if exists
      formData.append('name', name);
      formData.append('description', description);
      formData.append('sellingPoints', JSON.stringify(sellingPoints));
      formData.append('images', JSON.stringify(images));
      if (workflowData) {
        formData.append('analysisResult', JSON.stringify(workflowData));
      }

      await createProduct(formData);
    } catch (error) {
      console.error(error);
      alert('Failed to save product');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Add New Product</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Product Name</label>
          <input
            type="text"
            required
            className="w-full border rounded px-4 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Wireless Headphones"
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium mb-1">Images</label>
          
          {/* File Upload */}
          <div className="mb-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {uploadingImage ? (
                    <div className="flex flex-col items-center">
                      <svg className="animate-spin h-8 w-8 text-gray-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-sm text-gray-500">Uploading...</p>
                    </div>
                  ) : (
                    <>
                      <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                      </svg>
                      <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-gray-500">SVG, PNG, JPG or GIF</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" disabled={uploadingImage} />
              </label>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <input
              type="url"
              className="flex-1 border rounded px-4 py-2"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
            <button
              type="button"
              onClick={handleAddImage}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Add URL
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {images.map((img, i) => (
              <div key={i} className="relative group border rounded overflow-hidden aspect-square">
                <img src={img} alt={`Product ${i}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Analyze Button */}
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || !name}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing...
              </>
            ) : (
              '✨ Analyze Product with AI'
            )}
          </button>
          
          {analysisStatus === 'analyzing' && (
             <span className="text-sm text-blue-600">Analyzing product selling points...</span>
          )}
          {analysisStatus === 'complete' && (
             <span className="text-sm text-green-600">Analysis Complete! Review the results below.</span>
          )}
          {analysisStatus === 'failed' && (
             <span className="text-sm text-red-600">Analysis Failed. Please try again.</span>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="w-full border rounded px-4 py-2 h-32"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Product description..."
          />
        </div>

        {/* Selling Points */}
        <div>
          <label className="block text-sm font-medium mb-1">Selling Points</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              className="flex-1 border rounded px-4 py-2"
              value={sellingPointInput}
              onChange={(e) => setSellingPointInput(e.target.value)}
              placeholder="Add a selling point"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSellingPoint();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddSellingPoint}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Add
            </button>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {sellingPoints.map((point, i) => (
              <li key={i} className="group relative pr-8">
                {point}
                <button
                  type="button"
                  onClick={() => handleRemoveSellingPoint(i)}
                  className="absolute right-0 text-red-500 opacity-0 group-hover:opacity-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        {workflowData && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Analysis Result (For Workflow)</h3>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white p-2 rounded border max-h-48 overflow-y-auto">
              {JSON.stringify(workflowData, null, 2)}
            </pre>
          </div>
        )}

        {/* Submit */}
        <div className="pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-black text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>
    </div>
  );
}

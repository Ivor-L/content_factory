import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    
    // Create a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Sanitize filename
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '');
    const filename = `${uniqueSuffix}-${sanitizedName}`;
    
    // Upload to Supabase Storage using Admin client
    // Note: Admin client uses service role key which bypasses RLS
    const { data, error } = await supabaseAdmin
      .storage
      .from('uploads')
      .upload(filename, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      // Handle specific errors
      if ((error as any).statusCode === '413' || (error as any).status === 413) {
          return NextResponse.json(
            { error: 'File too large for Supabase Storage' },
            { status: 413 }
          );
      }
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin
      .storage
      .from('uploads')
      .getPublicUrl(filename);

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file to Supabase' },
      { status: 500 }
    );
  }
}

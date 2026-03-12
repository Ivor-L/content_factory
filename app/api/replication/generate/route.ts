import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReplication, generateOneClickReplication } from "@/lib/n8n";
import { createClient } from "@supabase/supabase-js";

const resolvePrimaryProductImage = (images?: string | null): string | null => {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (first && typeof first.url === "string") return first.url.trim();
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
  } catch (error) {
    const candidates = images
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
        productId, 
        scriptId, 
        targetCountry, 
        targetLanguage, 
        duration, 
        quantity,
        blueprint
    } = body;

    if (!productId || !scriptId) {
      return NextResponse.json({ error: "Missing productId or scriptId" }, { status: 400 });
    }

    // Get Authorization header
    const authHeader = request.headers.get('Authorization');
    let apiKey: string | undefined;
    let userId: string | undefined;

    if (authHeader) {
        try {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error } = await supabase.auth.getUser(token);
            
            if (user && !error) {
                userId = user.id;
                // Fetch profile to get api_key
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('api_key')
                    .eq('id', user.id)
                    .single();
                
                if (profile?.api_key) {
                    apiKey = profile.api_key;
                }
            }
        } catch (e) {
            console.error("Error fetching user/profile:", e);
        }
    }
    
    if (!apiKey) {
        console.warn("API Key not found for user. n8n workflow might fail or use default.");
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    const script = await prisma.script.findUnique({ where: { id: scriptId } });

    if (!product || !script) {
      return NextResponse.json({ error: "Product or Script not found" }, { status: 404 });
    }

    const replication = await prisma.replication.create({
      data: {
        status: "pending",
        result: "{}",
        type: "FULL",
        product: { connect: { id: productId } },
        script: { connect: { id: scriptId } },
      },
    });

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/webhook/replication`;
    const productImageUrl = resolvePrimaryProductImage(product.images);

    const scriptForTrigger = blueprint ? { ...script, blueprint } : script;

    // Start background task (awaiting trigger success)
    try {
        // Use the new One-Click Replication function
        await generateOneClickReplication(product, scriptForTrigger, {
            targetCountry: targetCountry || 'us',
            targetLanguage: targetLanguage || 'en',
            duration: duration || '15',
            quantity: quantity || '1',
            apiKey,
            userId,
            callbackUrl,
            replicationId: replication.id,
            productImageUrl
        });
    } catch (error) {
        console.error("Replication trigger failed", error);
        await prisma.replication.update({
            where: { id: replication.id },
            data: { status: "failed", result: JSON.stringify({ error: "Trigger failed" }) }
        });
        return NextResponse.json({ error: "Failed to trigger replication" }, { status: 500 });
    }

    return NextResponse.json({ id: replication.id, status: "pending" });
  } catch (error) {
    console.error("Error creating replication:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

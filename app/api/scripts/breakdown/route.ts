import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { breakdownScript } from "@/lib/n8n";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scriptId } = body;

    if (!scriptId) {
      return NextResponse.json(
        { error: "scriptId is required" },
        { status: 400 }
      );
    }

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
    });

    if (!script) {
      return NextResponse.json(
        { error: "Script not found" },
        { status: 404 }
      );
    }

    // Get API Key from user profile
    const authHeader = request.headers.get('Authorization');
    let apiKey: string | undefined;

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let user = null;

    if (authHeader) {
        try {
            const token = authHeader.replace('Bearer ', '');
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data.user) {
                user = data.user;
            }
        } catch (e) {
            console.error("Error fetching user from header:", e);
        }
    } 
    
    // If no user from header, try cookies
    if (!user) {
        try {
            // NOTE: In a real Next.js app with Supabase Auth Helpers, we would use createServerClient with cookies.
            // But here we might not have access to cookies easily if we use vanilla supabase-js client.
            // However, we can try to parse the 'sb-access-token' or similar from request headers manually 
            // if standard helpers aren't set up.
            // But let's check if we can just skip auth if not found and rely on backend service role or mock?
            // No, n8n needs api_key.
            
            // Let's try to extract token from cookie header manually as a fallback
            const cookieHeader = request.headers.get('cookie');
            if (cookieHeader) {
                // This is a naive check. A proper implementation needs @supabase/ssr
                // But if the project uses @supabase/supabase-js on client, it sets cookies.
                // The cookie name depends on configuration.
                // Let's skip complex cookie parsing for now and assume the client SHOULD send the header.
                // But wait, the client is fetch() in a client component. It does NOT send Authorization header by default.
                // So we MUST rely on cookies if we want it to work without changes in client.
                
                // Since we don't have @supabase/ssr installed (checked package.json), 
                // we can't easily get the user from cookies server-side in a robust way without it.
                // So the BEST fix is to fix the Client Component to send the token.
            }
        } catch (e) {
             console.error("Error fetching user from cookies:", e);
        }
    }

    if (user) {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('api_key')
                .eq('id', user.id)
                .single();
            
            if (profile?.api_key) {
                apiKey = profile.api_key;
            }
        } catch (e) {
            console.error("Error fetching profile:", e);
        }
    } else {
        console.warn("No authenticated user found for breakdown request. API Key will be missing.");
    }

    // Trigger async breakdown
    await breakdownScript({
      title: script.title,
      videoUrl: script.videoUrl,
      scriptId: script.id,
      apiKey: apiKey
    });

    // We don't wait for result, but we update status to 'PENDING' or 'QUEUED' if needed
    // The workflow will update it to 'extracting' -> 'analyzing' -> 'completed'
    // Ensure script status is set to initial state
    await prisma.script.update({
        where: { id: scriptId },
        data: { status: "queued" }
    });

    return NextResponse.json({ success: true, message: "Breakdown started" });
  } catch (error) {
    console.error("Error in breakdown API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

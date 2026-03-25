"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface ReplicationDetailProps {
  replication: {
    id: string;
    status: string;
    result: string;
    type: string;
    product?: { name: string };
    script?: { title: string };
  };
}

export default function ReplicationDetail({ replication }: ReplicationDetailProps) {
  const router = useRouter();

  useEffect(() => {
    if (replication.status !== "pending") return;

    const channel = supabase
      .channel(`replication-${replication.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "replications", filter: `id=eq.${replication.id}` },
        (payload) => {
          const data = payload.new as { status: string };
          if (data.status !== "pending") {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [replication.id, replication.status, router]);

  const result = replication.result ? JSON.parse(replication.result) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Replication Result</h1>
        <Link href="/replication" className="text-primary hover:underline">
          Back to list
        </Link>
      </div>

      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-500">Type:</span>
            <p className="font-medium">{replication.type}</p>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
              ${replication.status === 'completed' ? 'bg-green-100 text-green-800' : 
                replication.status === 'pending' ? 'bg-gray-100 text-gray-800' : 
                'bg-red-100 text-red-800'}`}>
              {replication.status}
            </span>
          </div>
          {replication.product && (
            <div>
              <span className="text-gray-500">Product:</span>
              <p className="font-medium">{replication.product.name}</p>
            </div>
          )}
          {replication.script && (
            <div>
              <span className="text-gray-500">Script:</span>
              <p className="font-medium">{replication.script.title}</p>
            </div>
          )}
        </div>

        {replication.status === "pending" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="text-gray-500">Generating content...</span>
          </div>
        )}

        {replication.status === "completed" && result && (
          <div className="space-y-6 border-t pt-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Generated Script</h3>
              <div className="mt-2 p-4 bg-gray-50 rounded-md whitespace-pre-wrap font-mono text-sm border">
                {result.generatedScript}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900">Video Prompt</h3>
              <div className="mt-2 p-4 bg-gray-50 rounded-md text-sm border">
                {result.videoPrompt}
              </div>
            </div>
          </div>
        )}
        
        {replication.status === "failed" && (
             <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
                 Replication failed. Please try again.
             </div>
        )}
      </div>
    </div>
  );
}

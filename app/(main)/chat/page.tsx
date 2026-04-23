export const dynamic = "force-dynamic";

import { getServerRequestUserContext } from "@/lib/serverRequestContext";
import { ChatPageContent } from "./ChatPageContent";

export default async function ChatPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8 text-gray-600">Unauthorized</div>;
  }

  return <ChatPageContent />;
}

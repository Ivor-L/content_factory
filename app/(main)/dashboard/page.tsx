export const dynamic = "force-dynamic";

import { HomeContent } from "./components/HomeContent";
import { getServerRequestUserContext } from "@/lib/serverRequestContext";

export default async function Home() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8 text-gray-600">Unauthorized</div>;
  }

  return <HomeContent />;
}

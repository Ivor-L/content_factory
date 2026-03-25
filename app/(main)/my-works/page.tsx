import { getServerRequestUserContext } from "@/lib/serverRequestContext";
import { MyProjectsClient } from "./MyProjectsClient";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const { userId } = await getServerRequestUserContext();

  if (!userId) {
    return <div className="p-8 text-gray-600">Unauthorized</div>;
  }

  return <MyProjectsClient />;
}

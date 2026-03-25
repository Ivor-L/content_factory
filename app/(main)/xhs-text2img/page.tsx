import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyXhsText2ImagePage() {
  redirect("/xhs-poster");
}

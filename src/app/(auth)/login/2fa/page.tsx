import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/auth-forms";
import { readTwoFactorChallenge } from "@/lib/auth";

export const metadata = { title: "Two-factor verification" };

export default async function TwoFactorPage() {
  const challenge = await readTwoFactorChallenge();
  if (!challenge) redirect("/login");
  return <TwoFactorForm />;
}

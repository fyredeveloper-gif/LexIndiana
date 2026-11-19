import { notFound, redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";
import { getRegistrationAccess } from "@/lib/registration";

export const metadata = { title: "Create workspace" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const access = await getRegistrationAccess();
  if (!access.allowed) notFound();

  return <RegisterForm bootstrap={access.bootstrap} />;
}

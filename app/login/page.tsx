import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await getCurrentUser()) redirect(safeNext);
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <h1>Sign in</h1>
      <LoginForm next={safeNext} />
    </div>
  );
}

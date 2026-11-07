import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 mb-8 text-muted">Sign in to your workspace.</p>
      <LoginForm next={next} />
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-8 rounded-card border border-dashed border-border p-4 text-[13px] text-muted">
          <div className="mb-1 font-medium text-fg">Demo accounts (password: demo-password)</div>
          owner@atelier.example · owner@ironhouse.example · owner@lumen.example · admin@bks.example
        </div>
      )}
    </>
  );
}

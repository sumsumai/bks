import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold tracking-tight">Start your 14-day trial</h1>
      <p className="mt-1 mb-8 text-muted">Booking page, AI assistant and mobile app, live in minutes.</p>
      <SignupForm />
    </>
  );
}

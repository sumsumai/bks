export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-14 text-[15px] leading-relaxed sm:px-6">
      <h1 className="text-[30px] font-semibold tracking-tight">Privacy notice</h1>
      <p className="mt-4 text-muted">How customer data is handled when you book or chat with a business on BKS.</p>
      <h2 className="mt-8 font-semibold">Who is responsible</h2>
      <p className="mt-2 text-muted">The business you book with is the data controller for your booking and conversations. BKS processes that data on its behalf to run the booking page, the AI assistant and reminders.</p>
      <h2 className="mt-6 font-semibold">What we process</h2>
      <p className="mt-2 text-muted">Your name and contact details, your bookings, and messages you exchange with the business or its AI assistant. The assistant may remember preferences you share (for example a preferred stylist) to serve you better. Each business&apos;s data is isolated: no other business can see it.</p>
      <h2 className="mt-6 font-semibold">AI assistant</h2>
      <p className="mt-2 text-muted">Messages to a business&apos;s assistant are processed by an AI model to generate replies. Sensitive requests are handed to a human. You can always ask to speak to a person.</p>
      <h2 className="mt-6 font-semibold">Your rights</h2>
      <p className="mt-2 text-muted">You can ask the business to access, export, correct or erase your data at any time. Businesses can export or erase a customer&apos;s data in one click from their workspace.</p>
      <h2 className="mt-6 font-semibold">Retention</h2>
      <p className="mt-2 text-muted">Booking records are kept as long as the business needs them for its accounts; erased customers&apos; bookings are kept only in anonymised form.</p>
    </main>
  );
}

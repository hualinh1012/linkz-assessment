import Link from "next/link";

export default function PaymentFailedPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-lg border-2 border-red-200 bg-white p-8 text-center">
        <span className="flex mx-auto mb-4 h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl">
          ✕
        </span>
        <h1 className="text-2xl font-bold text-gray-900">Payment Failed</h1>
        <p className="mt-3 text-gray-500">
          Your payment could not be completed. The seat has been released and
          is available for others.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Back to seats
        </Link>
      </div>
    </main>
  );
}

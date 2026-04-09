export default function OrderSuccessPage() {
  return (
    <div
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center"
      dir="rtl"
      lang="ar"
    >
      <div className="w-full rounded-2xl border border-[var(--accent-muted)] bg-[var(--card)] p-6 shadow-sm sm:p-10">
        <p className="text-lg font-semibold text-[var(--foreground)] sm:text-xl">
          تم إرسال طلبكم بنجاح، سيتواصل معكم فريقنا الآن لإتمام الطلب
        </p>
      </div>
    </div>
  );
}


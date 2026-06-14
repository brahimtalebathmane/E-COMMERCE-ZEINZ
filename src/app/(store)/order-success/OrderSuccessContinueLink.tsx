"use client";

const WHATSAPP_HREF = "https://wa.me/22233713957";

export function OrderSuccessContinueLink() {
  return (
    <div className="mt-8 flex justify-center">
      <a
        href={WHATSAPP_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="store-btn-whatsapp max-w-sm"
      >
        تواصل معنا عبر واتساب
      </a>
    </div>
  );
}

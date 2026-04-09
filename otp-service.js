const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function normalizeEnv(value) {
  if (value == null) return "";
  let v = String(value).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function createServiceClient() {
  const url = normalizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = normalizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeE164(phone) {
  const trimmed = String(phone || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = onlyDigits(trimmed);
  return digits ? `+${digits}` : null;
}

function generate4Digit() {
  // crypto-random 0000..9999
  const n = crypto.randomInt(0, 10000);
  return String(n).padStart(4, "0");
}

function otpTtlSeconds() {
  const raw = Number(process.env.OTP_TTL_SECONDS || 300);
  if (!Number.isFinite(raw) || raw < 60 || raw > 3600) return 300;
  return Math.floor(raw);
}

function hashOtp(phoneE164, otp) {
  const secret = normalizeEnv(process.env.OTP_HASH_SECRET) || "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(`${phoneE164}:${otp}`).digest("hex");
}

async function createOtpForPhone(phoneRaw) {
  const phone = normalizeE164(phoneRaw);
  if (!phone) throw new Error("Invalid phone");

  const otp = generate4Digit();
  const otp_hash = hashOtp(phone, otp);
  const ttl = otpTtlSeconds();
  const expires_at = new Date(Date.now() + ttl * 1000).toISOString();

  const supabase = createServiceClient();
  const { error } = await supabase.from("otp_codes").insert({
    phone,
    otp_hash,
    expires_at,
  });
  if (error) throw new Error(error.message);

  return { phone, otp, expires_at, ttl_seconds: ttl };
}

async function verifyOtp(phoneRaw, otpRaw) {
  const phone = normalizeE164(phoneRaw);
  const otp = String(otpRaw || "").trim();
  if (!phone) throw new Error("Invalid phone");
  if (!/^\d{4}$/.test(otp)) return { ok: false };

  const otp_hash = hashOtp(phone, otp);
  const supabase = createServiceClient();

  // Find latest unconsumed matching hash
  const { data, error } = await supabase
    .from("otp_codes")
    .select("id, expires_at, consumed_at")
    .eq("phone", phone)
    .eq("otp_hash", otp_hash)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  const row = data && data[0];
  if (!row) return { ok: false };

  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return { ok: false };

  const { error: consumeErr } = await supabase
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (consumeErr) throw new Error(consumeErr.message);

  return { ok: true };
}

module.exports = {
  createOtpForPhone,
  verifyOtp,
  normalizeE164,
};


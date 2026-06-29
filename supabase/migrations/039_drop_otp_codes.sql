-- Remove OTP infrastructure (phone verification is handled via rate limits + duplicate guard).

drop table if exists public.otp_codes;

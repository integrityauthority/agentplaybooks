-- Optional per-secret destination allow-list.
--
-- `use_secret` / the secrets proxy inject a decrypted credential into an
-- outbound request whose URL the caller supplies. Pinning a secret to specific
-- hosts stops a caller (or an agent following injected instructions) from
-- naming an arbitrary destination.
--
-- Nullable and unset by default, so existing secrets keep working unchanged.
-- Operators who want pinning to be mandatory set SECRETS_REQUIRE_ALLOWED_HOSTS=true.

ALTER TABLE secrets
  ADD COLUMN IF NOT EXISTS allowed_hosts text[];

COMMENT ON COLUMN secrets.allowed_hosts IS
  'Optional hostname allow-list for outbound use of this secret. NULL/empty means any destination. Entries are case-insensitive hostnames; a leading "*." matches subdomains only.';

-- Widen the federated-proxy audit trail into the one audit trail.
--
-- `mcp_proxy_audit_logs` already held "playbook X did operation Y against
-- target Z, and here is how it went", with the owner-read policy and the
-- read endpoint to match. The secrets vault needed exactly that and had
-- nothing: `secrets.last_used_at` / `use_count` say a credential was used at
-- some point, not who used it, from which credential, to which destination,
-- or whether an attempt was refused.
--
-- A second table would have duplicated the policy, the endpoint and the
-- reader's mental model. Instead the existing one takes the extra columns the
-- vault needs and drops the two assumptions that were federation-specific:
--
--   - `mcp_server_id` becomes nullable — a vault event has no federated server;
--   - `status` gains 'denied' — a refused attempt is the event this trail
--     exists for, and it is not the same thing as an authorized call that
--     failed ('error').
--
-- Secret operations are namespaced `secret.*` in `operation`, so one index and
-- one endpoint serve both kinds and a third kind needs no migration.
--
-- What a row must never hold: a secret value, a full outbound URL (a path or
-- query string carries data of its own — `secret.use` records the destination
-- host in `target` and nothing more), or an API key. `actor_id` is a user id or
-- a key *prefix*, the same identifier `secrets.created_by` already stores, and
-- `error_code` is a short code rather than a message, because messages
-- interpolate their inputs.

-- The rename is the one statement here that is not naturally idempotent, and
-- this file may be applied by hand (or through the Supabase MCP server) on a
-- machine that does not track migration history. Guarded so a second run is a
-- no-op instead of an error on line one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mcp_proxy_audit_logs') THEN
    ALTER TABLE public.mcp_proxy_audit_logs RENAME TO audit_logs;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'mcp_proxy_audit_logs_playbook_created_idx') THEN
    ALTER INDEX public.mcp_proxy_audit_logs_playbook_created_idx RENAME TO audit_logs_playbook_created_idx;
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ALTER COLUMN mcp_server_id DROP NOT NULL;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS mcp_proxy_audit_logs_status_check;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_status_check
  CHECK (status IN ('success', 'denied', 'error'));

ALTER TABLE public.audit_logs
  -- 'owner' | 'api_key' | 'anonymous'. NULL on the federated rows written
  -- before this migration.
  ADD COLUMN IF NOT EXISTS actor_type text,
  -- A user id, or an API key prefix. Never a key, never a token.
  ADD COLUMN IF NOT EXISTS actor_id text,
  -- The secret a `secret.*` row is about. Kept by name rather than by id so the
  -- record of a deletion survives its own subject.
  ADD COLUMN IF NOT EXISTS secret_name text;

COMMENT ON TABLE public.audit_logs IS
  'Playbook audit trail. `operation` is a federated MCP operation (tools/call, …) or a namespaced vault operation (secret.use, secret.reveal, …). Never holds secret values, full URLs, or API keys.';

DROP POLICY IF EXISTS "Owners can read MCP proxy audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Owners can read audit logs" ON public.audit_logs;
CREATE POLICY "Owners can read audit logs"
  ON public.audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.playbooks
    WHERE playbooks.id = audit_logs.playbook_id
      AND playbooks.user_id = auth.uid()
  ));

-- No INSERT/UPDATE/DELETE policy is intentional, as before: rows are written by
-- service-role API code and nothing is meant to edit them afterwards.

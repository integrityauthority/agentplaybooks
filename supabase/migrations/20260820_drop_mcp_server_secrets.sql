-- Drop the per-MCP-server secret store.
--
-- Federated credentials now resolve by name from the playbook's Secrets vault,
-- which is the only place a credential lives. This table held a second,
-- weaker one: its key was SHA-256 of a passphrase, unsalted, with no AAD
-- binding the ciphertext to the server it belonged to, and it had none of the
-- rotation, expiry, usage accounting or audit trail the vault has.
--
-- The payloads cannot be migrated: the API never returned them, so there is no
-- way to read a value out and write it into the vault. Anyone still relying on
-- one has to re-enter it on the Secrets tab.
--
-- The guard below is deliberate. A DROP TABLE is irreversible, and this
-- migration was written without being able to query the production row count,
-- so it refuses to run rather than destroy credentials nobody checked for. If
-- it raises, look at what is in there first and delete the rows knowingly.

DO $$
DECLARE
  remaining bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mcp_server_secrets'
  ) THEN
    RAISE NOTICE 'mcp_server_secrets is already gone; nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.mcp_server_secrets' INTO remaining;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'mcp_server_secrets still holds % row(s). Confirm they are unused and delete them before applying this migration.',
      remaining;
  END IF;

  DROP TABLE public.mcp_server_secrets;
  RAISE NOTICE 'Dropped mcp_server_secrets (it was empty).';
END $$;

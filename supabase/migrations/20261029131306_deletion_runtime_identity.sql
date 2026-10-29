-- Dedicated password-auth identity; PASSWORD NULL means no password can log in yet.
-- Set its password only through a secure operator session, never a committed file.
BEGIN;
CREATE ROLE followkit_deletion_runtime LOGIN INHERIT NOSUPERUSER NOCREATEDB
 NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4 PASSWORD NULL;
GRANT followkit_deletion_executor TO followkit_deletion_runtime WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
ALTER ROLE followkit_deletion_runtime SET statement_timeout='2s';
ALTER ROLE followkit_deletion_runtime SET lock_timeout='1s';
ALTER ROLE followkit_deletion_runtime SET idle_in_transaction_session_timeout='2s';
COMMIT;

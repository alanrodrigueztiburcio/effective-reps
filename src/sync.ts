import { createClient } from "@supabase/supabase-js";
import {
  db,
  exportBackup,
  restoreBackup,
  validateBackup,
  type Backup,
} from "./db";
import { fingerprint, mergeSnapshots } from "./syncMerge";
export const supabase = createClient(
  "https://nivzauhtjxwxyfelkpwk.supabase.co",
  "sb_publishable_vxSVekJk04PPUCCzSuVavw_Juamqlu8",
);
const ownerKey = "effective-reps-sync-owner";
const baselineKey = "effective-reps-sync-baseline";
export function downloadSnapshot(backup: Backup, prefix = "effective-reps") {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let running = false;
export async function syncWorkouts(cloudOnly = false) {
  if (running) return;
  running = true;
  try {
    const execute = async () => {
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!session) return "Sign in to sync.";
      const owner = localStorage.getItem(ownerKey);
      if (owner && owner !== session.user.id)
        throw new Error(
          "This browser’s data belongs to another account. Export a backup and clear site data before switching accounts.",
        );
      const { data, error } = await supabase
        .from("workout_sync")
        .select("payload,revision")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error)
        throw new Error(
          `Sync unavailable: ${error.message}. Check supabase/setup.sql has been run.`,
        );
      const local = await exportBackup();
      const stored = localStorage.getItem(baselineKey);
      const base = stored ? validateBackup(JSON.parse(stored)) : null;
      const remote = data ? validateBackup(data.payload) : null;
      let merged = remote
        ? cloudOnly
          ? remote
          : mergeSnapshots(base, local, remote)
        : local;
      // A new browser's empty/default settings must not override existing cloud preferences.
      if (
        !base &&
        remote &&
        !local.sessions.length &&
        !local.sets.length &&
        !local.settings.length
      )
        merged = { ...merged, settings: remote.settings };
      if (cloudOnly) downloadSnapshot(local, "before-cloud-restore");
      if (
        !remote ||
        remote.schemaVersion !== 3 ||
        fingerprint(merged) !== fingerprint(remote)
      ) {
        const { error } = await supabase.rpc("save_workout", {
          expected_revision: data?.revision || 0,
          new_payload: merged,
          expected_user: session.user.id,
        });
        if (error) throw error;
      }
      await db.transaction("rw", db.tables, async () => {
        // Network calls can outlast local edits: preserve those changes for the next retry.
        const latest = await exportBackup();
        const applied =
          fingerprint(latest) === fingerprint(local)
            ? merged
            : mergeSnapshots(local, latest, merged);
        if (fingerprint(applied) !== fingerprint(latest))
          await restoreBackup(applied, "replace");
      });
      localStorage.setItem(ownerKey, session.user.id);
      localStorage.setItem(baselineKey, JSON.stringify(merged));
      return `Synced ${new Date().toLocaleTimeString()}`;
    };
    return navigator.locks
      ? await navigator.locks.request("effective-reps-sync", execute)
      : await execute();
  } finally {
    running = false;
  }
}

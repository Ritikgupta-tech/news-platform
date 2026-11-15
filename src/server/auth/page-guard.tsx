import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { can, type PermissionKey } from "@/lib/permissions";
import { getAuthContext } from "./current-user";
import type { AuthContext } from "./guard";

/**
 * Page-level access control. Anonymous visitors are sent to log in (and brought back); signed-in users
 * without the permission see an explicit "not allowed" state. The APIs enforce the same rules independently.
 */
export async function requirePageAccess(nextPath: string, permission: PermissionKey): Promise<{ ctx: AuthContext } | { denied: ReactElement }> {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!can(ctx.roles, permission)) {
    return {
      denied: (
        <StateMessage kind="unauthorized" as="h1" title="You don’t have access to this page" action={<ButtonLink href="/" variant="secondary">Back to the homepage</ButtonLink>}>
          Your account doesn’t have the role this area needs. If you think that’s a mistake, ask an administrator.
        </StateMessage>
      ),
    };
  }
  return { ctx };
}

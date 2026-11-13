import "server-only";
import { currentSite } from "@/lib/db";
import { formSiteError } from "@/lib/access-rules";

// Forms that create something (or import) carry the location they were opened in, as
// the hidden field <SiteField /> (name "_site"). The session cookie is shared by every
// tab, so after a switch in another tab this keeps a save out of the wrong location.
export const SITE_FIELD = "_site";

export async function formSiteRefusal(formData: FormData): Promise<string | null> {
  const value = formData.get(SITE_FIELD);
  return formSiteError(typeof value === "string" ? value : null, (await currentSite()).code);
}

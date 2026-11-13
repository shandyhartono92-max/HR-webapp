"use client";

import { useEffect, useState } from "react";

// Hidden field with the location this page was opened in (see src/lib/form-site.ts).
// Read from the last_site cookie when the form appears: it is set at every login and
// location switch, so it matches the location the page was rendered for.
export function SiteField() {
  const [site, setSite] = useState("");
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)last_site=([^;]*)/);
    // Reading a cookie is browser-only, so it is set after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSite(match ? decodeURIComponent(match[1]) : "");
  }, []);
  return <input type="hidden" name="_site" value={site} />;
}

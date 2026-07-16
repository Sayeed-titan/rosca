import { redirect } from "next/navigation";

import { getActor } from "@/core/auth/session";
import { landingPathFor } from "@/core/auth/landing";

/**
 * The root is just a router: there is no marketing site here, and an empty landing
 * page would only add a click between a user and their committees.
 */
export default async function Home() {
  const actor = await getActor();
  redirect(actor ? landingPathFor(actor) : "/login");
}

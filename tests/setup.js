// Vitest runs outside Next, so it doesn't inherit Next's env loading.
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

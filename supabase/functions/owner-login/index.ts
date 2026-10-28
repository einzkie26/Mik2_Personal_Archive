import { createOwnerLoginHandler } from "./handler.ts";

Deno.serve(createOwnerLoginHandler({ env: Deno.env.toObject() }));

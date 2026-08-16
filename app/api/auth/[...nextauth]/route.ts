import { handlers } from "@/modules/identity/infrastructure/auth";

// Thin delivery adapter — translates HTTP into the Auth.js request/response
// cycle only. No business rule lives here (design.md, Technical Approach).
export const { GET, POST } = handlers;

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(128, "Use at most 128 characters."),
    confirmation: z.string(),
  })
  .refine((v) => v.password === v.confirmation, {
    message: "The passwords don’t match. Please try again.",
    path: ["confirmation"],
  });
export const RESET_SENT_MESSAGE =
  "If an account exists for that email, you’ll receive a password reset link. Check your inbox and spam folder.";
export async function requestPasswordReset(
  client: Pick<SupabaseClient, "auth">,
  email: string,
  origin: string,
) {
  const parsed = z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254)
    .safeParse(email);
  if (!parsed.success) throw new Error("Enter a valid email address.");
  const redirectTo = new URL("/reset-password", origin).href;
  const { error } = await client.auth.resetPasswordForEmail(parsed.data, {
    redirectTo,
  });
  // Never display backend details that could reveal whether an account exists.
  if (error)
    throw new Error(
      error.status === 429
        ? "Too many requests. Please wait a few minutes before trying again."
        : "We couldn’t send a reset link right now. Please try again later.",
    );
  return RESET_SENT_MESSAGE;
}
export async function updatePassword(
  client: Pick<SupabaseClient, "auth">,
  password: string,
  confirmation: string,
) {
  const parsed = passwordSchema.safeParse({ password, confirmation });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    throw new Error("Your reset session has expired. Request a new link.");
  const result = await client.auth.updateUser({
    password: parsed.data.password,
  });
  if (result.error)
    throw new Error(
      "We couldn’t update your password. The link may have expired, or the password may not meet your account’s security requirements. Request a new link or try a different password.",
    );
}

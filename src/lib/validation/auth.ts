import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("Enter a valid email address.");

// Students should be able to set a memorable but not-trivially-guessable
// password: at least 8 characters with a letter and a number.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Maps a Supabase Auth (or unexpected) error to a message safe and useful
 * to show a student, without leaking raw provider error text.
 */
export function mapAuthError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const lower = message.toLowerCase();

  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before logging in — check your inbox for the confirmation link.";
  }
  if (lower.includes("password") && lower.includes("least")) {
    return "Password is too short. Use at least 8 characters.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lower.includes("fetch failed") || lower.includes("network")) {
    return "Avela is temporarily unavailable. Please try again in a moment.";
  }

  // Log the technical detail server-side for debugging without exposing it.
  if (message) {
    console.error("[auth] unmapped Supabase error:", message);
  }
  return "Something went wrong. Please try again.";
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema, mapAuthError } from "@/lib/validation/auth";

export type AuthFormState = {
  errors?: {
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  message?: string;
  success?: boolean;
};

export async function login(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validated.data);

  if (error) {
    return { message: mapAuthError(error) };
  }

  redirect("/");
}

export async function signup(
  _state: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return { message: mapAuthError(error) };
  }

  // With email confirmation enabled, Supabase returns a user but no session
  // until the confirmation link is clicked — do not assume a session exists.
  if (data.user && !data.session) {
    return {
      success: true,
      message:
        "Check your email to confirm your account, then log in to continue.",
    };
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

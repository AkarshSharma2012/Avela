"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signup, type AuthFormState } from "@/lib/auth/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage variant="success">{state.message}</FormMessage>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {state.message && (
        <FormMessage variant="error">{state.message}</FormMessage>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.errors?.email)}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" errors={state.errors?.email} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
          aria-describedby={
            state.errors?.password ? "password-error" : "password-hint"
          }
        />
        <FieldError id="password-error" errors={state.errors?.password} />
        {!state.errors?.password && (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 8 characters, with a letter and a number.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.errors?.confirmPassword)}
          aria-describedby={
            state.errors?.confirmPassword ? "confirm-password-error" : undefined
          }
        />
        <FieldError
          id="confirm-password-error"
          errors={state.errors?.confirmPassword}
        />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export { SignupForm };

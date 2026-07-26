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
import { Spinner } from "@/components/ui/spinner";

const initialState: AuthFormState = {};

function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.success) {
    return (
      <div className="stagger-children flex flex-col gap-4">
        <div className="animate-fade-up">
          <FormMessage variant="success">{state.message}</FormMessage>
        </div>
        <Link
          href="/login"
          className="animate-fade-up text-sm font-medium text-primary hover:underline"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="stagger-children flex flex-col gap-5">
      {state.message && (
        <FormMessage variant="error">{state.message}</FormMessage>
      )}

      <div className="animate-fade-up flex flex-col gap-2">
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

      <div className="animate-fade-up flex flex-col gap-2">
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

      <div className="animate-fade-up flex flex-col gap-2">
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

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="animate-fade-up mt-2 w-full gap-2"
      >
        {pending && <Spinner className="text-primary-foreground" />}
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="animate-fade-up text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export { SignupForm };

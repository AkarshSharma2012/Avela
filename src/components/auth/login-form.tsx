"use client";

import { useActionState } from "react";
import Link from "next/link";

import { login, type AuthFormState } from "@/lib/auth/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const initialState: AuthFormState = {};

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

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
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.errors?.password)}
          aria-describedby={
            state.errors?.password ? "password-error" : undefined
          }
        />
        <FieldError id="password-error" errors={state.errors?.password} />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="animate-fade-up mt-2 w-full gap-2"
      >
        {pending && <Spinner className="text-primary-foreground" />}
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="animate-fade-up text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}

export { LoginForm };

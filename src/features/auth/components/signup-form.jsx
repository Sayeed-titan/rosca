"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupSchema } from "../schema";
import { signupAction } from "../actions";

function FormField({ id, label, hint, error, register, ...props }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...register(id)}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      organizationName: "",
      password: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values) {
    setFormError(null);

    startTransition(async () => {
      const result = await signupAction(values);

      if (!result.ok) {
        // Put server-side field errors (e.g. "email already registered") on the
        // input they belong to, rather than as a wall of text at the top.
        const fields = result.error.details?.fields;
        if (fields) {
          for (const [name, messages] of Object.entries(fields)) {
            setError(name, {
              type: "server",
              message: Array.isArray(messages) ? messages[0] : String(messages),
            });
          }
          setFormError("Please fix the highlighted fields.");
        } else {
          setFormError(result.error.message);
        }
        return;
      }

      router.push(result.data.redirectTo);
      // The session cookie is new; refresh so Server Components re-read it.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {formError && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <FormField
        id="name"
        label="Your name"
        type="text"
        autoComplete="name"
        placeholder="Kazi Abu Sayeed"
        error={errors.name}
        register={register}
      />

      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email}
        register={register}
      />

      <FormField
        id="organizationName"
        label="Organization name"
        type="text"
        autoComplete="organization"
        placeholder="Global Mediklaud (BD) Limited"
        hint="You'll be its owner. You can rename it later."
        error={errors.organizationName}
        register={register}
      />

      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        hint="At least 8 characters."
        error={errors.password}
        register={register}
      />

      <FormField
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        error={errors.confirmPassword}
        register={register}
      />

      <Button type="submit" className="w-full" size="lg" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Creating your organization…
          </>
        ) : (
          <>
            <UserPlus className="size-4" aria-hidden="true" />
            Create account
          </>
        )}
      </Button>
    </form>
  );
}

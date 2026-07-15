"use client";

import { Controller } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A labelled field with error text, wired for accessibility.
 *
 * The a11y wiring (htmlFor/id, aria-invalid, aria-describedby) is the reason this
 * exists: it's easy to get right once here and easy to forget on every individual
 * input. A screen reader user should hear the error, not just see a red border.
 */
export function Field({
  form,
  name,
  label,
  type = "text",
  placeholder,
  hint,
  required,
  multiline,
  className,
  ...rest
}) {
  const error = form.formState.errors[name];
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const Control = multiline ? Textarea : Input;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      <Control
        id={name}
        type={multiline ? undefined : type}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
          undefined
        }
        {...form.register(name)}
        {...rest}
      />

      {hint && !error && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}

/**
 * Select field.
 *
 * shadcn's Select is a Radix component, not a native <select>, so it has no
 * ref/onChange for `register` to attach to. Controller is the supported bridge.
 *
 * @param {{value: string, label: string}[]} options
 */
export function SelectField({
  form,
  name,
  label,
  options,
  placeholder = "Select…",
  hint,
  required,
  className,
}) {
  const error = form.formState.errors[name];
  const errorId = `${name}-error`;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger
              id={name}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="w-full"
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && (
        <p id={errorId} className="text-destructive text-xs">
          {error.message}
        </p>
      )}
    </div>
  );
}

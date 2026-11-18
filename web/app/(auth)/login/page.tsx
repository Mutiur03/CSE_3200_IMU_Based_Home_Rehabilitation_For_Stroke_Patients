"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TraceArt } from "@/components/trace-art";
import { Wordmark } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { HOME, useMe } from "@/lib/auth";

const schema = z.object({ email: z.string().min(1, "Enter your email"), password: z.string().min(1, "Enter your password") });
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (me.data) router.replace(HOME[me.data.role]);
  }, [me.data, router]);

  async function onSubmit(v: Form) {
    try {
      const { data, response } = await api.POST("/api/auth/login", { body: v });
      if (!data) {
        setError("root", { message: response.status === 401 ? "Email or password is wrong." : "Could not log in. Try again." });
        return;
      }
      qc.setQueryData(["me"], data);
      router.replace(HOME[data.role]);
    } catch {
      setError("root", { message: "Cannot reach the server. Check your connection." });
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-rail p-6 text-rail-foreground md:p-12 lg:min-h-dvh">
        <TraceArt className="pointer-events-none absolute inset-0 size-full opacity-40 lg:opacity-100" />
        <Wordmark className="relative" />
        <div className="relative mt-16 max-w-xl lg:mt-0">
          <h1 className="font-display text-[2.25rem] leading-[1.08] md:text-[3.5rem]">Rehabilitation at home, measured.</h1>
          <p className="mt-4 max-w-md text-base text-rail-muted md:text-lg">
            A wristband and a short daily game. Your doctor sees your movement quality score and adjusts your plan.
          </p>
        </div>
      </section>
      <section className="flex items-center px-6 py-12 md:px-16">
        <div className="w-full max-w-sm">
          <h2 className="text-[2rem] leading-tight">Log in</h2>
          <p className="mt-2 text-muted-foreground">Use the email and password from your clinic.</p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-5" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-base">Email</Label>
              <Input id="email" type="email" autoComplete="username" className="h-12 bg-card text-base" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined} {...register("email")} />
              {errors.email && <p id="email-err" className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password" className="text-base">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" className="h-12 bg-card text-base" aria-invalid={!!errors.password} aria-describedby={errors.password ? "pw-err" : undefined} {...register("password")} />
              {errors.password && <p id="pw-err" className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" size="lg" className="mt-1 h-12 text-base" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Log in</CardTitle>
          <CardDescription>IMU stroke rehabilitation</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" className="h-11 text-base" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined} {...register("email")} />
              {errors.email && <p id="email-err" className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" className="h-11 text-base" aria-invalid={!!errors.password} aria-describedby={errors.password ? "pw-err" : undefined} {...register("password")} />
              {errors.password && <p id="pw-err" className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
            <Button type="submit" className="h-11 text-base" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

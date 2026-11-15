import { z } from "zod";
import { passwordSchema } from "./password";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

const timezoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone");

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, "Name is too short").max(80),
  password: passwordSchema,
  timezone: timezoneSchema.optional(),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

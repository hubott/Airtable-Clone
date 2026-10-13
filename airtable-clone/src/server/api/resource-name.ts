import { z } from "zod";

export const resourceName = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(100, "Use at most 100 characters");

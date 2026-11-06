import { PrismaClient } from "@prisma/client";

// Single Prisma client instance for the whole service.
export const prisma = new PrismaClient();

import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, isAdminEmail, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  clearSession,
  createSession,
  getSessionId,
  hashPassword,
  SESSION_COOKIE,
  SESSION_TTL,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.get("/auth/user", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetCurrentAuthUserResponse.parse({ user: req.isAuthenticated() ? req.user : null }));
});

router.post("/auth/register", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
  const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: hashPassword(password),
        firstName: firstName || null,
        lastName: lastName || null,
      })
      .returning();

    const user = {
      id: created.id,
      email: created.email,
      firstName: created.firstName,
      lastName: created.lastName,
      profileImageUrl: created.profileImageUrl,
      isAdmin: isAdminEmail(created.email),
    };

    const sid = await createSession({ user });
    setSessionCookie(res, sid);
    return res.status(201).json({ user });
  } catch (error) {
    req.log.error({ err: error }, "Registration failed");
    return res.status(500).json({ error: "We couldn't create your account right now." });
  }
});

router.post("/auth/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).json({ error: "Please enter both your email and password." });
  }

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!existing || !existing.passwordHash || !verifyPassword(password, existing.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = {
      id: existing.id,
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      profileImageUrl: existing.profileImageUrl,
      isAdmin: isAdminEmail(existing.email),
    };

    const sid = await createSession({ user });
    setSessionCookie(res, sid);
    return res.json({ user });
  } catch (error) {
    req.log.error({ err: error }, "Login failed");
    return res.status(500).json({ error: "We couldn't log you in right now." });
  }
});

router.post("/auth/logout", async (req, res) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  return res.json({ ok: true });
});

export default router;

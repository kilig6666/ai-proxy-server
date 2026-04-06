import { Router, type IRouter, type Request, type Response } from "express";
import { getConfig, updateConfig, createAdminToken, validateAdminToken, revokeAdminToken } from "../lib/config.js";

const router: IRouter = Router();

router.post("/config/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const cfg = getConfig();
  if (!password || password !== cfg.portalPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = createAdminToken();
  res.json({ token });
});

router.post("/config/logout", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    revokeAdminToken(auth.slice(7));
  }
  res.json({ ok: true });
});

router.get("/config/settings", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const cfg = getConfig();
  res.json({ proxyApiKey: cfg.proxyApiKey });
});

router.post("/config/settings", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { proxyApiKey, portalPassword } = req.body as { proxyApiKey?: string; portalPassword?: string };
  const updates: Partial<{ proxyApiKey: string; portalPassword: string }> = {};
  if (proxyApiKey && proxyApiKey.trim()) updates.proxyApiKey = proxyApiKey.trim();
  if (portalPassword && portalPassword.trim()) updates.portalPassword = portalPassword.trim();
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const cfg = updateConfig(updates);
  res.json({ ok: true, proxyApiKey: cfg.proxyApiKey });
});

export default router;

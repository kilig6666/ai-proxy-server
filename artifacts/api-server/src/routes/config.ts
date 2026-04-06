import { Router, type IRouter, type Request, type Response } from "express";
import { getConfig, updateConfig, createAdminToken, validateAdminToken, revokeAdminToken } from "../lib/config.js";
import { fetchCredits, buildCreditsJson } from "../lib/credits.js";

const router: IRouter = Router();

router.post("/config/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const cfg = getConfig();
  if (!password || password !== cfg.portalPassword) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  const token = createAdminToken();
  res.json({ token, proxyApiKey: cfg.proxyApiKey });
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
  res.json({
    proxyApiKey: cfg.proxyApiKey,
    openaiDirectKeySet: !!(cfg.openaiDirectKey?.trim()),
  });
});

router.post("/config/settings", (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { proxyApiKey, portalPassword, openaiDirectKey } = req.body as {
    proxyApiKey?: string; portalPassword?: string; openaiDirectKey?: string;
  };
  const updates: Partial<{ proxyApiKey: string; portalPassword: string; openaiDirectKey: string }> = {};
  if (proxyApiKey && proxyApiKey.trim()) updates.proxyApiKey = proxyApiKey.trim();
  if (portalPassword && portalPassword.trim()) updates.portalPassword = portalPassword.trim();
  if (openaiDirectKey !== undefined) updates.openaiDirectKey = openaiDirectKey.trim();
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const cfg = updateConfig(updates);
  res.json({ ok: true, proxyApiKey: cfg.proxyApiKey, openaiDirectKeySet: !!(cfg.openaiDirectKey?.trim()) });
});

router.get("/credits", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ") || !validateAdminToken(auth.slice(7))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await fetchCredits();
  if (result.needsKey) {
    res.json({ needs_key: true, error: result.error });
    return;
  }
  if (!result.ok) {
    res.status(503).json({ error: result.error ?? "Credits unavailable" });
    return;
  }
  res.json(buildCreditsJson(result));
});

export default router;

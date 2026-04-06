import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

export interface AppConfig {
  proxyApiKey: string;
  portalPassword: string;
}

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../config.json",
);

const DEFAULTS: AppConfig = {
  proxyApiKey: process.env.PROXY_API_KEY ?? "admin123",
  portalPassword: process.env.PORTAL_PASSWORD ?? "admin123",
};

function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg: AppConfig): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save config:", e);
  }
}

let _config: AppConfig = loadConfig();

export function getConfig(): AppConfig {
  return _config;
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  _config = { ..._config, ...partial };
  saveConfig(_config);
  return _config;
}

const _adminTokens = new Map<string, number>();

export function createAdminToken(): string {
  const token = crypto.randomBytes(24).toString("hex");
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  _adminTokens.set(token, expiry);
  return token;
}

export function validateAdminToken(token: string): boolean {
  const expiry = _adminTokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    _adminTokens.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminToken(token: string): void {
  _adminTokens.delete(token);
}

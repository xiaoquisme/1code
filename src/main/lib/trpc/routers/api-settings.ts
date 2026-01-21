import { eq } from "drizzle-orm"
import { safeStorage } from "electron"
import { z } from "zod"
import { apiSettings, getDatabase } from "../../db"
import { publicProcedure, router } from "../index"

/**
 * Encrypt token using Electron's safeStorage
 */
function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(token, "utf-8").toString("base64")
  }
  const encrypted = safeStorage.encryptString(token)
  return encrypted.toString("base64")
}

/**
 * Decrypt token using Electron's safeStorage
 */
function decryptToken(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, "base64").toString("utf-8")
  }
  const buffer = Buffer.from(encrypted, "base64")
  return safeStorage.decryptString(buffer)
}

export const apiSettingsRouter = router({
  /**
   * Get current API settings (without exposing the full API key)
   */
  get: publicProcedure.query(() => {
    try {
      const db = getDatabase()
      const settings = db
        .select()
        .from(apiSettings)
        .where(eq(apiSettings.id, "default"))
        .get()

      if (!settings) {
        return {
          configured: false,
          apiHost: "https://api.anthropic.com",
          hasApiKey: false,
          configuredAt: null,
        }
      }

      return {
        configured: true,
        apiHost: settings.apiHost || "https://api.anthropic.com",
        hasApiKey: !!settings.apiKey,
        // Mask the API key for display (show only last 4 chars)
        apiKeyPreview: settings.apiKey
          ? `sk-...${decryptToken(settings.apiKey).slice(-4)}`
          : null,
        configuredAt: settings.configuredAt,
      }
    } catch (error) {
      console.error("[api-settings] Error getting settings:", error)
      return {
        configured: false,
        apiHost: "https://api.anthropic.com",
        hasApiKey: false,
        configuredAt: null,
      }
    }
  }),

  /**
   * Save API settings
   */
  save: publicProcedure
    .input(
      z.object({
        apiKey: z.string().min(1, "API key is required"),
        apiHost: z.string().url().optional(),
      })
    )
    .mutation(({ input }) => {
      const db = getDatabase()

      // Encrypt the API key
      const encryptedKey = encryptToken(input.apiKey)
      const host = input.apiHost || "https://api.anthropic.com"

      // Check if settings already exist
      const existing = db
        .select()
        .from(apiSettings)
        .where(eq(apiSettings.id, "default"))
        .get()

      if (existing) {
        // Update existing settings
        db.update(apiSettings)
          .set({
            apiKey: encryptedKey,
            apiHost: host,
            configuredAt: new Date(),
          })
          .where(eq(apiSettings.id, "default"))
          .run()
      } else {
        // Insert new settings
        db.insert(apiSettings)
          .values({
            id: "default",
            apiKey: encryptedKey,
            apiHost: host,
            configuredAt: new Date(),
          })
          .run()
      }

      console.log(`[api-settings] API settings saved with host: ${host}`)
      return { success: true }
    }),

  /**
   * Clear API settings (disconnect)
   */
  clear: publicProcedure.mutation(() => {
    const db = getDatabase()
    db.delete(apiSettings).where(eq(apiSettings.id, "default")).run()
    console.log("[api-settings] API settings cleared")
    return { success: true }
  }),

  /**
   * Validate API key by making a test request
   */
  validate: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        apiHost: z.string().url().optional(),
        skipValidation: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const host = input.apiHost || "https://api.anthropic.com"
      const isCustomHost = host !== "https://api.anthropic.com"

      // Skip validation for custom hosts if requested (proxies may not support validation)
      if (input.skipValidation && isCustomHost) {
        console.log("[api-settings] Skipping validation for custom host:", host)
        return { valid: true, warning: "Validation skipped for custom host" }
      }

      try {
        // Build headers based on whether it's official API or custom proxy
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        }

        if (isCustomHost) {
          // For custom proxies, use Authorization header with Bearer token
          headers["Authorization"] = `Bearer ${input.apiKey}`
        } else {
          // For official Anthropic API, use x-api-key
          headers["x-api-key"] = input.apiKey
        }

        // Make a minimal API request to validate the key
        const response = await fetch(`${host}/v1/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        })

        // Check response - 200 means valid, 401 means invalid key
        if (response.ok) {
          return { valid: true }
        }

        const errorData = await response.json().catch(() => ({}))

        if (response.status === 401) {
          return { valid: false, error: "Invalid API key" }
        }

        if (response.status === 403) {
          return { valid: false, error: "API key does not have required permissions" }
        }

        // Other errors might be fine (rate limit, etc.) - key is still valid
        if (response.status === 429) {
          return { valid: true, warning: "Rate limited but key appears valid" }
        }

        return {
          valid: false,
          error: errorData.error?.message || `API returned status ${response.status}`,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("[api-settings] Validation error:", errorMessage)

        // Network errors might mean wrong host
        if (errorMessage.includes("fetch") || errorMessage.includes("ECONNREFUSED")) {
          return { valid: false, error: `Cannot connect to ${host}. Please check the API host.` }
        }

        return { valid: false, error: errorMessage }
      }
    }),
})

/**
 * Get decrypted API key and host for use in Claude SDK
 * Returns null if not configured
 */
export function getApiSettings(): { apiKey: string; apiHost: string } | null {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(apiSettings)
      .where(eq(apiSettings.id, "default"))
      .get()

    if (!settings?.apiKey) {
      return null
    }

    return {
      apiKey: decryptToken(settings.apiKey),
      apiHost: settings.apiHost || "https://api.anthropic.com",
    }
  } catch (error) {
    console.error("[api-settings] Error getting API settings:", error)
    return null
  }
}

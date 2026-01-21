"use client"

import { useState } from "react"
import { useSetAtom } from "jotai"

import { Input } from "../../components/ui/input"
import { ClaudeCodeIcon, IconSpinner } from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { trpc } from "../../lib/trpc"
import { anthropicOnboardingCompletedAtom } from "../../lib/atoms"

type ConfigState =
  | { step: "idle" }
  | { step: "validating" }
  | { step: "saving" }
  | { step: "error"; message: string }

export function ApiConfigPage() {
  const [configState, setConfigState] = useState<ConfigState>({ step: "idle" })
  const [apiKey, setApiKey] = useState("")
  const [apiHost, setApiHost] = useState("https://api.anthropic.com")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [skipValidation, setSkipValidation] = useState(false)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom
  )

  // tRPC mutations
  const validateMutation = trpc.apiSettings.validate.useMutation()
  const saveMutation = trpc.apiSettings.save.useMutation()

  const isLoading = configState.step === "validating" || configState.step === "saving"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!apiKey.trim()) {
      setConfigState({ step: "error", message: "API key is required" })
      return
    }

    // Validate API key
    setConfigState({ step: "validating" })

    try {
      const result = await validateMutation.mutateAsync({
        apiKey: apiKey.trim(),
        apiHost: apiHost.trim() || undefined,
        skipValidation: skipValidation,
      })

      if (!result.valid) {
        setConfigState({
          step: "error",
          message: result.error || "Invalid API key",
        })
        return
      }

      // Save settings
      setConfigState({ step: "saving" })
      await saveMutation.mutateAsync({
        apiKey: apiKey.trim(),
        apiHost: apiHost.trim() || undefined,
      })

      // Success - mark onboarding as completed
      setAnthropicOnboardingCompleted(true)
    } catch (err) {
      setConfigState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to save settings",
      })
    }
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background select-none">
      {/* Draggable title bar area */}
      <div
        className="fixed top-0 left-0 right-0 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <div className="w-full max-w-[440px] space-y-8 px-4">
        {/* Header with dual icons */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 p-2 mx-auto w-max rounded-full border border-border">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <Logo className="w-5 h-5" fill="white" />
            </div>
            <div className="w-10 h-10 rounded-full bg-[#D97757] flex items-center justify-center">
              <ClaudeCodeIcon className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">
              Configure API Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your Anthropic API key to get started
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="apiKey"
              className="text-sm font-medium text-foreground"
            >
              API Key
            </label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                if (configState.step === "error") {
                  setConfigState({ step: "idle" })
                }
              }}
              placeholder="sk-ant-api03-..."
              className="font-mono"
              autoFocus
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <button
                type="button"
                onClick={() => window.open("https://console.anthropic.com/settings/keys", "_blank")}
                className="text-primary hover:underline"
              >
                console.anthropic.com
              </button>
            </p>
          </div>

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <span className="text-xs">{showAdvanced ? "▼" : "▶"}</span>
            Advanced Settings
          </button>

          {/* Advanced settings */}
          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              <div className="space-y-2">
                <label
                  htmlFor="apiHost"
                  className="text-sm font-medium text-foreground"
                >
                  API Host
                </label>
                <Input
                  id="apiHost"
                  type="url"
                  value={apiHost}
                  onChange={(e) => setApiHost(e.target.value)}
                  placeholder="https://api.anthropic.com"
                  className="font-mono text-sm"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Custom API endpoint for proxies or compatible services
                </p>
              </div>

              {/* Skip validation checkbox - only show for custom hosts */}
              {apiHost !== "https://api.anthropic.com" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipValidation}
                    onChange={(e) => setSkipValidation(e.target.checked)}
                    className="rounded border-border"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-muted-foreground">
                    Skip validation (for proxies that don't support test requests)
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Error State */}
          {configState.step === "error" && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{configState.message}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !apiKey.trim()}
            className="w-full h-8 px-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97] shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] dark:shadow-[0_0_0_0.5px_rgb(23,23,23),inset_0_0_0_1px_rgba(255,255,255,0.14)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <IconSpinner className="h-4 w-4" />
            ) : (
              "Connect"
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

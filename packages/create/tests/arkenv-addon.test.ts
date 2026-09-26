import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  finalizeAddOns,
  populateAddOnOptionsDefaults,
} from '../src/add-ons.js'
import { createApp } from '../src/create-app.js'
import { createMemoryEnvironment } from '../src/environment.js'
import { createFrameworkDefinition } from '../src/frameworks/react/index.js'

import type { Framework, FrameworkDefinition, Options } from '../src/types.js'

function frameworkFromDefinition(definition: FrameworkDefinition): Framework {
  const { addOns, base, ...framework } = definition

  return {
    ...framework,
    getFiles: () => Promise.resolve(Object.keys(base)),
    getFileContents: (path: string) => Promise.resolve(base[path]),
    getDeletedFiles: () => Promise.resolve([]),
    getAddOns: () => addOns,
  }
}

async function generateArkEnvApp(validator?: string) {
  const definition = createFrameworkDefinition()
  const framework = frameworkFromDefinition(definition)
  const chosenAddOns = await finalizeAddOns(framework, 'file-router', ['arkenv'])
  const targetDir = '/arkenv-app'
  const { environment, output } = createMemoryEnvironment(targetDir)

  await createApp(environment, {
    projectName: 'arkenv-app',
    targetDir,
    framework,
    mode: 'file-router',
    typescript: true,
    tailwind: true,
    packageManager: 'pnpm',
    git: false,
    install: false,
    intent: false,
    chosenAddOns,
    addOnOptions: {
      ...populateAddOnOptionsDefaults(chosenAddOns),
      ...(validator ? { arkenv: { validator } } : {}),
    },
    includeExamples: true,
  } satisfies Options)

  return output
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ArkEnv add-on', () => {
  it('uses the ArkType Vite plugin by default and keeps the database endpoint off the demo page', async () => {
    const output = await generateArkEnvApp()
    const demo = output.files['src/routes/demo/arkenv.tsx']

    expect(output.files['vite.config.ts']).toContain(
      "import arkenv from '@arkenv/vite-plugin'",
    )
    expect(output.files['vite.config.ts']).not.toContain(
      '@arkenv/vite-plugin/standard',
    )
    expect(output.files['src/env.ts']).toContain("from '@arkenv/core'")
    expect(demo).toContain("host: 'localhost:5432'")
    expect(demo).toContain("protocol: 'postgresql:'")
    expect(demo).not.toContain('new URL')
    expect(demo).not.toContain('url.host')
  })

  it.each(['zod', 'valibot'])(
    'uses the standard Vite plugin for %s',
    async (validator) => {
      const output = await generateArkEnvApp(validator)

      expect(output.files['vite.config.ts']).toContain(
        "import arkenv from '@arkenv/vite-plugin/standard'",
      )
      expect(output.files['src/env.ts']).toContain("from '@arkenv/standard'")
    },
  )

  it('rejects out-of-range ports in the Valibot schema', async () => {
    const output = await generateArkEnvApp('valibot')
    const env = output.files['src/env.ts']

    expect(env).toContain('v.minValue(1)')
    expect(env).toContain('v.maxValue(65535)')
  })
})

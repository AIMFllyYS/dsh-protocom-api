/**
 * Web client half of the Protocom API plugin: registers the copy namespace,
 * injects the section stylesheet, and contributes the `protocom-api` section
 * to the settings page (`settings.section` slot). The Host half resolves the
 * API keys the section stores and serves the balance endpoint it reads.
 *
 * @module dsh-protocom-api/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ProtocomSection } from './ProtocomSection.tsx'
import type { ProtocomInjected } from './ProtocomSection.tsx'
import { createProtocomOperations } from './operations.ts'
import { en, zh } from './locale.ts'
import type { ProtocomKey } from './locale.ts'
import { SECTION_CSS } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.protocom': ProtocomKey
  }
}

/** The locale namespace this section owns. */
const NS = 'settings.protocom' as const

export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.credentials',
  'remote.llm',
  'remote.settings',
]

/** Wire the section into the settings page. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))

  const operations = createProtocomOperations(ctx)
  const t = ctx.locale.bind(NS)
  const injected = (): ProtocomInjected => ({ operations, t })

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset['plugin'] = 'dsh-protocom-api'
    tag.textContent = SECTION_CSS
    document.head.appendChild(tag)
    return () => { tag.remove() }
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'protocom-api',
    order: 20,
    label: () => t('nav'),
    inject: injected,
  }, ProtocomSection))
}

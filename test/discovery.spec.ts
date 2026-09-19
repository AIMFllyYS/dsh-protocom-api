import { describe, expect, it } from 'vitest'
import { parseModelsListing } from '../src/discovery.ts'

describe('model listing parsing', () => {
  it('reads the standard OpenAI data array', () => {
    const models = parseModelsListing({
      object: 'list',
      data: [
        { id: 'deepseek/deepseek-v4.1-flash', object: 'model', created: 1, owned_by: 'openai', type: 'model', display_name: 'deepseek/deepseek-v4.1-flash' },
        { id: 'gpt-5.6-sol', object: 'model', display_name: 'GPT-5.6 Sol' },
      ],
    })
    expect(models).toEqual([
      { id: 'deepseek/deepseek-v4.1-flash', displayName: 'deepseek/deepseek-v4.1-flash' },
      { id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' },
    ])
  })

  it('reads Anthropic-style entries with display_name and capacities', () => {
    const models = parseModelsListing({
      data: [
        { id: 'claude-ish', display_name: 'Claude-ish', context_length: 200_000, max_output_tokens: 8_192 },
      ],
    })
    expect(models).toEqual([
      { id: 'claude-ish', displayName: 'Claude-ish', contextWindow: 200_000, maxTokens: 8_192 },
    ])
  })

  it('reads grok-style reasoning capability metadata', () => {
    const models = parseModelsListing({
      data: [
        { id: 'grok-4.x', supportsReasoningEffort: true, reasoningEfforts: ['low', 'high'] },
        { id: 'grok-mini', supports_reasoning_effort: true, reasoning_efforts: ['minimal', 'high'] },
      ],
    })
    expect(models).toEqual([
      { id: 'grok-4.x', supportsReasoningEffort: true, reasoningEfforts: ['low', 'high'] },
      { id: 'grok-mini', supportsReasoningEffort: true, reasoningEfforts: ['minimal', 'high'] },
    ])
  })

  it('accepts a top-level models array and skips unusable rows', () => {
    const models = parseModelsListing({
      models: [
        { id: 'ok' },
        { name: 'no id here' },
        42,
        null,
      ],
    })
    expect(models).toEqual([{ id: 'ok' }])
  })

  it('refuses a reply with no recognizable listing', () => {
    expect(() => parseModelsListing({ hello: 'world' })).toThrowError(/neither a "data" nor a "models" array/)
  })
})

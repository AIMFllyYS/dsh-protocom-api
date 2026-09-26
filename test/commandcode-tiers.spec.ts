// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { commandCodeReasoning } from '../src/commandcode-tiers.ts'

describe('Command Code effort tiers (R3)', () => {
  it('gives each model its own vocabulary, none of them uniform', () => {
    // The tiers are per-model, so a single group-wide list would send levels a
    // model refuses. These four are the shapes the catalog actually publishes.
    expect(commandCodeReasoning('deepseek/deepseek-v4-pro')?.efforts).toEqual(['high', 'max'])
    expect(commandCodeReasoning('deepseek/deepseek-v4.1-flash')?.efforts).toEqual(['low', 'high', 'max'])
    expect(commandCodeReasoning('gpt-5.6-sol')?.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(commandCodeReasoning('Qwen/Qwen3.8-Max')?.efforts).toEqual(['low', 'medium', 'xhigh'])
  })

  it('reports nothing for a model the vendor accepts no effort for', () => {
    // An empty list in the catalog means the model picks its own depth. The CLI
    // sends no effort field for these, so inventing one would be an unsupported
    // parameter; offering no control is the correct rendering.
    for (const id of ['moonshotai/Kimi-K2.6', 'zai-org/GLM-5', 'MiniMaxAI/MiniMax-M2.5']) {
      expect(commandCodeReasoning(id)).toBeUndefined()
    }
  })

  it('defaults to high wherever the model accepts it', () => {
    // The vendor CLI sends no effort until one is chosen, and high is the level
    // its docs lead with.
    expect(commandCodeReasoning('gpt-5.6-sol')?.defaultEffort).toBe('high')
    expect(commandCodeReasoning('deepseek/deepseek-v4-pro')?.defaultEffort).toBe('high')
    expect(commandCodeReasoning('sakana/fugu-ultra')?.efforts).toEqual(['high', 'xhigh'])
    expect(commandCodeReasoning('sakana/fugu-ultra')?.defaultEffort).toBe('high')
  })

  it('never offers a level the catalog does not list for that model', () => {
    const deepseek = commandCodeReasoning('deepseek/deepseek-v4-pro')
    // low and medium belong to OTHER models; offering them here is a request
    // the model refuses.
    expect(deepseek?.efforts).not.toContain('low')
    expect(deepseek?.efforts).not.toContain('medium')
  })

  it('leaves an unknown id alone rather than guessing a vocabulary', () => {
    expect(commandCodeReasoning('someone/brand-new-model')).toBeUndefined()
  })
})

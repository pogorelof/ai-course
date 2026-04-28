import type { ReasoningEffort } from '../types/domain'

const NITRO_SUFFIX = ':nitro'
const PROVIDER_PREFIXES = ['openai/', 'anthropic/', 'google/', 'deepseek/']
const REASONING_PREFIXES = ['gpt-5', 'claude-', 'deepseek-v4-pro', 'gemini-3.1-pro', 'o1', 'o3', 'o4']

function normalize(model: string): string {
  let base = (model || '').trim().toLowerCase()
  if (base.endsWith(NITRO_SUFFIX)) base = base.slice(0, -NITRO_SUFFIX.length)
  for (const prefix of PROVIDER_PREFIXES) {
    if (base.startsWith(prefix)) {
      base = base.slice(prefix.length)
      break
    }
  }
  return base
}

export function modelSupportsReasoning(model: string | null | undefined): boolean {
  if (!model) return false
  const base = normalize(model)
  return REASONING_PREFIXES.some(prefix => base.startsWith(prefix))
}

export const REASONING_EFFORT_OPTIONS: ReadonlyArray<{ id: ReasoningEffort; label: string; hint: string }> = [
  { id: 'minimal', label: 'Минимум', hint: 'самый быстрый ответ, почти без reasoning' },
  { id: 'low', label: 'Низкий', hint: 'короткое размышление' },
  { id: 'medium', label: 'Средний', hint: 'дефолт OpenAI' },
  { id: 'high', label: 'Высокий', hint: 'максимально подробное reasoning' },
]

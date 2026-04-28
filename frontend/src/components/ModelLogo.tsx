type SupportedProvider = 'openai' | 'openrouter'

const normalizeModelBase = (model: string | null | undefined) => {
  if (!model) return ''
  const normalized = model.toLowerCase()
  const slashIdx = normalized.lastIndexOf('/')
  return slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
}

const isOpenAIModel = (model: string | null | undefined) => {
  const base = normalizeModelBase(model)
  return base.startsWith('gpt-') || base.startsWith('o1') || base.startsWith('o3') || base.startsWith('o4')
}

const isDeepSeekModel = (model: string | null | undefined) => {
  return normalizeModelBase(model).startsWith('deepseek-')
}

const isClaudeModel = (model: string | null | undefined) => {
  return normalizeModelBase(model).startsWith('claude-')
}

const isGeminiModel = (model: string | null | undefined) => {
  return normalizeModelBase(model).startsWith('gemini-')
}

const isGemmaModel = (model: string | null | undefined) => {
  return normalizeModelBase(model).startsWith('gemma-')
}

export function ModelLogo({ size = 14, model, provider }: { size?: number; model?: string | null; provider?: SupportedProvider }) {
  let src: string | null = null
  let alt = ''

  if (isDeepSeekModel(model)) {
    src = '/deepseek.svg'
    alt = 'DeepSeek'
  } else if (isClaudeModel(model)) {
    src = '/claude.svg'
    alt = 'Claude'
  } else if (isGeminiModel(model) || isGemmaModel(model)) {
    src = '/gemini.svg'
    alt = isGeminiModel(model) ? 'Gemini' : 'Gemma'
  } else if (provider === 'openai' || isOpenAIModel(model)) {
    src = '/openai.svg'
    alt = 'OpenAI'
  } else if (provider === 'openrouter') {
    src = '/deepseek.svg'
    alt = 'OpenRouter'
  }

  if (!src) return null

  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        objectFit: 'contain',
      }}
    />
  )
}

import type { ReasoningEffort } from '../types/domain'
import { REASONING_EFFORT_OPTIONS, modelSupportsReasoning } from '../utils/reasoning'

export function ReasoningEffortPicker({
  model,
  value,
  onChange,
  disabled,
}: {
  model: string | null | undefined
  value: ReasoningEffort
  onChange: (next: ReasoningEffort) => void
  disabled?: boolean
}) {
  if (!modelSupportsReasoning(model)) return null
  return (
    <div className="reasoning-picker">
      <span className="reasoning-picker-label">Ризонинг</span>
      <div className="reasoning-picker-chips" role="radiogroup" aria-label="Reasoning effort">
        {REASONING_EFFORT_OPTIONS.map(option => {
          const active = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`reasoning-chip ${active ? 'reasoning-chip--active' : ''}`}
              title={option.hint}
              onClick={() => onChange(option.id)}
              disabled={disabled}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="reasoning-picker-note">
        Меньше ризонинга — быстрее первый токен, но ответ может быть проще. «Минимум» = практически отключено.
      </p>
    </div>
  )
}

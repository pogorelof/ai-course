export function OpenAILogo({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/openai.svg"
      alt="OpenAI"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        objectFit: 'contain',
      }}
    />
  )
}

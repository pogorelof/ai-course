export function PageContainer({
  children,
  tone = 'light',
  fullWidth = false
}: {
  children: React.ReactNode
  tone?: 'light' | 'dark'
  fullWidth?: boolean
}) {
  return (
    <main className={`app-page app-page--${tone}`}>
      <div className={fullWidth ? undefined : 'app-container'}>
        {children}
      </div>
    </main>
  )
}



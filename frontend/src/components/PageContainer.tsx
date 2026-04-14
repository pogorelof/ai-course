export function PageContainer({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      color: '#e5e7eb'
    }}>
      <main
        className="glass-surface"
        style={{
          maxWidth: fullWidth ? 'none' : 960,
          margin: fullWidth ? '24px 16px' : '24px auto',
          padding: '24px 16px',
          borderRadius: 16
        }}
      >
        {children}
      </main>
    </div>
  )
}



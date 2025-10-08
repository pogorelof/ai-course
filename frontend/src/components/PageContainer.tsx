export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      color: '#e5e7eb'
    }}>
      <main className="glass-surface" style={{ maxWidth: 960, margin: '24px auto', padding: '24px 16px', borderRadius: 16 }}>
        {children}
      </main>
    </div>
  )
}



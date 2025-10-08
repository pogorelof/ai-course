export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      color: '#111827'
    }}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  )
}



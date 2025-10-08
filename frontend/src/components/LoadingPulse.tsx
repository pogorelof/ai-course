export function LoadingPulse() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#2563eb', animation: 'pulse 1.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#60a5fa', animation: 'pulse 1.2s 0.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#93c5fd', animation: 'pulse 1.2s 0.4s infinite ease-in-out' }} />
      <style>{`@keyframes pulse {0%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}100%{opacity:.3;transform:translateY(0)}}`}</style>
    </div>
  )
}



export function LoadingPulse() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0071e3', animation: 'applePulse 1.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0, 0, 0, 0.48)', animation: 'applePulse 1.2s 0.2s infinite ease-in-out' }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0, 0, 0, 0.32)', animation: 'applePulse 1.2s 0.4s infinite ease-in-out' }} />
      <style>{`@keyframes applePulse {0%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}100%{opacity:.35;transform:translateY(0)}}`}</style>
    </div>
  )
}



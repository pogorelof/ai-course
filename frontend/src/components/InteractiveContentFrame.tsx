import { useEffect, useMemo, useRef, useState } from 'react'

const RESIZE_BEACON = `
<script>
(function () {
  var lastHeight = 0;
  function send() {
    try {
      var docEl = document.documentElement;
      var body = document.body;
      var h = Math.max(
        docEl ? docEl.scrollHeight : 0,
        body ? body.scrollHeight : 0
      );
      if (h && h !== lastHeight) {
        lastHeight = h;
        parent.postMessage({ __interactive_lesson_height: h }, '*');
      }
    } catch (err) { /* noop */ }
  }
  window.addEventListener('load', send);
  window.addEventListener('resize', send);
  if (window.ResizeObserver && document.body) {
    try { new ResizeObserver(send).observe(document.body); } catch (e) { /* noop */ }
  }
  setInterval(send, 750);
})();
</script>
`

function injectResizeBeacon(html: string): string {
  const lower = html.toLowerCase()
  const closingBody = lower.lastIndexOf('</body>')
  if (closingBody === -1) {
    return `${html}${RESIZE_BEACON}`
  }
  return `${html.slice(0, closingBody)}${RESIZE_BEACON}${html.slice(closingBody)}`
}

export function InteractiveContentFrame({
  html,
  title = 'Интерактивная глава',
  minHeight = 1200,
  maxHeight = 12000,
}: {
  html: string
  title?: string
  minHeight?: number
  maxHeight?: number
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState<number>(minHeight)

  const preparedHtml = useMemo(() => injectResizeBeacon(html), [html])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current) return
      if (event.source !== iframeRef.current.contentWindow) return
      const data = event.data as { __interactive_lesson_height?: number } | null | undefined
      if (data && typeof data.__interactive_lesson_height === 'number') {
        const next = Math.min(maxHeight, Math.max(minHeight, Math.round(data.__interactive_lesson_height)))
        setHeight(prev => (Math.abs(prev - next) > 4 ? next : prev))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [maxHeight, minHeight])

  useEffect(() => {
    setHeight(minHeight)
  }, [preparedHtml, minHeight])

  const openInNewTab = () => {
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const objectUrl = URL.createObjectURL(blob)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="interactive-frame">
      <div className="interactive-frame-toolbar">
        <span className="interactive-frame-toolbar-title">Интерактивная глава</span>
        <button type="button" className="btn btn-pill" onClick={openInNewTab}>
          Открыть в новом окне
        </button>
      </div>
      <iframe
        ref={iframeRef}
        title={title}
        sandbox="allow-scripts"
        srcDoc={preparedHtml}
        style={{
          width: '100%',
          minHeight,
          height,
          border: '0',
          borderRadius: 8,
          background: '#ffffff',
          display: 'block',
        }}
      />
    </div>
  )
}

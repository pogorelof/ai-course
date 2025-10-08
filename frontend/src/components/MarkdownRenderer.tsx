import { useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import java from 'highlight.js/lib/languages/java'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'

// Register common languages once (module scope)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('java', java)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)

export function MarkdownRenderer({ markdown }: { markdown: string }) {
  const html = toHtml(markdown)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const run = () => {
      if (!containerRef.current) return
      const codeBlocks = containerRef.current.querySelectorAll('pre code')
      codeBlocks.forEach(el => {
        const node = el as HTMLElement
        if (node.dataset.highlighted === 'yes') return
        try { hljs.highlightElement(node) } catch {}
      })
    }
    const raf = requestAnimationFrame(() => setTimeout(run, 0))
    return () => cancelAnimationFrame(raf)
  }, [html])

  return (
    <div
      ref={containerRef}
      className="prose"
      style={{ background: 'transparent', borderRadius: 10, padding: 4, textAlign: 'left', lineHeight: 1.6, color: '#e5e7eb' }}
    >
      <style>{`
        .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 { margin: 0.7em 0 0.35em; font-weight: 700; color: #f8fafc; }
        .prose p { margin: 0.45em 0; color: #e5e7eb; }
        .prose ul, .prose ol { margin: 0.5em 0; padding-left: 1.2em; }
        .prose ul { list-style: disc; list-style-position: outside; }
        .prose li { margin: 0.2em 0; }
        .prose a { color: #93c5fd; }
        .prose code { background:#0b1220; padding: 2px 6px; border-radius: 6px; }
        .prose pre, .prose .md-code {
          margin: 10px 0;
          overflow: auto;
          text-align: left;
          background: rgba(255,255,255,0.08);
          color: #e5e7eb;
          padding: 16px;
          border-radius: 18px;
          position: relative;
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 6px 20px rgba(2,6,23,0.20), inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: saturate(160%) blur(16px);
          -webkit-backdrop-filter: saturate(160%) blur(16px);
        }
        .prose pre .lang-badge, .prose .md-code .lang-badge { position: absolute; top: 6px; right: 8px; font-size: 12px; color: #cbd5e1; }
        .prose pre code, .prose .md-code code { background: transparent; }
        .prose code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .tok-keyword { color: #93c5fd; }
        .tok-string  { color: #86efac; }
        .tok-number  { color: #fca5a5; }
        .tok-comment { color: #94a3b8; }
        .tok-tag     { color: #fcd34d; }
        .tok-attr    { color: #fde68a; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function toHtml(md: string) {
  let original = md.replace(/\r\n/g, '\n')
  const codeBlocks: string[] = []
  original = original.replace(/```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g, (_m, lang, body) => {
    const language = (lang || '').toLowerCase()
    let inner = (body || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/^\n+|\n+$/g, '')
    const highlighted = highlightCode(language, inner)
    const badge = language ? `<span class=\"lang-badge\">${language}</span>` : ''
    const langClass = language ? ` language-${language}` : ''
    const html = `<pre class=\"md-code\">${badge}<code class=\"hljs${langClass}\">${highlighted}</code></pre>`
    const token = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(html)
    return token
  })

  let text = escapeHtml(original.trim())
  text = text.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
  text = text.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
  text = text.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
  text = text.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
  text = text.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
  text = text.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
  text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(148,163,184,0.22);color:#e5e7eb;padding:2px 6px;border-radius:6px">$1</code>')
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>')
  text = text.replace(/^(?:-\s+.+\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map(li => li.replace(/^[-*]\s+/, ''))
      .map(li => li.replace(/^\.\s+/, ''))
      .map(li => `<li>${li}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  })
  text = text.replace(/^(?!<h\d>|<ul>|<pre|<p>|<\/)(.+)$/gm, '<p>$1</p>')
  text = codeBlocks.reduce((acc, html, i) => acc.replaceAll(`__CODE_BLOCK_${i}__`, html), text)
  return text
}

function highlightCode(language: string, code: string): string {
  // Disable naive regex-based highlighting to avoid corrupting code with class attributes.
  // Return escaped raw code; visual styling handled by the container.
  return escapeHtml(code)
}



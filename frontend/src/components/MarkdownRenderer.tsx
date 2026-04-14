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
      style={{ background: '#f5f5f7', borderRadius: 8, padding: 20, textAlign: 'left', lineHeight: 1.47, color: '#1d1d1f' }}
    >
      <style>{`
        .prose h1, .prose h2, .prose h3 {
          margin: 0.75em 0 0.35em;
          font-family: "SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-weight: 600;
          line-height: 1.1;
          color: #1d1d1f;
        }
        .prose h1 { font-size: 40px; letter-spacing: -0.28px; }
        .prose h2 { font-size: 28px; letter-spacing: 0.196px; line-height: 1.14; }
        .prose h3, .prose h4, .prose h5, .prose h6 { font-size: 21px; line-height: 1.19; letter-spacing: 0.231px; color: #1d1d1f; }
        .prose p { margin: 0.45em 0; color: rgba(0, 0, 0, 0.8); font-size: 17px; letter-spacing: -0.374px; line-height: 1.47; }
        .prose ul, .prose ol { margin: 0.5em 0; padding-left: 1.2em; }
        .prose ul { list-style: disc; list-style-position: outside; }
        .prose li { margin: 0.2em 0; }
        .prose a { color: #0066cc; }
        .prose code { background: rgba(0, 0, 0, 0.06); padding: 2px 6px; border-radius: 5px; }
        .prose pre, .prose .md-code {
          margin: 10px 0;
          overflow: auto;
          text-align: left;
          background: #ffffff;
          color: #1d1d1f;
          padding: 16px;
          border-radius: 8px;
          position: relative;
          border: 1px solid rgba(0, 0, 0, 0.08);
        }
        .prose pre .lang-badge, .prose .md-code .lang-badge { position: absolute; top: 8px; right: 10px; font-size: 12px; color: rgba(0,0,0,0.48); letter-spacing: -0.12px; }
        .prose pre code, .prose .md-code code { background: transparent; }
        .prose code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .tok-keyword { color: #0066cc; }
        .tok-string  { color: #166534; }
        .tok-number  { color: #b42318; }
        .tok-comment { color: #667085; }
        .tok-tag     { color: #b54708; }
        .tok-attr    { color: #175cd3; }
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
  text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);color:#1d1d1f;padding:2px 6px;border-radius:5px">$1</code>')
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

function highlightCode(_language: string, code: string): string {
  // Disable naive regex-based highlighting to avoid corrupting code with class attributes.
  // Return escaped raw code; visual styling handled by the container.
  return escapeHtml(code)
}



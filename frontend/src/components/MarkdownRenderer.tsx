export function MarkdownRenderer({ markdown }: { markdown: string }) {
  const html = toHtml(markdown)
  return (
    <div
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
    const badge = language ? `<span class="lang-badge">${language}</span>` : ''
    const html = `<pre class="md-code">${badge}<code>${highlighted}</code></pre>`
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
  const esc = escapeHtml(code)
  const apply = (text: string, rules: Array<[RegExp, string]>) => {
    return rules.reduce((acc, [re, cls]) => acc.replace(re, cls), text)
  }
  switch (language) {
    case 'js': case 'javascript': case 'ts': case 'typescript': {
      const rules: Array<[RegExp, string]> = [
        [/\/\/.*$/gm, '<span class="tok-comment">$&</span>'],
        [/("[^"]*"|'[^']*'|`[^`]*`)/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(const|let|var|function|return|if|else|for|while|class|extends|new|try|catch|finally|throw|import|from|export|default|await|async|switch|case|break|continue|this|super)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'py': case 'python': {
      const rules: Array<[RegExp, string]> = [
        [/#.*$/gm, '<span class="tok-comment">$&</span>'],
        [/("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(def|class|return|if|elif|else|for|while|try|except|finally|with|as|import|from|pass|break|continue|lambda|yield|global|nonlocal|assert|raise|in|is|and|or|not)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'java': {
      const rules: Array<[RegExp, string]> = [
        [/\/\/.*$/gm, '<span class="tok-comment">$&</span>'],
        [/\/\*[\s\S]*?\*\//g, '<span class="tok-comment">$&</span>'],
        [/("[^"]*")/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>'],
        [/\b(class|interface|enum|public|private|protected|static|final|void|int|long|double|float|boolean|char|new|return|if|else|for|while|try|catch|finally|throw|throws|extends|implements|package|import)\b/g, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'xml': case 'html': {
      let text = esc
      text = text.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
      text = text.replace(/(&lt;\/?)([a-zA-Z0-9:-]+)([^&]*?)(\s*\/??&gt;)/g, (_m, p1, p2, p3, p4) => {
        const attrs = p3.replace(/([a-zA-Z_:][a-zA-Z0-9:._-]*)(=)("[^"]*"|'[^']*')/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>')
        return `${p1}<span class="tok-tag">${p2}</span>${attrs}${p4}`
      })
      return text
    }
    case 'json': {
      let text = esc
      text = text.replace(/("[^"]*"\s*:)/g, '<span class="tok-attr">$1</span>')
      text = text.replace(/("[^"]*")/g, '<span class="tok-string">$1</span>')
      text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>')
      return text
    }
    case 'bash': case 'sh': case 'shell': {
      const rules: Array<[RegExp, string]> = [
        [/^#.*/gm, '<span class="tok-comment">$&</span>'],
        [/("[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>']
      ]
      return apply(esc, rules)
    }
    case 'sql': {
      const rules: Array<[RegExp, string]> = [
        [/(--.*$)/gm, '<span class="tok-comment">$1</span>'],
        [/("[^"]*"|'[^']*')/g, '<span class="tok-string">$1</span>'],
        [/\b(SELECT|FROM|WHERE|AND|OR|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|LIMIT|OFFSET)\b/gi, '<span class="tok-keyword">$1</span>']
      ]
      return apply(esc, rules)
    }
    default:
      return esc
  }
}



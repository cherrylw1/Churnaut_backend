import fs from 'node:fs'
import path from 'node:path'

const roots = ['app/api', 'lib']
const violations: string[] = []
for (const root of roots) {
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes('observability')) {
        const source = fs.readFileSync(full, 'utf8')
        const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/response_length\s*:\s*cleanedText\.length/g, '')
        if (/\bconsole\.(log|warn|error|info)\s*\(/i.test(codeOnly) || /\blog(?:Error|Warn|Info)\s*\([^\n;]*(?:cleanedText|res\s*\.\s*text\s*\(\)|response\s*\.\s*text\s*\()/i.test(codeOnly)) violations.push(full)
      }
    }
  }
  walk(root)
}
if (violations.length) { console.error(`Logging audit failed: sensitive console arguments found in ${violations.length} files`); violations.forEach((file) => console.error(`- ${file}`)); process.exitCode = 1 }
else console.log('Logging audit PASS: no obvious sensitive console arguments found')

import { readFileSync, writeFileSync } from 'node:fs'

import { isMap, parseDocument } from 'yaml'

const args = process.argv.slice(2)
const command = args[0]
const filePath = args[1]

if (!command || !filePath) {
  console.log('Usage: node scripts/yaml-manager.js <command> <file> [args]')
  console.log('Commands:')
  console.log('  analyze <file>          - Show compact tree structure')
  console.log('  audit   <file>          - Check for duplicate keys')
  console.log('  update  <file> <path> <value> - Update/Insert value at path')
  process.exit(1)
}

function analyze(doc, maxDepth = 5) {
  const contents = doc.contents
  if (!contents)
    return

  function printNode(node, path = [], indent = 0) {
    if (isMap(node)) {
      node.items.forEach((item) => {
        const key = item.key.toString()
        const currentPath = [...path, key].join('.')
        let line = '?'
        try {
          if (item.key.range && doc.lineCounter) {
            line = doc.lineCounter.linePos(item.key.range[0]).line
          }
        }
        catch (e) {}

        console.log(`${'  '.repeat(indent)}${currentPath} (line ${line})`)

        if (indent / 2 < maxDepth) {
          printNode(item.value, [...path, key], indent + 2)
        }
      })
    }
  }

  printNode(contents)
}

function audit(doc) {
  const errors = []
  const contents = doc.contents

  function checkMap(map, path = []) {
    if (!isMap(map))
      return

    const keys = new Set()
    map.items.forEach((item) => {
      const key = item.key.toString()
      const currentPath = [...path, key].join('.')

      if (keys.has(key)) {
        const line = item.key.range ? doc.lineCounter.linePos(item.key.range[0]).line : '?'
        errors.push(`Duplicate key "${key}" at path "${path.join('.')}" (line ${line})`)
      }
      keys.add(key)

      if (isMap(item.value)) {
        checkMap(item.value, [...path, key])
      }
    })
  }

  checkMap(contents)

  if (errors.length === 0) {
    console.log('✅ No duplicate keys found.')
  }
  else {
    console.log('❌ Found duplicate keys:')
    errors.forEach(err => console.log(err))
    process.exit(1)
  }
}

function update(doc, pathStr, value) {
  const path = pathStr.split('.')
  doc.setIn(path, value)
  writeFileSync(filePath, doc.toString())
  console.log(`✅ Updated ${pathStr} to "${value}"`)
}

try {
  const fileContent = readFileSync(filePath, 'utf8')
  // We use parseDocument to preserve comments and formatting
  const doc = parseDocument(fileContent, { keepSourceTokens: true, lineCounter: true })

  if (doc.errors.length > 0) {
    console.error('❌ YAML Parse Errors:')
    doc.errors.forEach(err => console.error(err))
    process.exit(1)
  }

  switch (command) {
    case 'analyze':
      analyze(doc)
      break
    case 'audit':
      audit(doc)
      break
    case 'insert':
      const targetPath = args[2]
      const jsonFile = args[3]
      if (!targetPath || !jsonFile) {
        console.error('Usage: insert <file> <path> <json_file>')
        process.exit(1)
      }
      const jsonData = JSON.parse(readFileSync(jsonFile, 'utf8'))
      const path = targetPath.split('.')
      doc.setIn(path, jsonData)
      writeFileSync(filePath, doc.toString())
      console.log(`✅ Inserted data from ${jsonFile} at ${targetPath}`)
      break
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}
catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}

import fs from 'node:fs'

const lines = fs.readFileSync('patch-onboarding-all.patch', 'utf8').split('\n')
let inTarget = false
const output = []

for (const line of lines) {
  if (line.startsWith('diff --git a/packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-character-selection.vue')) {
    inTarget = true
    continue
  }
  if (inTarget && line.startsWith('diff --git')) {
    break
  }
  if (inTarget) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index '))
      continue
    if (line.startsWith('@@'))
      continue
    if (line.startsWith('+')) {
      output.push(line.substring(1))
    }
    else if (line.startsWith(' ')) {
      output.push(line.substring(1))
    }
    else if (line === '') {
      output.push('')
    }
  }
}

fs.writeFileSync('packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-character-selection.vue', output.join('\n').replace(/\r/g, ''))

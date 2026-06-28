import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

function titleCase(value) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function parseArgs(argv) {
  const skipPrompts = argv.includes('--yes') || argv.includes('-y')
  const projectName = argv.find((arg) => !arg.startsWith('-'))
  return { projectName, skipPrompts }
}

async function ask(rl, question, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : ''
  const answer = (await rl.question(`${question}${suffix}: `)).trim()
  return answer || defaultValue || ''
}

async function askChoice(rl, question, choices, defaultValue) {
  const labels = choices.map((choice) => choice.label).join(' / ')
  while (true) {
    const answer = (await ask(rl, `${question} [${labels}]`, defaultValue)).toLowerCase()
    const match = choices.find((choice) => choice.values.includes(answer))
    if (match) {
      return match.id
    }
    console.log(`Choose one of: ${labels}`)
  }
}

export async function promptForConfig({ projectName, skipPrompts }) {
  const defaults = {
    nodeName: titleCase(projectName),
    network: 'testnet',
    deployTarget: 'vercel',
  }

  if (skipPrompts) {
    return defaults
  }

  const rl = readline.createInterface({ input, output })

  try {
    const nodeName = await ask(rl, 'Node name (displayed in admin console header)', defaults.nodeName)
    const network = await askChoice(
      rl,
      'Network',
      [
        { id: 'testnet', label: 'testnet', values: ['testnet', 't'] },
        { id: 'mainnet', label: 'mainnet', values: ['mainnet', 'm'] },
      ],
      defaults.network,
    )
    const deployTarget = await askChoice(
      rl,
      'Deploy target',
      [
        { id: 'vercel', label: 'Vercel', values: ['vercel', 'v'] },
        { id: 'docker', label: 'Docker', values: ['docker', 'd'] },
        { id: 'local-only', label: 'local-only', values: ['local-only', 'local', 'l'] },
      ],
      defaults.deployTarget,
    )

    return { nodeName, network, deployTarget }
  } finally {
    rl.close()
  }
}

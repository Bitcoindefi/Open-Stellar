import fs from 'fs';
import path from 'path';

function parseSoroban(filePath, relativePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const methods = [];
  const structs = [];

  let currentStruct = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse struct
    if (line.startsWith('pub struct ')) {
      const match = line.match(/pub struct\s+([A-Za-z0-9_]+)/);
      if (match) {
        currentStruct = { name: match[1], fields: [] };
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('}')) {
          const fLine = lines[j].trim();
          if (fLine.startsWith('pub ')) {
            const fMatch = fLine.match(/pub\s+([A-Za-z0-9_]+):\s*([^,]+)/);
            if (fMatch) {
              currentStruct.fields.push({ name: fMatch[1], type: fMatch[2].trim() });
            }
          }
          j++;
        }
        structs.push(currentStruct);
      }
    }

    // Parse functions inside impl
    if (line.startsWith('pub fn ')) {
      const fnMatch = line.match(/pub fn\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/);
      if (fnMatch) {
        const name = fnMatch[1];
        const params = fnMatch[2].replace(/\s+/g, ' ').trim();
        const ret = fnMatch[3] ? fnMatch[3].trim() : 'void';
        methods.push({
          name,
          signature: `pub fn ${name}(${params}) -> ${ret}`
        });
      }
    }
  }

  return {
    name: 'StellarEscrow',
    type: 'soroban',
    file: relativePath,
    methods,
    structs
  };
}

function parseSolidity(filePath, relativePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath, '.sol');
  const lines = content.split('\n');

  const methods = [];
  const structs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('struct ')) {
      const match = line.match(/struct\s+([A-Za-z0-9_]+)/);
      if (match) {
        const sName = match[1];
        const fields = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('}')) {
          const fLine = lines[j].trim();
          if (fLine && !fLine.startsWith('//')) {
            const parts = fLine.replace(';', '').split(/\s+/);
            if (parts.length >= 2) {
              fields.push({ name: parts[1], type: parts[0] });
            }
          }
          j++;
        }
        structs.push({ name: sName, fields });
      }
    }

    if (line.startsWith('function ')) {
      const fnMatch = line.match(/function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*([^{;]+)?/);
      if (fnMatch) {
        const name = fnMatch[1];
        const params = fnMatch[2].replace(/\s+/g, ' ').trim();
        const modifiers = fnMatch[3] ? fnMatch[3].trim() : '';
        methods.push({
          name,
          signature: `function ${name}(${params}) ${modifiers}`.trim()
        });
      }
    }
  }

  return {
    name: fileName,
    type: 'solidity',
    file: relativePath,
    methods,
    structs
  };
}

export function generateDocs(checkOnly = false) {
  const rootDir = process.cwd();
  const contractsDir = path.join(rootDir, 'contracts');
  const outputDocsDir = path.join(rootDir, 'docs', 'contracts');

  const contracts = [
    parseSoroban(
      path.join(contractsDir, 'stellar', 'escrow', 'src', 'lib.rs'),
      'contracts/stellar/escrow/src/lib.rs'
    ),
    parseSolidity(
      path.join(contractsDir, 'evm', 'EscrowMilestone.sol'),
      'contracts/evm/EscrowMilestone.sol'
    ),
    parseSolidity(
      path.join(contractsDir, 'evm', 'X402ServicePaywall.sol'),
      'contracts/evm/X402ServicePaywall.sol'
    )
  ];

  let hasDiff = false;

  if (!fs.existsSync(outputDocsDir)) {
    if (checkOnly) return true;
    fs.mkdirSync(outputDocsDir, { recursive: true });
  }

  // Generate README.md
  let indexMd = `# Smart Contract API Reference\n\nAuto-generated contract interface documentation for Open-Stellar contracts.\n\n`;
  indexMd += `## Core Contracts\n\n`;
  for (const c of contracts) {
    indexMd += `- [${c.name}](./${c.name}.md) (${c.type.toUpperCase()}) - Source: [\`${c.file}\`](../../${c.file})\n`;
  }
  indexMd += `\n---\n*Generated automatically. Run \`npm run docs:generate\` to update.*\n`;

  const indexPath = path.join(outputDocsDir, 'README.md');
  if (checkOnly) {
    if (!fs.existsSync(indexPath) || fs.readFileSync(indexPath, 'utf-8') !== indexMd) {
      hasDiff = true;
    }
  } else {
    fs.writeFileSync(indexPath, indexMd);
  }

  // Generate per-contract doc
  for (const c of contracts) {
    let doc = `# ${c.name}\n\n`;
    doc += `**Type:** ${c.type.toUpperCase()}\n`;
    doc += `**Source File:** [${c.file}](../../${c.file})\n\n`;

    if (c.structs.length > 0) {
      doc += `## Data Structures\n\n`;
      for (const s of c.structs) {
        doc += `### \`${s.name}\`\n\n`;
        doc += `| Field | Type |\n| --- | --- |\n`;
        for (const f of s.fields) {
          doc += `| \`${f.name}\` | \`${f.type}\` |\n`;
        }
        doc += `\n`;
      }
    }

    if (c.methods.length > 0) {
      doc += `## Public Entry Points / Methods\n\n`;
      for (const m of c.methods) {
        doc += `### \`${m.name}\`\n\n\`\`\`${c.type === 'soroban' ? 'rust' : 'solidity'}\n${m.signature}\n\`\`\`\n\n`;
      }
    }

    doc += `---\n*Generated automatically from source code. Do not edit directly.*\n`;

    const docPath = path.join(outputDocsDir, `${c.name}.md`);
    if (checkOnly) {
      if (!fs.existsSync(docPath) || fs.readFileSync(docPath, 'utf-8') !== doc) {
        hasDiff = true;
      }
    } else {
      fs.writeFileSync(docPath, doc);
    }
  }

  return hasDiff;
}

const isCheck = process.argv.includes('--check');
const diffDetected = generateDocs(isCheck);
if (isCheck) {
  if (diffDetected) {
    console.error('❌ Contract documentation is out of date! Run "npm run docs:generate" to fix.');
    process.exit(1);
  } else {
    console.log('✅ Contract documentation is up to date.');
  }
} else {
  console.log('✅ Generated contract documentation successfully.');
}

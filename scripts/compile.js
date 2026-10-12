// Standalone compile step using the npm `solc` package instead of Hardhat's
// built-in compiler downloader. Hardhat 2's compile task fetches platform
// solc binaries from binaries.soliditylang.org, which this sandbox's egress
// policy blocks (403). The npm `solc` package ships the compiler itself via
// the npm registry, which is allowed, so we drive solc directly and write
// out Hardhat-compatible artifact JSON files. Downstream scripts/tests use
// `npx hardhat test --no-compile` / ethers ContractFactory against these
// artifacts, so nothing downstream needs to change.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts", "contracts");

function findImports(importPath) {
  // Resolve node_modules imports (e.g. @openzeppelin/contracts/...)
  const candidates = [
    path.join(__dirname, "..", "node_modules", importPath),
    path.join(CONTRACTS_DIR, importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

function compileFile(fileName) {
  const sourcePath = path.join(CONTRACTS_DIR, fileName);
  const source = fs.readFileSync(sourcePath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai", // widely supported; avoids betting on Cancun-only opcodes (MCOPY) until Monad's fork support is confirmed
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    for (const err of output.errors) {
      console.log(err.formattedMessage || err.message);
    }
    if (fatal.length > 0) {
      throw new Error(`Compilation failed for ${fileName}`);
    }
  }

  const contractsInFile = output.contracts[fileName];
  for (const contractName of Object.keys(contractsInFile)) {
    const contract = contractsInFile[contractName];
    const outDir = path.join(ARTIFACTS_DIR, fileName);
    fs.mkdirSync(outDir, { recursive: true });
    const artifact = {
      _format: "hh-sol-artifact-1",
      contractName,
      sourceName: fileName,
      abi: contract.abi,
      bytecode: "0x" + contract.evm.bytecode.object,
      deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
      linkReferences: {},
      deployedLinkReferences: {},
    };
    fs.writeFileSync(
      path.join(outDir, `${contractName}.json`),
      JSON.stringify(artifact, null, 2)
    );
    console.log(`Compiled ${contractName} -> artifacts/contracts/${fileName}/${contractName}.json`);
  }
}

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
compileFile("RegloAgentEscrow.sol");

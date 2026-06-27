/**
 * Generate private-public key pairs for service-based authentication.
 * See docs/service-auth.md and src/signatureAuth.ts for more details.
 */
const fs = require('fs')
const crypto = require('crypto')

function parseArgs() {
  if (process.argv.length != 3) {
    throw new Error("Usage: node scripts/generate-key-pair.js outfname")
  }

  return { outfname: process.argv[2] }
}

function main() {
  const { outfname } = parseArgs()

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  })

  fs.writeFileSync(
    outfname,
    privateKey.export({ format: "pem", type: "pkcs8" }),
  )

  fs.writeFileSync(`${outfname}.pub`, publicKey)

  console.log(`Success - wrote private key to ${outfname} and public key to ${outfname}.pub`)
}

main()

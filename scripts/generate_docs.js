const { parse } = require('comment-parser')
const fs = require('node:fs')

const source = fs.readFileSync('src/index.ts', 'utf8')
const parsed = parse(source)

console.log(parsed[0])

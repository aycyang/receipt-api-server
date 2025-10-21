enum Byte {
  ESC = 0x1b,
  '@' = 0x40,
  '!' = 0x21,
}

const escRules = {
  [Byte['@']]: 0,
  [Byte['!']]: 1,
}

const topLevelRules = {
  [Byte.ESC]: escRules,
  [Byte['@']]: 0,
  [Byte['!']]: 0,
}

export class Command {
  buf: Buffer
  constructor(buf: Buffer) {
    this.buf = buf
  }
  equals(other: Command): boolean {
    return this.buf.equals(other.buf)
  }
}

export function parse(buf: Buffer): Array<Command> {
  const cmds = []
  let cur = []
  let rules = topLevelRules
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if (!(c in rules)) {
      throw new Error(`unexpected token at index ${i}: ${c}`)
    }
    cur.push(c)
    rules = rules[c]
    if (typeof rules === 'number') {
      if (i + rules >= buf.length) {
        throw new Error('unexpected end of input')
      }
      for (let j = 0; j < rules; j++) {
        i++
        cur.push(buf[i])
      }
      cmds.push(new Command(Buffer.from(cur)))
      cur = []
      rules = topLevelRules
    }
  }
  return cmds
}

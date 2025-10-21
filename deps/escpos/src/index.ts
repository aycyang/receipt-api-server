import { Byte } from './byte'

const escRules = {
  [Byte.FF]: 0,
  [Byte.SP]: 1,
  [Byte['!']]: 1,
  [Byte['$']]: 2,
  [Byte['%']]: 0, // FIXME
  [Byte['&']]: 0, // FIXME
  [Byte['(']]: 0, // FIXME
  [Byte['*']]: 0, // FIXME
  [Byte['-']]: 0, // FIXME
  [Byte['2']]: 0, // FIXME
  [Byte['3']]: 0, // FIXME
  [Byte['=']]: 0, // FIXME
  [Byte['?']]: 0, // FIXME
  [Byte['@']]: 0,
  [Byte['D']]: 0, // FIXME
  [Byte['E']]: 0, // FIXME
  [Byte['G']]: 0, // FIXME
  [Byte['J']]: 0, // FIXME
  [Byte['L']]: 0, // FIXME
  [Byte['M']]: 0, // FIXME
  [Byte['R']]: 0, // FIXME
  [Byte['S']]: 0, // FIXME
  [Byte['T']]: 0, // FIXME
  [Byte['V']]: 0, // FIXME
  [Byte['W']]: 0, // FIXME
  [Byte['\\']]: 0, // FIXME
  [Byte['a']]: 0, // FIXME
  [Byte['c']]: 0, // FIXME
  [Byte['d']]: 0, // FIXME
  [Byte['i']]: 0, // FIXME
  [Byte['m']]: 0, // FIXME
  [Byte['p']]: 0, // FIXME
  [Byte['t']]: 0, // FIXME
  [Byte['u']]: 0, // FIXME
  [Byte['v']]: 0, // FIXME
  [Byte['{']]: 0, // FIXME
}

type Rules = Record<Byte, number | object>
const topLevelRules: Rules = {} as Rules
for (const key in Byte) {
  topLevelRules[Byte[key]] = 0
}
topLevelRules[Byte.ESC] = escRules

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

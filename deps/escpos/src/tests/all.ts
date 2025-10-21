import * as escpos from '..'

class TestCase {
  in: Buffer
  out: Array<escpos.Command>
}

const testCases: Array<TestCase> = [
  {
    in: Buffer.from([0x1b, 0x40]),
    out: [
      new escpos.Command(Buffer.from([0x1b, 0x40])),
    ]
  },
  {
    in: Buffer.from([0x1b, 0x21, 0x00]),
    out: [
      new escpos.Command(Buffer.from([0x1b, 0x21, 0x00])),
    ]
  },
  {
    in: Buffer.from([0x1b, 0x40, 0x40]),
    out: [
      new escpos.Command(Buffer.from([0x1b, 0x40])),
      new escpos.Command(Buffer.from([0x40])),
    ]
  },
  {
    in: Buffer.from([0x1b, 0x21, 0x00, 0x1b, 0x40, 0x21]),
    out: [
      new escpos.Command(Buffer.from([0x1b, 0x21, 0x00])),
      new escpos.Command(Buffer.from([0x1b, 0x40])),
      new escpos.Command(Buffer.from([0x21])),
    ]
  },
]

function run(testCase: TestCase): boolean {
  let cmds
  try {
    cmds = escpos.parse(testCase.in)
  } catch (err) {
    // parsing error
    console.error(err)
    return false
  }
  if (testCase.out.length !== cmds.length) {
    console.error('parsed length !== expected length')
    console.error('expected: ', testCase.out)
    console.error('actual: ', cmds)
    return false
  }
  for (let i = 0; i < testCase.out.length; i++) {
    if (!testCase.out[i].equals(cmds[i])) {
      console.error('parsed commands differ from expected at command ' + i)
      console.error('expected: ', testCase.out)
      console.error('actual: ', cmds)
      return false
    }
  }
  return true
}

for (let i = 0; i < testCases.length; i++) {
  console.log('test', i)
  if (run(testCases[i])) {
    console.log('PASS')
  } else {
    console.log('FAIL')
  }
}

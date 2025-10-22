import { Jimp } from 'jimp'

export async function generateEscPos(imageBin: Buffer): Promise<Buffer> {
  if (imageBin.subarray(0, 2).toString() === 'P4') {
    return parsePbmFile(imageBin)
  } else {
    return parseImg(imageBin)
  }
}

// largely copied from aycyang/receipt-printer-frontend
function convertRgbaToPbmData(imageData): Buffer {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const bitmap = [];
  const paddedWidth = Math.floor((width + 7) / 8) * 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < paddedWidth; x++) {
      if (x >= width) {
        bitmap[bitmap.length - 1] = bitmap[bitmap.length - 1] << 1;
        continue;
      }
      const r = data[y * width * 4 + x * 4]; // only use red value for now
      if (x % 8 === 0) {
        bitmap.push(0);
      } else {
        bitmap[bitmap.length - 1] = bitmap[bitmap.length - 1] << 1;
      }

      // hard split into black/white for now
      if (r < 127) {
        bitmap[bitmap.length - 1] = bitmap[bitmap.length - 1] | 1;
      }
    }
  }
  return Buffer.from(bitmap)
}

function bayer4(img) {
  img.greyscale()
  const m = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ].map(n => n / 16)
  for (let i = 0; i < img.bitmap.width * img.bitmap.height; i++) {
    const x = i % img.bitmap.width
    const y = Math.floor(i / img.bitmap.width)
    const v = img.bitmap.data[i * 4] / 255
    const mx = x % 4
    const my = y % 4
    const threshold = m[my * 4 + mx]
    const result = v < threshold ? 0x00 : 0xff
    img.bitmap.data[i * 4] = result
    img.bitmap.data[i * 4 + 1] = result
    img.bitmap.data[i * 4 + 2] = result
    img.bitmap.data[i * 4 + 3] = 0xff
  }
}

async function parseImg(imgBin: Buffer): Promise<Buffer> {
  const img = await Jimp.fromBuffer(imgBin)
  if (img.bitmap.width > 512) {
    img.resize({w: 512})
  }
  bayer4(img)
  const pbmData = convertRgbaToPbmData(img.bitmap)
  return parsePbmData(pbmData, img.bitmap.width, img.bitmap.height)
}

function parsePbmFile(pbmBin: Buffer): Buffer {
  let firstNewline = 0
  let secondNewline = 0
  for (let i = 0; i < pbmBin.length; i++) {
    if (pbmBin[i] == 10) { // 10 is ASCII line feed (LF)
      firstNewline = i
      break
    }
  }
  for (let i = firstNewline + 1; i < pbmBin.length; i++) {
    if (pbmBin[i] == 10) { // 10 is ASCII line feed (LF)
      secondNewline = i
      break
    }
  }
  const firstLine = pbmBin.subarray(0, firstNewline).toString()
  const secondLine = pbmBin.subarray(firstNewline + 1, secondNewline).toString()
  const [width, height] = secondLine.split(' ').map(n => parseInt(n, 10))
  if (firstLine !== 'P4') {
    throw new Error('.pbm image file must start with P4')
  }
  const pbmData = pbmBin.subarray(secondNewline + 1)
  return parsePbmData(pbmData, width, height)
}

// TODO put all this in the escpos module
function parsePbmData(pbmData: Buffer, width: number, height: number): Buffer {
  if (width > 512) {
    throw new Error('width must be 512px or less')
  }
  if (height > 1024) {
    throw new Error('height must be 1024px or less')
  }
  const widthBytes = Math.floor((width + 7) / 8)
  const p = widthBytes * height + 10
  const pLow = p & 0xff
  const pHigh = p >> 8
  const wLow = width & 0xff
  const wHigh = width >> 8
  const hLow = height & 0xff
  const hHigh = height >> 8
  return Buffer.from([
    0x1b, 0x40, // initialize printer
    0x1d, 0x28, 0x4c,
    pLow, pHigh,
    0x30, 0x70, 0x30, 0x01, 0x01, 0x31,
    wLow, wHigh, hLow, hHigh,
    ...pbmData,
    0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32, 0x00, // print what's in the buffer
    0x1b, 0x64, 0x06, // feed 6 lines
    0x1d, 0x56, 0x00, // cut
  ])
}


// TODO return more detailed error output
export function validate(buf: Buffer): boolean {
  // TODO implement some parsing
  return true;
}

function convertNumberToEscPos(n: string): string {
  let num = Number(n);
  if (num < 0 || num > 255) {
    throw new Error("number out of range for single byte: " + n);
  }
  return String.fromCharCode(num);
}

/**
 * Generate ESC/POS commands from structured input: HTML body containing text
 * and formatting options.
 * @param body HTML body with formatting options
 * @returns Buffer containing ESC/POS commands
 */
export function generate(body: any): Buffer {
  const content = body.text;
  const spacing = body.spacing ? convertNumberToEscPos(body.spacing) : "\x00"; // ESC SP
  const underline = body.underline ? "\x01" : "\x00"; // ESC - (note: unclear if 2 dot underline is supported)
  const bold = body.bold ? "\x01" : "\x00"; // ESC E
  const strike = body.strike ? "\x01" : "\x00"; // ESC G
  const font = body.font === "b" ? "\x01" : "\x00"; // ESC M
  const rotate = body.rotate ? "\x01" : "\x00"; // ESC V (rotate 90 degrees clockwise)
  const upsideDown = body.upsideDown ? "\x01" : "\x00"; // ESC {
  const scale = ""; // GS !
  const invert = body.invert ? "\x01" : "\x00"; // GS B

  // TODO: if rotate is true, transform text content to insert line breaks correctly
  // TODO: implement scale handling

  return Buffer.from(
    "\x1b\x40" +
      ("\x1b\x20" + spacing) +
      ("\x1b\x2d" + underline) +
      ("\x1b\x45" + bold) +
      ("\x1b\x47" + strike) +
      ("\x1b\x4d" + font) +
      ("\x1b\x56" + rotate) +
      ("\x1b\x7b" + upsideDown) +
      // ((body.scaleWidth || body.scaleHeight) ?? "\x1d\x21" + scale) +
      ("\x1d\x42" + invert) +
      content +
      "\x1b\x64\x06" +
      "\x1d\x56\x00"
  );
}

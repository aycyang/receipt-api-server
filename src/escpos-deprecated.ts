// TODO return more detailed error output
export function validate(buf: Buffer): boolean {
  // TODO implement some parsing
  return true;
}

// Chainable builder for ESC/POS commands
export class EscPosBuilder {
  private _commands: number[] = [];

  public get commands(): Uint8Array {
    return new Uint8Array(this._commands);
  }

  constructor(initialize = true) {
    if (initialize) {
      this._commands.push(0x1b, 0x40);
    }
  }

  build(): Buffer {
    // create a Buffer from the Uint8Array view of the commands
    return Buffer.from(this.commands);
  }

  // letter spacing, ESC SP n
  spacing(n: number): this {
    if (n < 0 || n > 255) {
      throw new Error("letter spacing out of range: " + n);
    }
    this._commands.push(0x1b, 0x20, n);
    return this;
  }

  underline(enable: boolean): this {
    this._commands.push(0x1b, 0x2d, enable ? 0x01 : 0x00);
    return this;
  }

  bold(enable: boolean): this {
    this._commands.push(0x1b, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  strike(enable: boolean): this {
    this._commands.push(0x1b, 0x47, enable ? 0x01 : 0x00);
    return this;
  }

  font(face: "a" | "b" = "a"): this {
    this._commands.push(0x1b, 0x4d, face === "b" ? 0x01 : 0x00);
    return this;
  }

  // rotate 90 degrees clockwise
  // TODO: handle text formatting when rotated
  rotate(enable: boolean): this {
    this._commands.push(0x1b, 0x56, enable ? 0x01 : 0x00);
    return this;
  }

  upsideDown(enable: boolean): this {
    this._commands.push(0x1b, 0x7b, enable ? 0x01 : 0x00);
    return this;
  }

  invert(enable: boolean): this {
    this._commands.push(0x1d, 0x42, enable ? 0x01 : 0x00);
    return this;
  }

  // TODO: verify this works as intended
  scale(width = 0, height = 0): this {
    if (width < 0 || width > 7) {
      throw new Error("scale width out of range: " + width);
    }
    if (height < 0 || height > 7) {
      throw new Error("scale height out of range: " + height);
    }
    const w = Math.max(0, Math.min(7, width));
    const h = Math.max(0, Math.min(7, height));
    const val = (w << 4) | h;
    this._commands.push(0x1d, 0x21, val);
    return this;
  }

  text(s: string): this {
    const buf = Buffer.from(s, "utf8");
    for (const byte of buf) this._commands.push(byte);
    return this;
  }

  printAndFeed(n: number): this {
    if (n < 0 || n > 255) {
      throw new Error("feed number out of range: " + n);
    }
    this._commands.push(0x1b, 0x64, n);
    return this;
  }

  cut(): this {
    this._commands.push(0x1d, 0x56, 0x00);
    return this;
  }

  raw(s: string): this {
    const buf = Buffer.from(s, "utf8");
    for (const byte of buf) this._commands.push(byte);
    return this;
  }
}

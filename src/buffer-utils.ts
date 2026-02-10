export function readByte(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset >= data.length) {
    return 0;
  }
  return data[offset]!;
}

export function readUint16LE(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > data.length) {
    return 0;
  }
  return readByte(data, offset) | (readByte(data, offset + 1) << 8);
}

export function readUint24LE(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 > data.length) {
    return 0;
  }
  return (
    readByte(data, offset) |
    (readByte(data, offset + 1) << 8) |
    (readByte(data, offset + 2) << 16)
  );
}

export function readUint24BE(data: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 3 > data.length) {
    return 0;
  }
  return (
    (readByte(data, offset) << 16) |
    (readByte(data, offset + 1) << 8) |
    readByte(data, offset + 2)
  );
}

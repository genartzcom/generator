export function compress(originalCode: string, chunkSize: number): string[] {
  const base64: string = Buffer.from(originalCode, 'utf-8').toString('base64');
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.substring(i, i + chunkSize));
  }
  return chunks;
}

export function decompress(chunks: string[]): string {
  const base64: string = chunks.join('');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

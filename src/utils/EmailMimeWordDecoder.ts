/**
 * We use this class to decode the filename in Content-Disposition headers in mail servers.
 * RFC 2047
 */
export class EmailMimeWordDecoder {
    private static regex = /=\?(?<charset>[^?]+)\?(?<encoding>[BQ])\?(?<encodedText>[^?]+)\?=/gi;

    static decode(input: string): string {
        return input.replace(this.regex, (match, ...args) => {
            const groups = args.at(-1) as Record<string, string> | undefined;
            try {
                const charset = groups?.charset;
                const encoding = groups?.encoding.toUpperCase();
                const encodedText = groups?.encodedText;

                if (!charset || !encoding || !encodedText) return match;

                let bytes: Uint8Array;

                if (encoding === 'B') {
                    bytes = Uint8Array.from(atob(encodedText), c => c.charCodeAt(0));
                } else if (encoding === 'Q') {
                    bytes = this.decodeQuotedPrintable(encodedText);
                } else {
                    return match;
                }

                const decoder = new TextDecoder(charset);
                return decoder.decode(bytes);
            } catch {
                return match;
            }
        });
    }

    private static decodeQuotedPrintable(encoded: string): Uint8Array {
        const result: number[] = [];
        let i = 0;

        while (i < encoded.length) {
            const c = encoded[i];

            if (c === '=' && i + 2 < encoded.length) {
                const hex = encoded.substring(i + 1, i + 3);
                const byte = parseInt(hex, 16);
                if (!isNaN(byte)) {
                    result.push(byte);
                    i += 3;
                } else {
                    result.push(c.charCodeAt(0));
                    i++;
                }
            } else if (c === '_') {
                result.push(' '.charCodeAt(0));
                i++;
            } else {
                result.push(c.charCodeAt(0));
                i++;
            }
        }

        return new Uint8Array(result);
    }
}

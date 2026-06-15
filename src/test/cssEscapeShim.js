export default function cssEscape(value) {
  const string = String(value);
  const length = string.length;
  let index = -1;
  let output = "";
  const firstCodeUnit = string.charCodeAt(0);

  while (++index < length) {
    const codeUnit = string.charCodeAt(index);

    if (codeUnit === 0x0000) {
      output += "\uFFFD";
      continue;
    }

    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001F) ||
      codeUnit === 0x007F ||
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (
        index === 1 &&
        codeUnit >= 0x0030 &&
        codeUnit <= 0x0039 &&
        firstCodeUnit === 0x002D
      )
    ) {
      output += `\\${codeUnit.toString(16)} `;
      continue;
    }

    if (index === 0 && length === 1 && codeUnit === 0x002D) {
      output += `\\${string.charAt(index)}`;
      continue;
    }

    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002D ||
      codeUnit === 0x005F ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007A)
    ) {
      output += string.charAt(index);
      continue;
    }

    output += `\\${string.charAt(index)}`;
  }

  return output;
}

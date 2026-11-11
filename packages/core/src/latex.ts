/**
 * 轻量 LaTeX 美化：把常见命令转成 Unicode，供 Canvas 以文本方式呈现。
 * 不做排版级公式，仅用于无外部字体/排版库的离线环境。
 */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
};

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ'
};

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', n: 'ₙ'
};

function mapChars(text: string, table: Record<string, string>, fallback: string): string {
  let ok = true;
  const mapped = [...text].map((ch) => {
    const value = table[ch];
    if (!value) { ok = false; return ch; }
    return value;
  }).join('');
  return ok ? mapped : `${fallback}${text}`;
}

export function formatLatex(source: string): string {
  let text = source.trim();
  if (!text) return '';

  text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => {
    const numerator = formatLatex(a);
    const denominator = formatLatex(b);
    return `${numerator}/${denominator}`;
  });
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√(${formatLatex(a)})`);
  text = text.replace(/\\(cdot|times|div|pm)/g, (_m, name: string) => {
    if (name === 'cdot') return '·';
    if (name === 'times') return '×';
    if (name === 'div') return '÷';
    return '±';
  });
  text = text.replace(/\\(le|leq|ge|geq|neq|approx)/g, (_m, name: string) => {
    if (name === 'le' || name === 'leq') return '≤';
    if (name === 'ge' || name === 'geq') return '≥';
    if (name === 'neq') return '≠';
    return '≈';
  });
  text = text.replace(/\\(left|right|text|mathrm|mathbf)/g, '');
  text = text.replace(/\\([a-zA-Z]+)/g, (_m, name: string) => GREEK[name] ?? name);
  text = text.replace(
    /\^\{([^{}]*)\}|\^(\S)|_\{([^{}]*)\}|_(\S)/g,
    (_m, supBraced: string | undefined, supSingle: string | undefined, subBraced: string | undefined, subSingle: string | undefined) => {
      if (supBraced !== undefined) return mapChars(supBraced, SUP, '^');
      if (supSingle !== undefined) return mapChars(supSingle, SUP, '^');
      if (subBraced !== undefined) return mapChars(subBraced, SUB, '_');
      return mapChars(subSingle ?? '', SUB, '_');
    }
  );
  text = text.replace(/[{}]/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

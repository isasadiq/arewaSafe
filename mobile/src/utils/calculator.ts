/**
 * Safe Mathematical Expression Evaluator for Scientific Calculator
 * Supports: +, -, ×, ÷, %, ^, √ (sqrt), sin, cos, tan (in degrees), ()
 */

export function evaluateExpression(expr: string): string {
  if (!expr || expr.trim() === '') return '0';

  try {
    // Sanitize and replace visual symbols with parsable tokens
    let sanitized = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
      .replace(/%/g, '*0.01');

    // Tokenizer
    sanitized = sanitized.replace(/\s+/g, '');

    const tokens: string[] = [];
    let i = 0;
    while (i < sanitized.length) {
      const char = sanitized[i];

      if ('+-*/^()'.includes(char)) {
        tokens.push(char);
        i++;
      } else if (/[0-9.]/.test(char)) {
        let numStr = '';
        while (i < sanitized.length && /[0-9.]/.test(sanitized[i])) {
          numStr += sanitized[i];
          i++;
        }
        tokens.push(numStr);
      } else if (/[a-zA-Z]/.test(char)) {
        let fnName = '';
        while (i < sanitized.length && /[a-zA-Z]/.test(sanitized[i])) {
          fnName += sanitized[i];
          i++;
        }
        tokens.push(fnName.toLowerCase());
      } else {
        i++;
      }
    }

    // Recursive Descent Parser
    let pos = 0;

    function peek(): string | null {
      return pos < tokens.length ? tokens[pos] : null;
    }

    function consume(expected?: string): string {
      const token = tokens[pos++];
      if (expected && token !== expected) {
        throw new Error(`Expected ${expected} but got ${token}`);
      }
      return token;
    }

    // Expression = Term (( '+' | '-' ) Term)*
    function parseExpression(): number {
      let value = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = consume();
        const nextVal = parseTerm();
        if (op === '+') value += nextVal;
        else value -= nextVal;
      }
      return value;
    }

    // Term = Factor (( '*' | '/' ) Factor)*
    function parseTerm(): number {
      let value = parsePower();
      while (peek() === '*' || peek() === '/') {
        const op = consume();
        const nextVal = parsePower();
        if (op === '*') value *= nextVal;
        else {
          if (nextVal === 0) throw new Error('Division by zero');
          value /= nextVal;
        }
      }
      return value;
    }

    // Power = Factor ( '^' Power )?
    function parsePower(): number {
      let value = parseFactor();
      if (peek() === '^') {
        consume('^');
        const nextVal = parsePower();
        value = Math.pow(value, nextVal);
      }
      return value;
    }

    // Factor = (Unary '+/-')? ( Number | Function | '(' Expression ')' )
    function parseFactor(): number {
      const token = peek();

      if (token === '-') {
        consume('-');
        return -parseFactor();
      }
      if (token === '+') {
        consume('+');
        return parseFactor();
      }

      if (token === '(') {
        consume('(');
        const val = parseExpression();
        if (peek() === ')') consume(')');
        return val;
      }

      // Built-in scientific functions
      if (token === 'sin' || token === 'cos' || token === 'tan' || token === 'sqrt') {
        const fn = consume();
        let arg = 0;
        if (peek() === '(') {
          consume('(');
          arg = parseExpression();
          if (peek() === ')') consume(')');
        } else {
          arg = parseFactor();
        }

        if (fn === 'sin') return Math.sin((arg * Math.PI) / 180);
        if (fn === 'cos') return Math.cos((arg * Math.PI) / 180);
        if (fn === 'tan') {
          // Check for undefined tan(90)
          const mod90 = Math.abs(arg) % 180;
          if (Math.abs(mod90 - 90) < 1e-9) throw new Error('Undefined');
          return Math.tan((arg * Math.PI) / 180);
        }
        if (fn === 'sqrt') {
          if (arg < 0) throw new Error('Invalid input');
          return Math.sqrt(arg);
        }
      }

      if (token !== null && /^[0-9.]+$/.test(token)) {
        consume();
        return parseFloat(token);
      }

      return 0;
    }

    const result = parseExpression();
    if (isNaN(result) || !isFinite(result)) return 'Error';

    // Format output cleanly (strip floating point quirks like 0.30000000000000004)
    const rounded = Number(result.toFixed(8));
    return String(rounded);
  } catch {
    return 'Error';
  }
}

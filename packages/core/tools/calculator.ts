/**
 * Deterministic Arithmetic & Scientific Expression Evaluator
 * Implements Dijkstra's Shunting-Yard algorithm & Reverse Polish Notation (RPN) evaluation.
 * STRICT SECURITY REQUIREMENT: Absolutely no `eval` or `Function` constructors are used.
 */

export class SafeCalculator {
  private static FUNCTIONS = new Set(['sqrt', 'abs', 'round', 'floor', 'ceil', 'ln', 'log']);

  private static precedence(op: string): number {
    switch (op) {
      case '+':
      case '-':
        return 1;
      case '*':
      case '/':
      case '%':
        return 2;
      case '^':
        return 3;
      default:
        return 0;
    }
  }

  private static isRightAssociative(op: string): boolean {
    return op === '^';
  }

  /**
   * Tokenize mathematical expressions, supporting decimals, percentages, scientific notation,
   * named functions, and unary negation.
   */
  static tokenize(expression: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const clean = expression.replace(/\s+/g, '');

    while (i < clean.length) {
      const char = clean[i];

      // Named functions: sqrt, abs, round, floor, ceil, ln, log
      const wordMatch = clean.slice(i).match(/^[a-z]+/i);
      if (wordMatch && this.FUNCTIONS.has(wordMatch[0].toLowerCase())) {
        tokens.push(wordMatch[0].toLowerCase());
        i += wordMatch[0].length;
        continue;
      }

      // Number, scientific notation (e.g. 1.2e5, 3e-4), or decimal with optional %
      if (/[0-9.]/.test(char)) {
        let numStr = '';
        while (i < clean.length && /[0-9.]/.test(clean[i])) {
          numStr += clean[i];
          i++;
        }
        // Handle scientific notation e.g. 1e5 or 2.5e-3
        if (i < clean.length && (clean[i] === 'e' || clean[i] === 'E')) {
          numStr += clean[i];
          i++;
          if (i < clean.length && (clean[i] === '+' || clean[i] === '-')) {
            numStr += clean[i];
            i++;
          }
          while (i < clean.length && /[0-9]/.test(clean[i])) {
            numStr += clean[i];
            i++;
          }
        }
        // Handle trailing percentage e.g. 94.2% -> divide by 100
        if (i < clean.length && clean[i] === '%') {
          const val = parseFloat(numStr) / 100;
          tokens.push(val.toString());
          i++;
          continue;
        }

        tokens.push(numStr);
        continue;
      }

      // Operators or parentheses
      if (['+', '-', '*', '/', '^', '%', '(', ')', ','].includes(char)) {
        // Check for unary minus: preceded by start of string, open paren, comma, or another operator
        if (char === '-') {
          const prev = tokens[tokens.length - 1];
          if (!prev || ['+', '-', '*', '/', '^', '%', '(', ','].includes(prev) || this.FUNCTIONS.has(prev)) {
            tokens.push('0');
            tokens.push('-');
            i++;
            continue;
          }
        }
        tokens.push(char);
        i++;
        continue;
      }

      // Skip unknown characters
      i++;
    }

    return tokens;
  }

  /**
   * Convert Infix tokens to Postfix (RPN) via Shunting-Yard.
   */
  static toRPN(tokens: string[]): string[] {
    const output: string[] = [];
    const ops: string[] = [];

    for (const token of tokens) {
      if (!isNaN(Number(token))) {
        output.push(token);
      } else if (this.FUNCTIONS.has(token)) {
        ops.push(token);
      } else if (token === ',') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
          output.push(ops.pop()!);
        }
      } else if (token === '(') {
        ops.push(token);
      } else if (token === ')') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
          output.push(ops.pop()!);
        }
        if (ops.length > 0 && ops[ops.length - 1] === '(') {
          ops.pop();
        }
        // If function is on top of op stack, pop it to output
        if (ops.length > 0 && this.FUNCTIONS.has(ops[ops.length - 1])) {
          output.push(ops.pop()!);
        }
      } else {
        // Operator
        const pCurrent = this.precedence(token);
        while (
          ops.length > 0 &&
          ops[ops.length - 1] !== '(' &&
          (this.precedence(ops[ops.length - 1]) > pCurrent ||
            (this.precedence(ops[ops.length - 1]) === pCurrent && !this.isRightAssociative(token)))
        ) {
          output.push(ops.pop()!);
        }
        ops.push(token);
      }
    }

    while (ops.length > 0) {
      output.push(ops.pop()!);
    }

    return output;
  }

  /**
   * Evaluates the expression safely without eval.
   */
  static evaluate(expression: string): number {
    const tokens = this.tokenize(expression);
    if (tokens.length === 0) {
      throw new Error('Empty or invalid mathematical expression.');
    }

    const rpn = this.toRPN(tokens);
    const stack: number[] = [];

    for (const tok of rpn) {
      if (!isNaN(Number(tok))) {
        stack.push(Number(tok));
      } else if (this.FUNCTIONS.has(tok)) {
        const val = stack.pop();
        if (val === undefined) throw new Error(`Missing argument for function ${tok}`);
        switch (tok) {
          case 'sqrt':
            if (val < 0) throw new Error('Square root of negative number.');
            stack.push(Math.sqrt(val));
            break;
          case 'abs':
            stack.push(Math.abs(val));
            break;
          case 'round':
            stack.push(Math.round(val));
            break;
          case 'floor':
            stack.push(Math.floor(val));
            break;
          case 'ceil':
            stack.push(Math.ceil(val));
            break;
          case 'ln':
          case 'log':
            if (val <= 0) throw new Error('Logarithm of non-positive number.');
            stack.push(Math.log(val));
            break;
          default:
            throw new Error(`Unsupported function: ${tok}`);
        }
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) {
          throw new Error(`Syntax error in expression near ${tok}`);
        }

        switch (tok) {
          case '+':
            stack.push(a + b);
            break;
          case '-':
            stack.push(a - b);
            break;
          case '*':
            stack.push(a * b);
            break;
          case '/':
            if (b === 0) throw new Error('Division by zero.');
            stack.push(a / b);
            break;
          case '%':
            stack.push(a % b);
            break;
          case '^':
            stack.push(Math.pow(a, b));
            break;
          default:
            throw new Error(`Unsupported operator: ${tok}`);
        }
      }
    }

    if (stack.length !== 1) {
      throw new Error('Malformed mathematical expression.');
    }

    return stack[0];
  }
}

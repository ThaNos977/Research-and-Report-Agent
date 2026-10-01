/**
 * Deterministic Arithmetic Expression Evaluator
 * Implements Dijkstra's Shunting-Yard algorithm & Reverse Polish Notation (RPN) evaluation.
 * STRICT SECURITY REQUIREMENT: Absolutely no `eval` or `Function` constructors are used.
 */

export class SafeCalculator {
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
   * Tokenize mathematical expressions, supporting decimals and unary negation.
   */
  static tokenize(expression: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const clean = expression.replace(/\s+/g, '');

    while (i < clean.length) {
      const char = clean[i];

      // Number or decimal
      if (/[0-9.]/.test(char)) {
        let numStr = '';
        while (i < clean.length && /[0-9.]/.test(clean[i])) {
          numStr += clean[i];
          i++;
        }
        tokens.push(numStr);
        continue;
      }

      // Operators or parentheses
      if (['+', '-', '*', '/', '^', '%', '(', ')'].includes(char)) {
        // Check for unary minus: preceded by start of string, open paren, or another operator
        if (char === '-') {
          const prev = tokens[tokens.length - 1];
          if (!prev || ['+', '-', '*', '/', '^', '%', '('].includes(prev)) {
            // Unary minus: parse following number or insert 0 -
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
      } else if (token === '(') {
        ops.push(token);
      } else if (token === ')') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
          output.push(ops.pop()!);
        }
        if (ops.length > 0 && ops[ops.length - 1] === '(') {
          ops.pop();
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

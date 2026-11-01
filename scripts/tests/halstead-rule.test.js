import { describe, it, expect } from 'vitest';
import { Linter, RuleTester } from 'eslint';
import halstead, { halsteadDifficulty } from '../../eslint-rules/halstead.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

function tokensOf(code) {
  const linter = new Linter();
  linter.verify(code, { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });
  return linter.getSourceCode().ast.tokens;
}

describe('halsteadDifficulty', () => {
  it('matches a hand-computed value', () => {
    // Operators (8 distinct): function ( ) { return + ; }
    // Operands: f a a 1 -> N2 = 4, n2 = 3 -> D = 8/2 * 4/3
    expect(halsteadDifficulty(tokensOf('function f(a){return a+1;}'))).toBeCloseTo(16 / 3, 10);
  });

  it('is zero when there are no operands', () => {
    expect(halsteadDifficulty(tokensOf('() => {}'))).toBe(0);
  });
});

const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });

tester.run('halstead-difficulty', halstead, {
  valid: [
    { code: 'function f(a){return a+1;}', options: [6] },
    // Outer scores 6.75 alone; it would score 8.4 if the nested arrow counted.
    { code: 'function outer(){ const g = (x) => x * 2 + 1; return g; }', options: [7] },
  ],
  invalid: [
    {
      code: 'function f(a){return a+1;}',
      options: [5],
      errors: [{ messageId: 'tooDifficult', data: { value: '5.3', max: 5 } }],
    },
    {
      // Only the nested arrow exceeds the ceiling, so exactly one report.
      code: 'function outer(){ return (a, b) => a * b + a - b / a % b; }',
      options: [4],
      errors: [{ messageId: 'tooDifficult', line: 1, column: 26 }],
    },
  ],
});

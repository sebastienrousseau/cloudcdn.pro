/**
 * Local ESLint rule: Halstead difficulty per function.
 *
 * D = (n1 / 2) * (N2 / n2), counted on the function's own tokens (nested
 * functions are measured separately and excluded from their parent).
 * Operands are identifier and literal tokens; every other token (keywords
 * and punctuators) is an operator. This is the token-based variant used by
 * escomplex-style tools, so absolute values can differ slightly from other
 * implementations; the ceiling is what CI enforces.
 */

const OPERAND_TOKENS = new Set([
  'Identifier',
  'PrivateIdentifier',
  'Numeric',
  'String',
  'Template',
  'RegularExpression',
  'Boolean',
  'Null',
]);

export function halsteadDifficulty(tokens) {
  const operators = new Set();
  const operands = new Set();
  let operandCount = 0;
  for (const token of tokens) {
    const key = `${token.type}:${token.value}`;
    if (OPERAND_TOKENS.has(token.type)) {
      operands.add(key);
      operandCount += 1;
    } else {
      operators.add(key);
    }
  }
  if (operands.size === 0) return 0;
  return (operators.size / 2) * (operandCount / operands.size);
}

function ownTokens(sourceCode, frame) {
  const isNested = (token) =>
    frame.nested.some(([start, end]) => token.range[0] >= start && token.range[1] <= end);
  return sourceCode.getTokens(frame.node).filter((token) => !isNested(token));
}

const FUNCTION_NODES = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Enforce a maximum Halstead difficulty per function' },
    schema: [{ type: 'number', minimum: 0 }],
    messages: {
      tooDifficult: 'Function has a Halstead difficulty of {{value}}. Maximum allowed is {{max}}.',
    },
  },
  create(context) {
    const max = context.options[0] ?? 30;
    const { sourceCode } = context;
    const stack = [];

    const enter = (node) => {
      if (stack.length > 0) stack.at(-1).nested.push(node.range);
      stack.push({ node, nested: [] });
    };
    const exit = () => {
      const frame = stack.pop();
      const value = halsteadDifficulty(ownTokens(sourceCode, frame));
      if (value > max) {
        context.report({
          node: frame.node,
          messageId: 'tooDifficult',
          data: { value: value.toFixed(1), max },
        });
      }
    };

    const handlers = {};
    for (const type of FUNCTION_NODES) {
      handlers[type] = enter;
      handlers[`${type}:exit`] = exit;
    }
    return handlers;
  },
};

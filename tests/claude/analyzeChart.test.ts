import { describe, it, expect, vi } from 'vitest';
import { analyzeChart } from '../../src/claude/analyzeChart.js';

function fakeClientReturning(content: unknown[]) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } } as any;
}

describe('analyzeChart', () => {
  it('parses a tool_use response into a Signal', async () => {
    const client = fakeClientReturning([
      {
        type: 'tool_use',
        name: 'provide_signal',
        input: {
          trend: 'bullish',
          entry_price: 1.085,
          stop_loss: 1.08,
          take_profit_1: 1.09,
          take_profit_2: 1.095,
          take_profit_3: 1.1,
          rationale: 'Цена оттолкнулась от уровня поддержки.',
        },
      },
    ]);

    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result).toEqual({
      trend: 'bullish',
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      takeProfit2: 1.095,
      takeProfit3: 1.1,
      rationale: 'Цена оттолкнулась от уровня поддержки.',
    });
  });

  it('calls the API with model claude-sonnet-5 and the image as a base64 content block', async () => {
    const client = fakeClientReturning([
      {
        type: 'tool_use',
        name: 'provide_signal',
        input: {
          trend: 'neutral',
          entry_price: 1,
          stop_loss: 1,
          take_profit_1: 1,
          take_profit_2: 1,
          take_profit_3: 1,
          rationale: 'x',
        },
      },
    ]);

    await analyzeChart(client, 'abc123', 'image/jpeg');

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-5');
    expect(call.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
    });
  });

  it('throws when no tool_use block is returned', async () => {
    const client = fakeClientReturning([{ type: 'text', text: 'oops' }]);
    await expect(analyzeChart(client, 'base64data', 'image/png')).rejects.toThrow(
      'Claude did not return a tool_use block'
    );
  });
});

import { describe, it, expect, vi } from 'vitest';
import { analyzeChart } from '../../src/claude/analyzeChart.js';

function fakeClientReturning(content: unknown[]) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } } as any;
}

const FULL_INPUT = {
  trend: 'bearish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entry_price: 1.085,
  stop_loss: 1.09,
  take_profit_1: 1.08,
  take_profit_2: 1.075,
  take_profit_3: 1.07,
  key_points: [
    { text: 'Интерфейс торговой платформы идентифицирован.', status: 'ok' },
    { text: 'Обнаружена валютная пара: AUD/CHF.', status: 'ok' },
    { text: 'Свечная структура распознана.', status: 'ok' },
  ],
  rationale: 'Цена отбилась от сопротивления.',
};

function toolUse(input: unknown) {
  return [{ type: 'tool_use', name: 'provide_signal', input }];
}

describe('analyzeChart', () => {
  it('parses a tool_use response into a Signal', async () => {
    const result = await analyzeChart(fakeClientReturning(toolUse(FULL_INPUT)), 'base64data', 'image/png');

    expect(result).toEqual({
      trend: 'bearish',
      instrument: 'AUD/CHF',
      timeframe: 'M15',
      entryPrice: 1.085,
      stopLoss: 1.09,
      takeProfit1: 1.08,
      takeProfit2: 1.075,
      takeProfit3: 1.07,
      keyPoints: [
        { text: 'Интерфейс торговой платформы идентифицирован.', status: 'ok' },
        { text: 'Обнаружена валютная пара: AUD/CHF.', status: 'ok' },
        { text: 'Свечная структура распознана.', status: 'ok' },
      ],
      rationale: 'Цена отбилась от сопротивления.',
    });
  });

  it('normalises unreadable instrument and timeframe to null', async () => {
    const client = fakeClientReturning(toolUse({ ...FULL_INPUT, instrument: null, timeframe: '' }));
    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result.instrument).toBeNull();
    expect(result.timeframe).toBeNull();
  });

  it('defaults a key point to "ok" when the model omits or mangles the status', async () => {
    const client = fakeClientReturning(
      toolUse({ ...FULL_INPUT, key_points: [{ text: 'a' }, { text: 'b', status: 'warn' }, { text: 'c', status: 'x' }] })
    );
    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result.keyPoints).toEqual([
      { text: 'a', status: 'ok' },
      { text: 'b', status: 'warn' },
      { text: 'c', status: 'ok' },
    ]);
  });

  it('returns an empty keyPoints array when the model omits the field', async () => {
    const { key_points, ...withoutPoints } = FULL_INPUT;
    const result = await analyzeChart(fakeClientReturning(toolUse(withoutPoints)), 'base64data', 'image/png');

    expect(result.keyPoints).toEqual([]);
  });

  it('declares instrument, timeframe and key_points in the tool schema', async () => {
    const client = fakeClientReturning(toolUse(FULL_INPUT));
    await analyzeChart(client, 'abc', 'image/png');

    const schema = client.messages.create.mock.calls[0][0].tools[0].input_schema;
    expect(schema.properties.instrument).toBeDefined();
    expect(schema.properties.timeframe).toBeDefined();
    expect(schema.properties.key_points.type).toBe('array');
    expect(schema.required).toContain('key_points');
  });

  it('calls the API with model claude-sonnet-5 and the image as a base64 content block', async () => {
    const client = fakeClientReturning(toolUse(FULL_INPUT));
    await analyzeChart(client, 'abc123', 'image/webp');

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-5');
    expect(call.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: 'abc123' },
    });
  });

  it('throws when no tool_use block is returned', async () => {
    const client = fakeClientReturning([{ type: 'text', text: 'oops' }]);
    await expect(analyzeChart(client, 'base64data', 'image/png')).rejects.toThrow(
      'Claude did not return a tool_use block'
    );
  });
});

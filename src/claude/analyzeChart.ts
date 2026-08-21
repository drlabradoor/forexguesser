import type Anthropic from '@anthropic-ai/sdk';
import type { Signal } from '../types.js';

const SYSTEM_PROMPT = `Ты — опытный трейдинг-аналитик, специализирующийся на техническом анализе графиков форекс и
криптовалют. Тебе присылают скриншот графика цены (свечной или линейный). Внимательно изучи видимые на изображении
данные: название инструмента и таймфрейм в интерфейсе платформы, подписи цен на оси, форму последних свечей, видимые
уровни поддержки/сопротивления, видимые индикаторы (если есть).

Верни торговый сигнал: направление (bullish/bearish/neutral), цену входа, стоп-лосс и три уровня тейк-профита. Все
числовые уровни должны быть согласованы между собой и с видимым на графике диапазоном цен:
- Для bullish: stop_loss < entry_price < take_profit_1 < take_profit_2 < take_profit_3
- Для bearish: take_profit_3 < take_profit_2 < take_profit_1 < entry_price < stop_loss

Дополнительно:
- instrument — торговый инструмент так, как он подписан на графике, например "AUD/CHF" или "BTC/USD". Если подпись
  не читается — верни null. Не угадывай пару по форме свечей.
- timeframe — таймфрейм в нотации M1/M5/M15/M30/H1/H4/D1. Если он не виден на скриншоте — верни null.
- key_points — от 3 до 5 коротких утверждений на русском о том, что именно ты разглядел на скриншоте. status "ok"
  для того, что удалось распознать, status "warn" для того, что прочитать не удалось. Если instrument или timeframe
  вернулись как null, обязательно добавь соответствующий пункт со status "warn".
- rationale — обоснование сигнала на русском, 2-3 предложения, простым языком.`;

interface SignalToolInput {
  trend: 'bullish' | 'bearish' | 'neutral';
  instrument?: string | null;
  timeframe?: string | null;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  key_points?: { text: string; status?: string }[];
  rationale: string;
}

/** The model may signal "unreadable" as null, an empty string or the word "null". */
function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
}

export async function analyzeChart(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
): Promise<Signal> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: 'provide_signal',
        description: 'Возвращает торговый сигнал, извлечённый из скриншота графика',
        input_schema: {
          type: 'object',
          properties: {
            trend: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            instrument: {
              type: ['string', 'null'],
              description: 'Инструмент как подписан на графике, например "AUD/CHF". null, если не читается.',
            },
            timeframe: {
              type: ['string', 'null'],
              description: 'Таймфрейм в нотации M1/M5/M15/M30/H1/H4/D1. null, если не виден.',
            },
            entry_price: { type: 'number' },
            stop_loss: { type: 'number' },
            take_profit_1: { type: 'number' },
            take_profit_2: { type: 'number' },
            take_profit_3: { type: 'number' },
            key_points: {
              type: 'array',
              minItems: 3,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  status: { type: 'string', enum: ['ok', 'warn'] },
                },
                required: ['text', 'status'],
              },
            },
            rationale: { type: 'string' },
          },
          required: [
            'trend',
            'instrument',
            'timeframe',
            'entry_price',
            'stop_loss',
            'take_profit_1',
            'take_profit_2',
            'take_profit_3',
            'key_points',
            'rationale',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_signal' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Проанализируй этот график и дай торговый сигнал.' },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  const input = toolUse.input as SignalToolInput;
  return {
    trend: input.trend,
    instrument: normalizeOptional(input.instrument),
    timeframe: normalizeOptional(input.timeframe),
    entryPrice: input.entry_price,
    stopLoss: input.stop_loss,
    takeProfit1: input.take_profit_1,
    takeProfit2: input.take_profit_2,
    takeProfit3: input.take_profit_3,
    keyPoints: (input.key_points ?? []).map((point) => ({
      text: point.text,
      status: point.status === 'warn' ? 'warn' : 'ok',
    })),
    rationale: input.rationale,
  };
}

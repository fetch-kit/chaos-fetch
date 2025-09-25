import { describe, it, expect } from 'vitest';
import { failRandomly } from '../../src/middlewares/failRandomly';

describe('failRandomly middleware', () => {
  it('fails at the expected rate', async () => {
    const mw = failRandomly({ rate: 1, status: 418, body: 'fail' });
    let failed = 0;
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const ctx: any = {};
      await mw(ctx, async () => { ctx.res = 'ok'; });
      if (ctx.res && ctx.res.status === 418) {
        const text = await ctx.res.text();
        expect(text).toBe('fail');
        failed++;
      } else {
        ok++;
      }
    }
    expect(failed).toBe(10);
    expect(ok).toBe(0);
  });

  it('passes through when rate is 0', async () => {
    const mw = failRandomly({ rate: 0 });
    let failed = 0;
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const ctx: any = {};
      await mw(ctx, async () => { ctx.res = 'ok'; });
      if (ctx.res && ctx.res !== 'ok') {
        failed++;
      } else {
        ok++;
      }
    }
    expect(failed).toBe(0);
    expect(ok).toBe(10);
  });
});
